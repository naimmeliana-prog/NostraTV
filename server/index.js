/**
 * NOSTRA TV - Node.js Wireless Upload & QR Sync Server
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../')));

// Middleware to ensure .ipk file is generated
app.use((req, res, next) => {
  try {
    buildIpkPackage();
  } catch (e) {}
  next();
});

// Server info endpoint (Local WiFi IP for QR sync)
app.get('/api/server-info', (req, res) => {
  res.json({ ip: getLocalIp() });
});

// Diagnostic endpoint to test Stalker Portal connection
app.get('/api/test-stalker', async (req, res) => {
  const http = require('http');
  const mac = '00:1A:79:74:B1:B9';
  const portalUrl = 'http://mag.greatott.me:80';
  const entryPoints = ['/c/server/load.php', '/server/load.php', '/portal.php', '/stalker_portal/server/load.php'];
  
  const results = [];
  for (const ep of entryPoints) {
    const targetUrl = `${portalUrl}${ep}?type=stb&action=handshake&mac=${mac}&stb_lang=en&timezone=Europe/London&JsHttpRequest=1-xml`;
    try {
      const respText = await new Promise((resolve, reject) => {
        http.get(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
            'X-User-Agent': 'Model: MAG250; Link: WiFi',
            'Cookie': `mac=${mac}; stb_lang=en; timezone=Europe/London`
          }
        }, (r) => {
          let data = '';
          r.on('data', c => data += c);
          r.on('end', () => resolve({ status: r.statusCode, body: data }));
        }).on('error', reject);
      });
      results.push({ ep, status: respText.status, body: respText.body });
    } catch (e) {
      results.push({ ep, error: e.message });
    }
  }
  res.json({ results });
});

// In-memory store for pending sync payloads by PIN code
const pendingSyncs = {};

// 1. Upload Playlist from Phone/PC
app.post('/api/sync/upload', (req, res) => {
  const { pin, playlist } = req.body;
  if (!pin || !playlist) {
    return res.status(400).json({ error: 'Falta el PIN o los datos de la playlist.' });
  }

  console.log(`[SyncServer] Received playlist for PIN: ${pin}`, playlist.name);
  pendingSyncs[pin] = playlist;

  return res.json({ success: true, message: 'Playlist enviada correctamente a la TV.' });
});

// 2. Poll Pending Sync Payload from LG WebOS App
app.get('/api/sync/check', (req, res) => {
  const { pin } = req.query;
  if (!pin || !pendingSyncs[pin]) {
    return res.json({ playlist: null });
  }

  const payload = pendingSyncs[pin];
  delete pendingSyncs[pin]; // Clear once consumed

  console.log(`[SyncServer] Playlist payload consumed by TV for PIN: ${pin}`);
  return res.json({ playlist: payload });
});

// Helper to get local WiFi IP address
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// GET /api/stalker-proxy
app.get('/api/stalker-proxy', async (req, res) => {
  const { url, mac, token } = req.query;
  if (!url || !mac) {
    return res.status(400).json({ error: 'Missing url or mac query parameter' });
  }

  const http = require('http');
  const https = require('https');
  const parsedUrl = new URL(url);
  const client = parsedUrl.protocol === 'https:' ? https : http;

  let cookie = `mac=${mac}; stb_lang=en; timezone=Europe/London`;
  if (token) cookie += `; token=${token}`;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
    'X-User-Agent': 'Model: MAG250; Link: WiFi',
    'Cookie': cookie
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const reqOptions = {
    method: 'GET',
    headers: headers,
    timeout: 10000
  };

  client.get(url, reqOptions, (proxyRes) => {
    res.status(proxyRes.statusCode);
    const headersToForward = ['content-type', 'content-encoding', 'content-length'];
    headersToForward.forEach(h => {
      if (proxyRes.headers[h]) {
        res.setHeader(h, proxyRes.headers[h]);
      }
    });
    proxyRes.pipe(res);
  }).on('error', (err) => {
    res.status(500).json({ error: err.message });
  });
});

// Auto-generate .ipk package for webOS DEV Manager
function buildIpkPackage() {
  try {
    const zlib = require('zlib');

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

    const appId = 'com.nostratv.app';
    const prefix = `usr/palm/applications/${appId}/`;
    const appDir = path.join(__dirname, '../');

    const controlContent = Buffer.from(
      `Package: ${appId}\n` +
      `Version: 1.0.0\n` +
      `Section: misc\n` +
      `Priority: optional\n` +
      `Architecture: all\n` +
      `Maintainer: NostraTV <info@nostratv.com>\n` +
      `Description: NOSTRA TV Native IPTV Application for LG webOS 6.x\n`
    );

    const controlTarGz = zlib.gzipSync(packTar({ './': null, './control': controlContent }));

    const appFiles = [
      'appinfo.json', 'index.html', 'sync.html', 'icon.png', 'largeIcon.png',
      'assets/logo.svg', 'css/style.css', 'js/app.js', 'js/api.js',
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

    const ipkPath = path.join(appDir, 'com.nostratv.app_1.0.0_all.ipk');
    fs.writeFileSync(ipkPath, ipkBuf);
    console.log(`[+] WebOS IPK generated successfully: ${ipkPath}`);
  } catch (e) {
    console.error('[!] Error building IPK package:', e);
  }
}

buildIpkPackage();

app.listen(PORT, () => {
  const localIp = getLocalIp();
  console.log('====================================================');
  console.log(`  NOSTRA TV Sync Backend running!                   `);
  console.log(`  Local TV App:   http://localhost:${PORT}          `);
  console.log(`  Mobile Sync:    http://${localIp}:${PORT}/sync.html`);
  console.log('====================================================');
});
