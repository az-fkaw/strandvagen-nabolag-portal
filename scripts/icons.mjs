// `npm run icons`: draws the app icons, public/icons/<theme>-<size>.png, for
// every colour theme in portal.config.js. Run it after adding or changing a
// theme. Plain Node, no packages. The drawing is BrandMark's in
// public/js/lib.js (a roof over a wave), on a full square: phones round the
// corners themselves.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import config from "../portal.config.js";

const OUT = join(import.meta.dirname, "..", "public", "icons");
const SIZES = [180, 192, 512]; // 180: iPhone home screen; 192 and 512: Android and the rest

// The drawing, in a 32 x 32 box: white strokes 2.4 wide with round ends.
const STROKE = 2.4;
const ROOF = [[9, 15], [16, 9], [23, 15]];
const WAVE = bezierPoints([7, 21], [
  [[9.2, 21], [9.2, 19], [11.5, 19]],
  [[13.8, 19], [13.8, 21], [16, 21]],
  [[18.2, 21], [18.2, 19], [20.5, 19]],
  [[22.8, 19], [22.8, 21], [25, 21]],
]);
const SEGMENTS = [ROOF, WAVE].flatMap((line) => line.slice(1).map((p, i) => [line[i], p]));

// Each pixel: how much of it the strokes cover, blended from the theme colour to white.
function draw(size, hex) {
  const bg = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const scale = size / 32;
  const rows = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1); // each row starts with PNG filter byte 0
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / scale;
      const v = (y + 0.5) / scale;
      const near = u > 5 && u < 27 && v > 7 && v < 24;
      const d = near ? Math.min(...SEGMENTS.map(([a, b]) => distance(u, v, a, b))) : Infinity;
      const cover = Math.min(1, Math.max(0, (STROKE / 2 - d) * scale + 0.5));
      for (let c = 0; c < 3; c++) rows[row + 1 + x * 3 + c] = Math.round(bg[c] + (255 - bg[c]) * cover);
    }
  }
  return rows;
}

function distance(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Cubic Bézier curves as short straight pieces.
function bezierPoints(start, curves, steps = 16) {
  const points = [start];
  let p0 = start;
  for (const [p1, p2, p3] of curves) {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const s = 1 - t;
      points.push([0, 1].map((k) => s * s * s * p0[k] + 3 * s * s * t * p1[k] + 3 * s * t * t * p2[k] + t * t * t * p3[k]));
    }
    p0 = p3;
  }
  return points;
}

// A minimal PNG: 8-bit RGB, one compressed image chunk.
function png(size, rows) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

mkdirSync(OUT, { recursive: true });
for (const theme of config.themes)
  for (const size of SIZES) writeFileSync(join(OUT, `${theme.id}-${size}.png`), png(size, draw(size, theme.accent)));
console.log(`${config.themes.length * SIZES.length} icons written to public/icons/`);
