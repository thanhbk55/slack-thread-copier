#!/usr/bin/env node
/**
 * Generates PNG icons for Slack Thread Copier Pro.
 * Run: node icons/generate.js
 * Output: icons/icon16.png  icon32.png  icon48.png  icon128.png
 */

const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

// ── CRC32 ──────────────────────────────────────────────────────────────────
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[i] = c;
}
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ── PNG builder ────────────────────────────────────────────────────────────
function pngChunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function makePNG(size, getPixel) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA

  const stride = size * 4;
  const raw = Buffer.alloc((1 + stride) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (1 + stride)] = 0; // filter = None
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = getPixel(x, y, size);
      const off = y * (1 + stride) + 1 + x * 4;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = a;
    }
  }
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Smooth-step for anti-aliasing ─────────────────────────────────────────
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// ── Signed-distance field for a rounded rectangle ─────────────────────────
// Returns negative value inside, positive outside.
function rrSDF(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - hw + r;
  const qy = Math.abs(y - cy) - hh + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

// ── Per-pixel icon renderer ────────────────────────────────────────────────
function iconPixel(px, py, size) {
  // Normalized coords at pixel centre
  const nx = (px + 0.5) / size;
  const ny = (py + 0.5) / size;
  const s = size; // shorthand for pixel conversions

  // Background: rounded rect with ~9% margin, ~20% corner radius
  const margin = 0.09;
  const rr = 0.20;
  const hw = 0.5 - margin - rr;
  const hh = 0.5 - margin - rr;
  const bgSDF = rrSDF(nx, ny, 0.5, 0.5, hw, hh, rr) * s;
  const bgAlpha = smoothstep(0.5, -0.5, bgSDF);
  if (bgAlpha <= 0) return [0, 0, 0, 0];

  // Copy icon: back page (stroke) top-right, front page (fill) bottom-left
  const bx1 = 0.35, by1 = 0.14, bx2 = 0.86, by2 = 0.65;
  const fx1 = 0.14, fy1 = 0.35, fx2 = 0.65, fy2 = 0.86;
  const sw = Math.max(0.07, 1.8 / s); // stroke width (min 1.8 px)

  const inFront = nx >= fx1 && nx <= fx2 && ny >= fy1 && ny <= fy2;
  const inBack = nx >= bx1 && nx <= bx2 && ny >= by1 && ny <= by2;
  const onBackStroke =
    inBack && (nx <= bx1 + sw || nx >= bx2 - sw || ny <= by1 + sw || ny >= by2 - sw);

  const isWhite = inFront || onBackStroke;
  const a = Math.round(bgAlpha * 255);
  return isWhite ? [255, 255, 255, a] : [97, 31, 105, a]; // white or #611f69
}

// ── Generate all sizes ─────────────────────────────────────────────────────
const outDir = __dirname;

for (const size of [16, 32, 48, 128]) {
  const png = makePNG(size, iconPixel);
  const outPath = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`✓ icon${size}.png  (${png.length} bytes)`);
}
console.log("Done!");
