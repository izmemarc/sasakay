// Generates public/icon-192.png and public/icon-512.png as solid-green squares
// with a white jeepney-ish pictogram. Pure Node — no extra deps.
// Placeholder only; replace with a designed icon later.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "..", "public");
mkdirSync(outDir, { recursive: true });

const BG = [0x05, 0x96, 0x69]; // emerald-600
const FG = [0xff, 0xff, 0xff];

function renderPixels(size) {
  // RGBA buffer
  const px = Buffer.alloc(size * size * 4);
  // Fill background
  for (let i = 0; i < size * size; i++) {
    px[i * 4] = BG[0];
    px[i * 4 + 1] = BG[1];
    px[i * 4 + 2] = BG[2];
    px[i * 4 + 3] = 0xff;
  }
  // Rounded-rectangle "bus body" in white
  const padX = Math.round(size * 0.18);
  const padY = Math.round(size * 0.26);
  const bodyW = size - padX * 2;
  const bodyH = size - padY * 2;
  const radius = Math.round(size * 0.08);

  const inBody = (x, y) => {
    if (x < padX || x >= padX + bodyW) return false;
    if (y < padY || y >= padY + bodyH) return false;
    // corner rounding
    const rx = x - padX;
    const ry = y - padY;
    const corners = [
      [radius, radius],
      [bodyW - radius, radius],
      [radius, bodyH - radius],
      [bodyW - radius, bodyH - radius],
    ];
    for (const [cx, cy] of corners) {
      const inCornerBox =
        (rx < radius || rx >= bodyW - radius) &&
        (ry < radius || ry >= bodyH - radius);
      if (inCornerBox) {
        const dx = rx - cx;
        const dy = ry - cy;
        if (dx * dx + dy * dy > radius * radius) return false;
      }
    }
    return true;
  };

  const windowBand = (y) => {
    const relY = y - padY;
    return relY > Math.round(bodyH * 0.15) && relY < Math.round(bodyH * 0.45);
  };

  const wheel = (x, y) => {
    const wheelR = Math.round(size * 0.06);
    const wheelY = padY + bodyH - Math.round(size * 0.02);
    const leftX = padX + Math.round(bodyW * 0.25);
    const rightX = padX + Math.round(bodyW * 0.75);
    for (const cx of [leftX, rightX]) {
      const dx = x - cx;
      const dy = y - wheelY;
      if (dx * dx + dy * dy <= wheelR * wheelR) return true;
    }
    return false;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let paint = false;
      if (inBody(x, y)) {
        paint = true;
        // punch a window band back to bg for contrast
        if (windowBand(y)) {
          const relX = x - padX;
          const col = Math.floor((relX / bodyW) * 4);
          const inGap = relX % Math.round(bodyW / 4) < 4;
          if (!inGap && col >= 0 && col < 4) paint = false;
        }
      } else if (wheel(x, y)) {
        paint = true;
      }
      if (paint) {
        const i = (y * size + x) * 4;
        px[i] = FG[0];
        px[i + 1] = FG[1];
        px[i + 2] = FG[2];
        px[i + 3] = 0xff;
      }
    }
  }
  return px;
}

function crc32(buf) {
  return createHash("md5"); // not used; placeholder
}

// Real CRC-32 per PNG spec
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function pngCRC(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(pngCRC(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  // raw scanlines with filter byte 0
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

void crc32; // silence unused

for (const size of [192, 512]) {
  const rgba = renderPixels(size);
  const png = encodePNG(size, size, rgba);
  const outPath = resolve(outDir, `icon-${size}.png`);
  writeFileSync(outPath, png);
  console.log(`wrote ${outPath} (${png.length} bytes)`);
}

// Also write a matching SVG for <link rel="icon">
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#059669"/>
  <rect x="12" y="18" width="40" height="28" rx="5" fill="white"/>
  <rect x="16" y="23" width="7" height="8" fill="#059669"/>
  <rect x="25" y="23" width="7" height="8" fill="#059669"/>
  <rect x="34" y="23" width="7" height="8" fill="#059669"/>
  <rect x="43" y="23" width="5" height="8" fill="#059669"/>
  <circle cx="22" cy="48" r="4" fill="white"/>
  <circle cx="42" cy="48" r="4" fill="white"/>
</svg>`;
writeFileSync(resolve(outDir, "icon.svg"), svg);
console.log("wrote icon.svg");
