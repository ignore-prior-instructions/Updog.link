#!/usr/bin/env node
// Round-trips text through qrMatrix in worker.js and a real QR decoder, across
// every version it supports.
//
//   npm install --no-save jsqr && node scripts/qr-test.mjs

import jsQR from "jsqr";
import { qrMatrix } from "../worker.js";

const SCALE = 4;
const QUIET = 4;

function decode(grid) {
  const size = (grid.length + QUIET * 2) * SCALE;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  grid.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < SCALE; dy++) {
        for (let dx = 0; dx < SCALE; dx++) {
          const i = (((y + QUIET) * SCALE + dy) * size + (x + QUIET) * SCALE + dx) * 4;
          pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
        }
      }
    }),
  );
  return jsQR(pixels, size, size)?.data;
}

const cases = [
  "https://updog.link/a",
  "https://updog.link/plucky-corgi",
  "https://updog.link/" + "x".repeat(64),
  "http://localhost:8787/zoomies-🐶",
];
// One string at each version's capacity, so all ten versions get exercised.
for (const n of [14, 26, 42, 62, 84, 106, 122, 152, 180, 213]) cases.push("https://x.y/" + "z".repeat(n - 12));

let failed = 0;
for (const text of cases) {
  const grid = qrMatrix(text);
  const got = decode(grid);
  const ok = got === text;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} v${(grid.length - 17) / 4} ${text.length} chars`);
}

let threw = false;
try {
  qrMatrix("z".repeat(214));
} catch {
  threw = true;
}
console.log(`${threw ? "ok  " : "FAIL"} rejects 214 bytes`);
if (!threw) failed++;

process.exit(failed ? 1 : 0);
