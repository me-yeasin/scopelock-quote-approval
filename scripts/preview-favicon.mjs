/*
  Dev helper: writes .tmp-icon/preview.png — an upscaled, white-backed copy of
  one entry from app/favicon.ico so the raster output can be eyeballed.
  Usage: node scripts/preview-favicon.mjs [size]
*/

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const want = Number(process.argv[2] ?? 48);

const ico = readFileSync(path.join(root, "app", "favicon.ico"));
const count = ico.readUInt16LE(4);
let png = null;
for (let i = 0; i < count; i++) {
  const o = 6 + i * 16;
  const size = ico[o] || 256;
  const len = ico.readUInt32LE(o + 8);
  const off = ico.readUInt32LE(o + 12);
  if (size === want) png = ico.subarray(off, off + len);
}
if (!png) throw new Error("no " + want + "px entry in favicon.ico");

let p = 8;
let w = 0;
const idat = [];
while (p < png.length) {
  const len = png.readUInt32BE(p);
  const type = png.toString("ascii", p + 4, p + 8);
  const data = png.subarray(p + 8, p + 8 + len);
  if (type === "IHDR") w = data.readUInt32BE(0);
  else if (type === "IDAT") idat.push(data);
  p += 12 + len;
}

const raw = inflateSync(Buffer.concat(idat));
const scale = Math.max(1, Math.round(288 / w));
const S = w * scale;
const out = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const sy = Math.floor(y / scale);
    const sx = Math.floor(x / scale);
    const i = sy * (w * 4 + 1) + 1 + sx * 4;
    const o = (y * S + x) * 4;
    const a = raw[i + 3] / 255;
    out[o] = Math.round(raw[i] * a + 255 * (1 - a));
    out[o + 1] = Math.round(raw[i + 1] * a + 255 * (1 - a));
    out[o + 2] = Math.round(raw[i + 2] * a + 255 * (1 - a));
    out[o + 3] = 255;
  }
}

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const rows = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  rows[y * (S * 4 + 1)] = 0;
  out.copy(rows, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}

mkdirSync(path.join(root, ".tmp-icon"), { recursive: true });
writeFileSync(
  path.join(root, ".tmp-icon", "preview.png"),
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]),
);
console.log(".tmp-icon/preview.png (" + S + "px, from " + want + "px)");
