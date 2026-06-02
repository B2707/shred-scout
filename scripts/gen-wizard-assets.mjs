/**
 * Generates the bundled wizard image assets (board-profile diagrams + category icons)
 * as PNGs, with zero dependencies (pure Node zlib + a hand-rolled PNG encoder).
 *
 * Run:  node scripts/gen-wizard-assets.mjs
 * Output: src/fixtures/assets/*.png  (shipped to dist/assets/ via tsup publicDir)
 *
 * These satisfy the "small image next to every selection option" requirement offline,
 * so they work in --demo and in terminals without network access.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'fixtures', 'assets');
mkdirSync(OUT_DIR, { recursive: true });

const W = 160, H = 100;
const BG = [18, 20, 26];        // dark slate, matches a dark terminal
const SNOW = [70, 78, 92];      // ground line
const BOARD = [56, 189, 248];   // cyan board
const ACCENT = [250, 204, 21];  // yellow accent

// ── tiny RGBA canvas ────────────────────────────────────────────────────────
function canvas() {
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = BG[0]; data[i * 4 + 1] = BG[1]; data[i * 4 + 2] = BG[2]; data[i * 4 + 3] = 255;
  }
  return data;
}
function px(d, x, y, c) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
}
function rect(d, x, y, w, h, c) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) px(d, xx, yy, c);
}
function disc(d, cx, cy, r, c) {
  for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++)
    if (xx * xx + yy * yy <= r * r) px(d, cx + xx, cy + yy, c);
}
function roundRect(d, x, y, w, h, r, c) {
  rect(d, x + r, y, w - 2 * r, h, c);
  rect(d, x, y + r, w, h - 2 * r, c);
  disc(d, x + r, y + r, r, c); disc(d, x + w - r - 1, y + r, r, c);
  disc(d, x + r, y + h - r - 1, r, c); disc(d, x + w - r - 1, y + h - r - 1, r, c);
}
// Draw a board profile curve: yOffset(t) in pixels above the ground line, t in [0,1].
function drawProfile(d, yOffset) {
  const x0 = 16, x1 = W - 16, groundY = H - 22;
  rect(d, x0 - 4, groundY + 7, x1 - x0 + 8, 2, SNOW); // ground line
  const thickness = 7;
  for (let x = x0; x <= x1; x++) {
    const t = (x - x0) / (x1 - x0);
    let y = groundY - yOffset(t);
    // upturned tips on both ends (snowboard nose/tail)
    if (t < 0.08) y -= (0.08 - t) * 130;
    if (t > 0.92) y -= (t - 0.92) * 130;
    for (let k = 0; k < thickness; k++) px(d, x, y - k, BOARD);
  }
  // contact-point ticks
  for (const t of [0.2, 0.8]) {
    const x = x0 + t * (x1 - x0);
    px(d, x, groundY + 4, ACCENT); px(d, x, groundY + 5, ACCENT);
  }
}

// ── PNG encoder ─────────────────────────────────────────────────────────────
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(d) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0; // no filter
    d.subarray(y * W * 4, (y + 1) * W * 4).forEach((b, i) => { raw[y * (1 + W * 4) + 1 + i] = b; });
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ── asset definitions ───────────────────────────────────────────────────────
const A = 30; // profile arch height
const profiles = {
  'profile-camber': (t) => 6 + A * Math.sin(Math.PI * t),                     // ends down, arch up
  'profile-rocker': (t) => 6 + A * (1 - Math.sin(Math.PI * t)),               // banana: middle down, tips up
  'profile-flat': () => 6,                                                     // flat
  'profile-hybrid': (t) => 6 + A * 0.6 * Math.sin(Math.PI * t) + (t < 0.25 || t > 0.75 ? 14 : 0), // camber mid + rocker tips
};

function categoryBoard(d) {
  roundRect(d, W / 2 - 16, 14, 32, H - 34, 14, BOARD);
  rect(d, W / 2 - 2, 18, 4, H - 42, BG);            // center stripe
  disc(d, W / 2, 38, 4, BG); disc(d, W / 2, H - 36, 4, BG); // binding inserts
}
function categoryBinding(d) {
  roundRect(d, W / 2 - 22, H - 44, 44, 24, 6, [148, 163, 184]); // baseplate
  rect(d, W / 2 - 20, 26, 40, 16, [100, 116, 139]);             // highback
  roundRect(d, W / 2 - 24, H - 58, 48, 8, 4, ACCENT);           // ankle strap
  roundRect(d, W / 2 - 24, H - 38, 48, 7, 3, ACCENT);           // toe strap
}
function categoryBoot(d) {
  rect(d, W / 2 - 14, 18, 26, 44, [120, 86, 58]);              // shaft
  roundRect(d, W / 2 - 14, 56, 52, 18, 6, [90, 64, 42]);       // foot
  for (let i = 0; i < 4; i++) { rect(d, W / 2 - 10, 24 + i * 8, 18, 2, ACCENT); } // laces
}
function categorySetup(d) {
  roundRect(d, W / 2 - 14, 12, 28, H - 30, 12, BOARD);          // board
  rect(d, W / 2 - 12, H / 2 - 9, 24, 18, [148, 163, 184]);     // binding
  rect(d, W / 2 - 12, H / 2 - 4, 24, 4, ACCENT);               // strap
}
const categories = {
  'cat-board': categoryBoard,
  'cat-binding': categoryBinding,
  'cat-boot': categoryBoot,
  'cat-setup': categorySetup,
};

let count = 0;
for (const [name, fn] of Object.entries(profiles)) {
  const d = canvas(); drawProfile(d, fn);
  writeFileSync(join(OUT_DIR, `${name}.png`), encodePNG(d)); count++;
}
for (const [name, fn] of Object.entries(categories)) {
  const d = canvas(); fn(d);
  writeFileSync(join(OUT_DIR, `${name}.png`), encodePNG(d)); count++;
}
console.log(`Wrote ${count} wizard assets to ${OUT_DIR}`);
