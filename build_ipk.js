const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const https = require('https');

const HLS_URL = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.8/dist/hls.min.js';
const HLS_LOCAL = path.join(__dirname, 'js', 'hls.min.js');

function createPng(width, height) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(8 + len + 4);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
    let crc = 0xffffffff;
    const headerBytes = Buffer.from(type, 'ascii');
    for (let i = 0; i < headerBytes.length; i++) {
      crc = table[(crc ^ headerBytes[i]) & 0xff] ^ (crc >>> 8);
    }
    for (let i = 0; i < data.length; i++) {
      crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }
    buf.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + len);
    return buf;
  }

  function isInsideTriangle(px, py, x1, y1, x2, y2, x3, y3) {
    const d1 = (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
    const d2 = (px - x3) * (y2 - y3) - (x2 - x3) * (py - y3);
    const d3 = (px - x1) * (y3 - y1) - (x3 - x1) * (py - y1);
    const has_neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    const has_pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
    return !(has_neg && has_pos);
  }

  const cx = width / 2;
  const cy = height / 2;
  const r0 = width * 0.18;
  const x1 = cx - r0 * 0.8;
  const y1 = cy - r0 * 1.1;
  const x2 = cx + r0 * 1.2;
  const y2 = cy;
  const x3 = cx - r0 * 0.8;
  const y3 = cy + r0 * 1.1;

  const rawLines = [];
  for (let y = 0; y < height; y++) {
    const line = Buffer.alloc(1 + width * 3);
    line[0] = 0;
    for (let x = 0; x < width; x++) {
      // Dark slate theme background (#0f1220)
      let r = 15;
      let g = 18;
      let b = 32;

      const distToCenter = Math.hypot(x - cx, y - cy);
      const circleRadius = width * 0.35;

      if (distToCenter <= circleRadius) {
        // Glowing cyan-purple gradient inside play circle
        r = Math.min(255, Math.floor(139 - (x / width) * 40));
        g = Math.min(255, Math.floor(92 + (y / height) * 80));
        b = Math.min(255, Math.floor(246));
      }

      // Draw glowing white play symbol inside
      if (isInsideTriangle(x, y, x1, y1, x2, y2, x3, y3)) {
        r = 255;
        g = 255;
        b = 255;
      }

      // Draw neon cyan border around play button
      if (Math.abs(distToCenter - circleRadius) < width * 0.035) {
        r = 6;
        g = 182;
        b = 212; // Cyan (#06b6d4)
      }

      line[1 + x * 3] = r;
      line[1 + x * 3 + 1] = g;
      line[1 + x * 3 + 2] = b;
    }
    rawLines.push(line);
  }

  const idatData = zlib.deflateSync(Buffer.concat(rawLines));
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', idatData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function downloadHls() {
  // Always rewrite icons with the latest glowing neon branding
  fs.writeFileSync(path.join(__dirname, 'icon.png'), createPng(80, 80));
  console.log('[+] Generated icon.png (80x80)');
  fs.writeFileSync(path.join(__dirname, 'largeIcon.png'), createPng(130, 130));
  console.log('[+] Generated largeIcon.png (130x130)');

  return new Promise((resolve, reject) => {
    if (fs.existsSync(HLS_LOCAL) && fs.statSync(HLS_LOCAL).size > 10000) {
      console.log('[+] hls.min.js already exists locally, skipping download.');
      return resolve();
    }
    console.log('[+] Downloading hls.min.js from CDN...');
    const file = fs.createWriteStream(HLS_LOCAL);
    https.get(HLS_URL, (resp) => {
      if (resp.statusCode === 301 || resp.statusCode === 302) {
        file.close();
        https.get(resp.headers.location, (r2) => {
          r2.pipe(file);
          file.on('finish', () => { file.close(); console.log('[+] hls.min.js downloaded OK.'); resolve(); });
        }).on('error', reject);
        return;
      }
      resp.pipe(file);
      file.on('finish', () => { file.close(); console.log('[+] hls.min.js downloaded OK.'); resolve(); });
    }).on('error', (e) => { fs.unlinkSync(HLS_LOCAL); reject(e); });
  });
}

function createTarHeader(filePath, size, typeflag = '0') {
  const buf = Buffer.alloc(512);
  buf.write(filePath, 0, 100, 'utf-8');
  buf.write(typeflag === '5' ? '0000755\0' : '0000644\0', 100, 8, 'ascii');
  buf.write('0000000\0', 108, 8, 'ascii');
  buf.write('0000000\0', 116, 8, 'ascii');
  buf.write(size.toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii');
  buf.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0', 136, 12, 'ascii');
  buf.write('        ', 148, 8, 'ascii');
  buf.write(typeflag, 156, 1, 'ascii');
  buf.write('ustar', 257, 5, 'ascii');
  buf.write('00', 263, 2, 'ascii');
  buf.write('root', 265, 4, 'ascii');
  buf.write('root', 297, 4, 'ascii');

  let checksum = 0;
  for (let i = 0; i < 512; i++) checksum += buf[i];
  buf.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return buf;
}

function packTar(fileMap) {
  const blocks = [];
  for (const [relPath, data] of Object.entries(fileMap)) {
    const isDir = data === null;
    const size = isDir ? 0 : data.length;
    const header = createTarHeader(relPath, size, isDir ? '5' : '0');
    blocks.push(header);
    if (!isDir && size > 0) {
      blocks.push(data);
      const padSize = (512 - (size % 512)) % 512;
      if (padSize > 0) blocks.push(Buffer.alloc(padSize));
    }
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

function createArHeader(name, size) {
  const buf = Buffer.alloc(60);
  buf.fill(' ');
  buf.write(name, 0, name.length, 'ascii');
  buf.write(Math.floor(Date.now() / 1000).toString(), 16, 12, 'ascii');
  buf.write('0', 28, 6, 'ascii');
  buf.write('0', 34, 6, 'ascii');
  buf.write('100644', 40, 8, 'ascii');
  buf.write(size.toString(), 48, 10, 'ascii');
  buf.write('`\n', 58, 2, 'ascii');
  return buf;
}

function buildIpkPackage() {
  try {
    const appId = 'com.nostratv.app';
    const prefix = `usr/palm/applications/${appId}/`;
    const appDir = path.resolve(__dirname);

    // Read version from appinfo.json (single source of truth)
    const appInfo = JSON.parse(fs.readFileSync(path.join(appDir, 'appinfo.json'), 'utf8'));
    const version = appInfo.version || '1.0.0';

    const controlContent = Buffer.from(
      `Package: ${appId}\n` +
      `Version: ${version}\n` +
      `Section: misc\n` +
      `Priority: optional\n` +
      `Architecture: all\n` +
      `Maintainer: NostraTV <info@nostratv.com>\n` +
      `Description: NOSTRA TV Native IPTV Application for LG webOS 6.x\n`
    );

    const controlTarGz = zlib.gzipSync(packTar({ './': null, './control': controlContent }));

    const appFiles = [
      'appinfo.json', 'index.html', 'sync.html', 'icon.png', 'largeIcon.png',
      'assets/logo.svg', 'css/style.css', 'js/hls.min.js', 'js/app.js', 'js/api.js',
      'js/epg.js', 'js/player.js', 'js/focus.js', 'js/storage.js',
      'js/ui.js', 'js/qr_sync.js'
    ];

    const dataMap = { 'usr/': null, 'usr/palm/': null, 'usr/palm/applications/': null, [prefix]: null };
    appFiles.forEach(rf => {
      const fp = path.join(appDir, rf);
      if (fs.existsSync(fp)) dataMap[`${prefix}${rf}`] = fs.readFileSync(fp);
    });

    const dataTarGz = zlib.gzipSync(packTar(dataMap));
    const debianBinary = Buffer.from('2.0\n');
    const arSignature = Buffer.from('!<arch>\n');

    function alignAr(b) { return (b.length % 2 !== 0) ? Buffer.concat([b, Buffer.from('\n')]) : b; }

    const ipkBuf = Buffer.concat([
      arSignature,
      createArHeader('debian-binary', debianBinary.length),
      alignAr(debianBinary),
      createArHeader('control.tar.gz', controlTarGz.length),
      alignAr(controlTarGz),
      createArHeader('data.tar.gz', dataTarGz.length),
      alignAr(dataTarGz)
    ]);

    const ipkPath = path.join(appDir, `com.nostratv.app_${version}_all.ipk`);
    fs.writeFileSync(ipkPath, ipkBuf);
    console.log(`[+] WebOS IPK v${version} generado: ${ipkPath}`);
  } catch (e) {
    console.error('[!] Error construyendo el paquete IPK:', e);
  }
}

downloadHls().then(buildIpkPackage).catch(e => {
  console.error('[!] Build failed:', e);
  process.exit(1);
});
