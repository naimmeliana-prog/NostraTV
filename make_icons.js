const fs = require('fs');
const zlib = require('zlib');

function createPng(width, height) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(8 + len + 4);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    
    const crcVal = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
    buf.writeUInt32BE(crcVal, 8 + len);
    return buf;
  }

  // Raw pixel data: 1 byte filter per line + width * 3 bytes
  const rawLines = [];
  for (let y = 0; y < height; y++) {
    const line = Buffer.alloc(1 + width * 3);
    line[0] = 0; // Filter 0
    for (let x = 0; x < width; x++) {
      // Sleek brand gradient (neon purple to cyan)
      const r = Math.min(255, Math.floor(139 - (x / width) * 40));
      const g = Math.min(255, Math.floor(92 + (y / height) * 80));
      const b = Math.min(255, Math.floor(246));
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

// CRC32 implementation
function crc32(buf) {
  let table = global.crcTable;
  if (!table) {
    table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
    global.crcTable = table;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Generate the specific webOS icon sizes:
// icon.png: 80x80
// largeIcon.png: 130x130
fs.writeFileSync('icon.png', createPng(80, 80));
fs.writeFileSync('largeIcon.png', createPng(130, 130));
console.log('[+] Generated icon.png (80x80) and largeIcon.png (130x130)');
