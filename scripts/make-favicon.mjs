/*
  Generates app/favicon.ico (16/32/48 px) and app/icon.svg from one vector
  source, so the browser tab, bookmark and home-screen icons match the
  in-app `.brand-mark` (lime rounded tile + pine padlock).

  Run: node scripts/make-favicon.mjs
*/

import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* ---------- brand colours (mirrors app/globals.css) ---------- */

const PINE = [0x07, 0x1f, 0x19]; // --pine-950
const LIME_TOP = [0xe4, 0xfb, 0xa4];
const LIME_MID = [0xc4, 0xee, 0x55];
const LIME_BOTTOM = [0xa9, 0xda, 0x3d];

/* ---------- tiny rasterizer (signed distance fields + supersampling) ---------- */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;

function roundedRectSdf(px, py, half, radius) {
  const qx = Math.abs(px) - (half - radius);
  const qy = Math.abs(py) - (half - radius);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - radius;
}

/**
 * Geometry is described in a unit box: x,y in [-1,1], y pointing down.
 * Vertical position is a fraction of the icon edge length.
 */
/* Mark geometry, in unit space (y down).
   Shackle: open arch from the top of the body up and over, with two legs.
   Body: rounded rectangle. Keyhole: punched back out of the body.

   `small` widens the keyhole and thins the shackle for 16px, where a
   literal 1:1 scale-down turns the keyhole into a smudge. */

function shackleSdf(x, y, small = false) {
  const thickness = small ? 0.105 : 0.12;
  const outer = Math.hypot(x, y + 0.295) - 0.245;
  const inner = Math.hypot(x, y + 0.295) - (0.245 - thickness);
  const legs = Math.max(Math.abs(x) - 0.245, -0.075 - y, y - 0.225);
  return Math.min(Math.max(outer, -inner), legs);
}

function bodySdf(x, y, small = false) {
  return roundedRectSdf(x, y - 0.225, small ? 0.43 : 0.42, 0.115);
}

function keyholeSdf(x, y, small = false) {
  const headR = small ? 0.135 : 0.098;
  const slotHalf = small ? 0.062 : 0.042;
  const head = Math.hypot(x, y - 0.125) - headR;
  const slot = Math.max(Math.abs(x) - slotHalf, 0.125 - y, y - 0.47);
  return Math.min(head, slot);
}

/** Union of the mark, with the keyhole subtracted. */
function markSdf(x, y, small = false) {
  const solid = Math.min(shackleSdf(x, y, small), bodySdf(x, y, small));
  return Math.max(solid, -keyholeSdf(x, y, small));
}

function coverage(sdf, x, y, size, samples) {
  let hits = 0;
  for (let sy = 0; sy < samples; sy++) {
    for (let sx = 0; sx < samples; sx++) {
      const ox = (sx + 0.5) / samples;
      const oy = (sy + 0.5) / samples;
      const px = -1 + (2 * (x + ox)) / size;
      const py = -1 + (2 * (y + oy)) / size;
      if (sdf(px, py) <= 0) hits++;
    }
  }
  return hits / (samples * samples);
}

function gradient(t) {
  const top = t < 0.55 ? mixColor(LIME_TOP, LIME_MID, t / 0.55) : mixColor(LIME_MID, LIME_BOTTOM, (t - 0.55) / 0.45);
  return top;
}

function mixColor(a, b, t) {
  return [
    Math.round(mix(a[0], b[0], t)),
    Math.round(mix(a[1], b[1], t)),
    Math.round(mix(a[2], b[2], t)),
  ];
}

/**
 * Render one square icon into straight (non-premultiplied) RGBA bytes.
 *
 * - small:  tuned for 16px (wider keyhole, thinner shackle)
 * - apple:  full-bleed square tile with an inset mark, because iOS applies
 *           its own corner mask to home-screen icons.
 */
function render(size, { small = false, apple = false } = {}) {
  const samples = size >= 48 ? 4 : size >= 32 ? 6 : 8;
  const radius = apple ? 0 : 0.42;
  const half = apple ? 1.02 : 0.94;
  const markScale = apple ? 0.78 : 1;
  const px = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Tile: rounded square covering the canvas, slightly inset.
      let tileHits = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const ux = -1 + (2 * (x + (sx + 0.5) / samples)) / size;
          const uy = -1 + (2 * (y + (sy + 0.5) / samples)) / size;
          if (roundedRectSdf(ux, uy, half, radius) <= 0) tileHits++;
        }
      }
      const tileA = tileHits / (samples * samples);

      const g = gradient(clamp01((y + 0.5) / size));
      // Composite the padlock (pine) onto the lime tile.
      const markA = coverage(
        (qx, qy) => markSdf(qx / markScale, qy / markScale, small),
        x,
        y,
        size,
        samples,
      );
      const i = (y * size + x) * 4;
      px[i] = Math.round(mix(g[0], PINE[0], markA));
      px[i + 1] = Math.round(mix(g[1], PINE[1], markA));
      px[i + 2] = Math.round(mix(g[2], PINE[2], markA));
      px[i + 3] = Math.round(tileA * 255);
    }
  }
  return px;
}

/* ---------- PNG encoding ---------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter: none
    rgba.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------- ICO container (PNG-compressed entries) ---------- */

function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(entries.length * 16);
  let offset = 6 + entries.length * 16;
  entries.forEach((entry, i) => {
    const o = i * 16;
    dir[o] = entry.size >= 256 ? 0 : entry.size;
    dir[o + 1] = entry.size >= 256 ? 0 : entry.size;
    dir[o + 2] = 0;
    dir[o + 3] = 0;
    dir.writeUInt16LE(1, o + 4); // colour planes
    dir.writeUInt16LE(32, o + 6); // bits per pixel
    dir.writeUInt32LE(entry.png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += entry.png.length;
  });

  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}

/* ---------- SVG twin, for the crisp modern-browser path ---------- */

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="ScopeLock">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#E4FBA4" />
      <stop offset="0.55" stop-color="#C4EE55" />
      <stop offset="1" stop-color="#A9DA3D" />
    </linearGradient>
  </defs>
  <rect x="0.96" y="0.96" width="30.08" height="30.08" rx="6.72" fill="url(#tile)" />
  <g fill="none" stroke="#071F19" stroke-width="1.92" stroke-linecap="round">
    <path d="M12.08 10.7a3.92 3.92 0 0 1 7.84 0" />
  </g>
  <rect x="9.28" y="10.98" width="13.44" height="13.44" rx="1.84" fill="#071F19" />
  <circle cx="16" cy="17.54" r="1.57" fill="url(#tile)" />
  <rect x="15.33" y="17.34" width="1.34" height="4.19" rx="0.67" fill="url(#tile)" />
</svg>
`;

/* ---------- main ---------- */

const sizes = [16, 32, 48];
const entries = sizes.map((size) => ({
  size,
  png: encodePng(size, render(size, { small: size < 32 })),
}));

await mkdir(path.join(root, "app"), { recursive: true });
await writeFile(path.join(root, "app", "favicon.ico"), encodeIco(entries));
await writeFile(path.join(root, "app", "icon.svg"), SVG, "utf8");
await writeFile(
  path.join(root, "app", "apple-icon.png"),
  encodePng(180, render(180, { apple: true })),
);
await writeFile(
  path.join(root, "app", "icon-512.png"),
  encodePng(512, render(512, { apple: true })),
);

console.log(
  "wrote app/favicon.ico (" + entries.map((e) => e.size).join("/") + "), app/icon.svg, app/apple-icon.png, app/icon-512.png",
);
