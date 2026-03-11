// Generates PWA icons (192x192 and 512x512 PNG) without external dependencies.
// Run once: node scripts/gen-icons.mjs
import { writeFileSync, mkdirSync } from 'fs';
import { deflateSync } from 'zlib';

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.allocUnsafe(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcBuf]);
}

function generatePng(size) {
  const BG   = [17, 24, 39];      // #111827 – dark background
  const BLUE = [59, 130, 246];    // #3b82f6 – brand blue

  // Design: three bar-chart bars of increasing height on dark bg
  const pad  = Math.floor(size * 0.18);
  const area = size - pad * 2;
  const gap  = Math.max(1, Math.floor(area * 0.06));
  const bw   = Math.floor((area - gap * 2) / 3);
  const bx   = [pad, pad + bw + gap, pad + (bw + gap) * 2];
  const bh   = [Math.floor(area * 0.40), Math.floor(area * 0.65), Math.floor(area * 0.90)];
  const bottom = size - pad;

  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0]; // filter type = None
    for (let x = 0; x < size; x++) {
      let colored = false;
      for (let b = 0; b < 3; b++) {
        if (x >= bx[b] && x < bx[b] + bw && y >= bottom - bh[b] && y < bottom) {
          colored = true;
          break;
        }
      }
      row.push(...(colored ? BLUE : BG));
    }
    rows.push(Buffer.from(row));
  }

  const raw = Buffer.concat(rows);
  const compressed = deflateSync(raw, { level: 9 });

  const ihdrData = Buffer.allocUnsafe(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // RGB
  ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    chunk('IHDR', ihdrData),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', generatePng(192));
writeFileSync('public/icons/icon-512.png', generatePng(512));
console.log('✓ public/icons/icon-192.png');
console.log('✓ public/icons/icon-512.png');
