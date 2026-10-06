#!/usr/bin/env node
/**
 * Draws the extension icon (shield with a highlighted line of text) and writes
 * icons/icon16.png, icon48.png, icon128.png and icons/icon.svg. No dependencies.
 *
 *   node scripts/generate-icons.js
 *
 * The shield outline is the same one the popup header uses, so the toolbar icon
 * and the popup match. Small sizes drop the fine text lines and keep only the highlight.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const NAVY = [18, 26, 48];
const WHITE = [255, 255, 255];
const AMBER = [255, 200, 61];
const INK = [18, 26, 48];

// Shield outline on a 24-unit grid (same path as the popup's header icon).
function bezier(p0, p1, p2, p3, steps) {
  const out = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
    ]);
  }
  return out;
}
const SHIELD = [[12, 2], [20, 5], [20, 11]]
  .concat(bezier([20, 11], [20, 16], [16.5, 19.5], [12, 22], 24))
  .concat(bezier([12, 22], [7.5, 19.5], [4, 16], [4, 11], 24))
  .concat([[4, 5]]);

function inPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
  const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
}

// Colour at a point given in 24-unit icon coordinates; null = transparent.
function colorAt(ux, uy, small) {
  if (!inRoundRect(ux, uy, 0, 0, 24, 24, 5.2)) return null;
  // Shield, scaled to sit slightly inside the tile.
  const sx = (ux - 12) / 0.86 + 12, sy = (uy - 12) / 0.86 + 12;
  if (!inPolygon(sx, sy, SHIELD)) return NAVY;
  if (small) {
    if (inRoundRect(sx, sy, 7, 9.2, 17, 14.2, 1.2)) return AMBER;
    return WHITE;
  }
  if (inRoundRect(sx, sy, 7.5, 7.2, 16.5, 8.7, 0.75)) return INK; // text line
  if (inRoundRect(sx, sy, 7.2, 10.4, 16.8, 13.4, 0.9)) return AMBER; // highlighted line
  if (inRoundRect(sx, sy, 7.5, 15.1, 13.5, 16.6, 0.75)) return INK; // short text line
  return WHITE;
}

function render(size) {
  const small = size <= 32;
  const ss = size <= 32 ? 8 : 4;
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = colorAt(((x + (sx + 0.5) / ss) / size) * 24, ((y + (sy + 0.5) / ss) / size) * 24, small);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
        }
      }
      const i = (y * size + x) * 4;
      const n = ss * ss;
      if (a) { px[i] = Math.round(r / a); px[i + 1] = Math.round(g / a); px[i + 2] = Math.round(b / a); }
      px[i + 3] = Math.round((a / n) * 255);
    }
  }
  return px;
}

const CRC_TABLE = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

const dir = path.join(__dirname, "..", "icons");
fs.mkdirSync(dir, { recursive: true });
[16, 48, 128].forEach((size) => {
  fs.writeFileSync(path.join(dir, "icon" + size + ".png"), png(size, render(size)));
  console.log("icons/icon" + size + ".png");
});

const shieldPath = "M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3z";
fs.writeFileSync(
  path.join(dir, "icon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="128" height="128">
  <rect width="24" height="24" rx="5.2" fill="rgb(${NAVY})"/>
  <g transform="translate(12 12) scale(0.86) translate(-12 -12)">
    <path d="${shieldPath}" fill="#fff"/>
    <rect x="7.5" y="7.2" width="9" height="1.5" rx="0.75" fill="rgb(${INK})"/>
    <rect x="7.2" y="10.4" width="9.6" height="3" rx="0.9" fill="rgb(${AMBER})"/>
    <rect x="7.5" y="15.1" width="6" height="1.5" rx="0.75" fill="rgb(${INK})"/>
  </g>
</svg>
`
);
console.log("icons/icon.svg");
