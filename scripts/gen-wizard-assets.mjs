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

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'fixtures',
  'assets',
);
mkdirSync(OUT_DIR, { recursive: true });

const W = 160,
  H = 100;
const BG = [18, 20, 26]; // dark slate, matches a dark terminal
const SNOW = [70, 78, 92]; // ground line
const SNOWW = [232, 238, 245]; // white snow caps / snowflakes
const BOARD = [56, 189, 248]; // cyan board
const ACCENT = [250, 204, 21]; // yellow accent
const RAMP = [251, 146, 60]; // orange ramp/rail accent
const STEEL = [148, 163, 184]; // metal / coin rim
const GREEN = [34, 197, 94]; // beginner "green circle" trail symbol

// ── tiny RGBA canvas ────────────────────────────────────────────────────────
function canvas() {
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = BG[0];
    data[i * 4 + 1] = BG[1];
    data[i * 4 + 2] = BG[2];
    data[i * 4 + 3] = 255;
  }
  return data;
}
function px(d, x, y, c) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  d[i] = c[0];
  d[i + 1] = c[1];
  d[i + 2] = c[2];
  d[i + 3] = 255;
}
function rect(d, x, y, w, h, c) {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) px(d, xx, yy, c);
}
function disc(d, cx, cy, r, c) {
  for (let yy = -r; yy <= r; yy++)
    for (let xx = -r; xx <= r; xx++)
      if (xx * xx + yy * yy <= r * r) px(d, cx + xx, cy + yy, c);
}
function roundRect(d, x, y, w, h, r, c) {
  rect(d, x + r, y, w - 2 * r, h, c);
  rect(d, x, y + r, w, h - 2 * r, c);
  disc(d, x + r, y + r, r, c);
  disc(d, x + w - r - 1, y + r, r, c);
  disc(d, x + r, y + h - r - 1, r, c);
  disc(d, x + w - r - 1, y + h - r - 1, r, c);
}
// Draw a board profile curve: yOffset(t) in pixels above the ground line, t in [0,1].
function drawProfile(d, yOffset) {
  const x0 = 16,
    x1 = W - 16,
    groundY = H - 22;
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
    px(d, x, groundY + 4, ACCENT);
    px(d, x, groundY + 5, ACCENT);
  }
}

// ── extra primitives for the abstract option icons ──────────────────────────
function mountain(d, cx, baseY, halfW, height, color, capColor) {
  for (let i = 0; i < height; i++) {
    const w = Math.round(halfW * (1 - i / height));
    for (let x = cx - w; x <= cx + w; x++) px(d, x, baseY - i, color);
  }
  if (capColor) {
    const capStart = Math.round(height * 0.68);
    for (let i = capStart; i < height; i++) {
      const w = Math.round(halfW * (1 - i / height));
      for (let x = cx - w; x <= cx + w; x++) px(d, x, baseY - i, capColor);
    }
  }
}
function line(d, x0, y0, x1, y1, thick, color) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0),
    dy = Math.abs(y1 - y0),
    sx = x0 < x1 ? 1 : -1,
    sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  const t = Math.max(1, thick);
  for (;;) {
    for (let oy = 0; oy < t; oy++)
      for (let ox = 0; ox < t; ox++) px(d, x0 + ox, y0 + oy, color);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
}
function ring(d, cx, cy, r, thick, color) {
  for (let a = 0; a < 360; a += 2) {
    const rad = (a * Math.PI) / 180;
    for (let k = 0; k < thick; k++)
      px(d, cx + Math.cos(rad) * (r - k), cy + Math.sin(rad) * (r - k), color);
  }
}
function snowflake(d, x, y, color) {
  px(d, x, y, color);
  px(d, x - 1, y, color);
  px(d, x + 1, y, color);
  px(d, x, y - 1, color);
  px(d, x, y + 1, color);
}
function coin(d, cx, cy) {
  for (let yy = -7; yy <= 7; yy++)
    for (let xx = -20; xx <= 20; xx++) {
      if ((xx * xx) / (20 * 20) + (yy * yy) / (7 * 7) <= 1)
        px(d, cx + xx, cy + yy, ACCENT);
    }
  for (let xx = -20; xx <= 20; xx++) {
    px(d, cx + xx, cy - 7, STEEL);
    px(d, cx + xx, cy + 7, STEEL);
  }
}

// ── PNG encoder ─────────────────────────────────────────────────────────────
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(d) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0; // 8-bit RGBA
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0; // no filter
    d.subarray(y * W * 4, (y + 1) * W * 4).forEach((b, i) => {
      raw[y * (1 + W * 4) + 1 + i] = b;
    });
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── asset definitions ───────────────────────────────────────────────────────
const A = 30; // profile arch height
const profiles = {
  'profile-camber': (t) => 6 + A * Math.sin(Math.PI * t), // ends down, arch up
  'profile-rocker': (t) => 6 + A * (1 - Math.sin(Math.PI * t)), // banana: middle down, tips up
  'profile-flat': () => 6, // flat
  'profile-hybrid': (t) =>
    6 + A * 0.6 * Math.sin(Math.PI * t) + (t < 0.25 || t > 0.75 ? 14 : 0), // camber mid + rocker tips
};

function categoryBoard(d) {
  roundRect(d, W / 2 - 16, 14, 32, H - 34, 14, BOARD);
  rect(d, W / 2 - 2, 18, 4, H - 42, BG); // center stripe
  disc(d, W / 2, 38, 4, BG);
  disc(d, W / 2, H - 36, 4, BG); // binding inserts
}
function categoryBinding(d) {
  roundRect(d, W / 2 - 22, H - 44, 44, 24, 6, [148, 163, 184]); // baseplate
  rect(d, W / 2 - 20, 26, 40, 16, [100, 116, 139]); // highback
  roundRect(d, W / 2 - 24, H - 58, 48, 8, 4, ACCENT); // ankle strap
  roundRect(d, W / 2 - 24, H - 38, 48, 7, 3, ACCENT); // toe strap
}
function categoryBoot(d) {
  rect(d, W / 2 - 14, 18, 26, 44, [120, 86, 58]); // shaft
  roundRect(d, W / 2 - 14, 56, 52, 18, 6, [90, 64, 42]); // foot
  for (let i = 0; i < 4; i++) {
    rect(d, W / 2 - 10, 24 + i * 8, 18, 2, ACCENT);
  } // laces
}
function categorySetup(d) {
  roundRect(d, W / 2 - 14, 12, 28, H - 30, 12, BOARD); // board
  rect(d, W / 2 - 12, H / 2 - 9, 24, 18, [148, 163, 184]); // binding
  rect(d, W / 2 - 12, H / 2 - 4, 24, 4, ACCENT); // strap
}
const categories = {
  'cat-board': categoryBoard,
  'cat-binding': categoryBinding,
  'cat-boot': categoryBoot,
  'cat-setup': categorySetup,
};

// ── riding-style icons ──────────────────────────────────────────────────────
function styleAllMountain(d) {
  const base = H - 24;
  rect(d, 16, base, W - 32, 2, SNOW);
  mountain(d, W / 2 - 36, base, 20, 30, BOARD, SNOWW);
  mountain(d, W / 2, base, 28, 46, BOARD, SNOWW);
  mountain(d, W / 2 + 36, base, 20, 30, BOARD, SNOWW);
}
function stylePark(d) {
  const base = H - 24;
  rect(d, 16, base, W - 32, 2, SNOW);
  rect(d, W / 2 - 42, base - 24, 44, 5, STEEL); // rail
  rect(d, W / 2 - 40, base - 24, 3, 24, STEEL);
  rect(d, W / 2 - 2, base - 24, 3, 24, STEEL); // legs
  for (let i = 0; i < 28; i++) {
    const w = Math.round(28 * (i / 28));
    for (let x = W / 2 + 12; x <= W / 2 + 12 + w; x++) px(d, x, base - i, RAMP);
  } // ramp
}
function styleFreestyle(d) {
  const cx = W / 2,
    cy = H / 2 - 2;
  ring(d, cx, cy, 24, 4, ACCENT);
  line(d, cx + 2, cy - 24, cx + 16, cy - 21, 3, ACCENT);
  line(d, cx + 2, cy - 24, cx + 6, cy - 10, 3, ACCENT); // rotation arrowhead
}
function stylePowder(d) {
  const base = H - 24;
  rect(d, 16, base, W - 32, 2, SNOW);
  mountain(d, W / 2, base, 32, 48, BOARD, SNOWW);
  for (const [x, y] of [
    [36, 24],
    [124, 18],
    [58, 42],
    [112, 48],
    [80, 14],
    [30, 52],
  ])
    snowflake(d, x, y, SNOWW);
}
function styleFreeride(d) {
  const base = H - 24;
  rect(d, 16, base, W - 32, 2, SNOW);
  mountain(d, W / 2 + 8, base, 36, 58, BOARD, SNOWW);
  for (let i = 0; i < 16; i++)
    if (i % 2 === 0) {
      const x = W / 2 + 34 - i * 4,
        y = base - 54 + i * 3.2;
      line(d, x, y, x - 3, y + 2, 2, RAMP);
    } // descent line
}
function styleBackcountry(d) {
  const base = H - 24;
  rect(d, 16, base, W - 32, 2, SNOW);
  mountain(d, W / 2, base, 30, 48, BOARD, SNOWW);
  const pole = W / 2,
    peakY = base - 48;
  rect(d, pole, peakY - 18, 2, 18, STEEL); // touring flag pole
  for (let i = 0; i < 10; i++) {
    const w = Math.round(14 * (1 - i / 10));
    for (let x = pole + 2; x <= pole + 2 + w; x++)
      px(d, x, peakY - 16 + i, RAMP);
  }
}
function styleBeginner(d) {
  disc(d, W / 2, H / 2 - 2, 24, GREEN);
} // universal green-circle (easiest) trail symbol
const styles = {
  'style-all-mountain': styleAllMountain,
  'style-park': stylePark,
  'style-freestyle': styleFreestyle,
  'style-powder': stylePowder,
  'style-freeride': styleFreeride,
  'style-backcountry': styleBackcountry,
  'style-beginner': styleBeginner,
};

// ── flex icons (board bowing under a centered load) ──────────────────────────
function flexBoard(d, bow, th) {
  const x0 = 20,
    x1 = W - 20,
    midY = H / 2 - 8;
  for (let x = x0; x <= x1; x++) {
    const t = (x - x0) / (x1 - x0);
    const y = Math.round(midY + bow * Math.sin(Math.PI * t));
    for (let k = 0; k < th; k++) px(d, x, y + k, BOARD);
  }
  rect(d, W / 2 - 9, Math.round(midY + bow) - 13, 18, 9, STEEL); // load
}
const flexes = {
  'flex-soft': (d) => flexBoard(d, 26, 7),
  'flex-medium': (d) => flexBoard(d, 12, 8),
  'flex-stiff': (d) => flexBoard(d, 3, 10),
};

// ── budget icons (coin stacks; an infinity ring pair for No limit) ───────────
function coinStack(d, n) {
  const cx = W / 2,
    base = H - 28,
    gap = 15;
  for (let i = 0; i < n; i++) coin(d, cx, base - i * gap);
}
function budgetAny(d) {
  const cy = H / 2 - 2;
  ring(d, W / 2 - 16, cy, 13, 3, ACCENT);
  ring(d, W / 2 + 16, cy, 13, 3, ACCENT);
}
const budgets = {
  'budget-u300': (d) => coinStack(d, 1),
  'budget-u500': (d) => coinStack(d, 2),
  'budget-u700': (d) => coinStack(d, 3),
  'budget-any': budgetAny,
};

let count = 0;
for (const [name, fn] of Object.entries(profiles)) {
  const d = canvas();
  drawProfile(d, fn);
  writeFileSync(join(OUT_DIR, `${name}.png`), encodePNG(d));
  count++;
}
for (const group of [categories, styles, flexes, budgets]) {
  for (const [name, fn] of Object.entries(group)) {
    const d = canvas();
    fn(d);
    writeFileSync(join(OUT_DIR, `${name}.png`), encodePNG(d));
    count++;
  }
}
console.log(`Wrote ${count} wizard assets to ${OUT_DIR}`);
