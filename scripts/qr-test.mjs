#!/usr/bin/env node
// Round-trips text through qrMatrix in worker.js and a real QR decoder, across
// every version it supports, with the logo area blanked out as the page does.
//
//   npm install --no-save jsqr && node scripts/qr-test.mjs

import jsQR from "jsqr";
import { qrLogoBox, qrMatrix } from "../worker.js";

const SCALE = 4;
const QUIET = 4;

function decode(grid) {
  const { start, side } = qrLogoBox(grid.length);
  for (let y = start; y < start + side; y++) grid[y].fill(false, start, start + side);
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
// One string at each version's capacity, so all twenty versions get exercised.
const CAPACITY = [7, 14, 24, 34, 44, 58, 64, 84, 98, 119, 137, 155, 177, 194, 220, 250, 280, 310, 338, 382];
const filler = (n) => ("https://x.y/" + "z".repeat(400)).slice(0, n);
for (const n of CAPACITY) cases.push(filler(n));

let failed = 0;
for (const text of cases) {
  const grid = qrMatrix(text);
  const got = decode(grid);
  const ok = got === text;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} v${(grid.length - 17) / 4} ${text.length} chars`);
}

// Capacity is exact: one byte more moves to the next version.
CAPACITY.forEach((n, i) => {
  const lengths = i < CAPACITY.length - 1 ? [n, n + 1] : [n];
  const versions = lengths.map((len) => (qrMatrix(filler(len)).length - 17) / 4);
  const ok = versions[0] === i + 1 && (versions.length === 1 || versions[1] === i + 2);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} v${i + 1} holds exactly ${n} bytes`);
});

let threw = false;
try {
  qrMatrix("z".repeat(383));
} catch {
  threw = true;
}
console.log(`${threw ? "ok  " : "FAIL"} rejects 383 bytes`);
if (!threw) failed++;

process.exit(failed ? 1 : 0);
