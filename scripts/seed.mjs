#!/usr/bin/env node
// Create the example shortlinks from SAMPLES in worker.js, so a fresh deploy
// isn't a completely empty shortener. Existing slugs are left alone — this
// never overwrites a real link.
//
//   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... node scripts/seed.mjs
//
// The token needs Workers R2 Storage:Edit. Pass --bucket to target a bucket
// other than updog-links.

import { SAMPLES } from "../worker.js";

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const bucketArg = process.argv.indexOf("--bucket");
const bucket = bucketArg > -1 ? process.argv[bucketArg + 1] : "updog-links";

if (!account || !token) {
  console.error("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.");
  process.exit(1);
}

const base = `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${bucket}/objects`;
const auth = { Authorization: `Bearer ${token}` };

let created = 0;
let skipped = 0;

for (const [slug, destination] of SAMPLES) {
  const head = await fetch(`${base}/${encodeURIComponent(slug)}`, { headers: auth });
  if (head.ok) {
    console.log(`  skip    ${slug} (already exists)`);
    skipped++;
    continue;
  }

  const body = JSON.stringify({ slug, destination, created_at: new Date().toISOString() });
  const put = await fetch(`${base}/${encodeURIComponent(slug)}`, {
    method: "PUT",
    headers: { ...auth, "Content-Type": "application/json" },
    body,
  });

  if (put.ok) {
    console.log(`  created ${slug} -> ${destination}`);
    created++;
  } else {
    const detail = await put.text();
    console.error(`  FAILED  ${slug}: ${put.status} ${detail}`);
    process.exitCode = 1;
  }
}

console.log(`\n${created} created, ${skipped} already present, in bucket ${bucket}.`);
