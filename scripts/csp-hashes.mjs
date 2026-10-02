#!/usr/bin/env node
// Collects sha256 hashes of every inline <script> in dist/ and writes them into the CSP line of public/_headers
// (between the HASHES markers). Run after a build that changed an inline script:
//   npm run build:astro && node scripts/csp-hashes.mjs --write && npm run build:astro
// check-dist.mjs fails the build if any inline script is not covered, so drift can't ship.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { inlineScriptBodies } from './lib/rules.mjs';
import { walk } from './lib/fsutil.mjs';

const dist = path.resolve('dist');
const headersPath = path.resolve('public/_headers');
const hashes = new Set();
for (const f of walk(dist)) {
  if (!f.endsWith('.html')) continue;
  for (const body of inlineScriptBodies(fs.readFileSync(f, 'utf8'))) {
    hashes.add(`'sha256-${crypto.createHash('sha256').update(body).digest('base64')}'`);
  }
}
const list = [...hashes].sort().join(' ');
const src = fs.readFileSync(headersPath, 'utf8');
const next = src.replace(/script-src 'self'(?: '[^']+')* ?;/, `script-src 'self' ${list};`);
if (process.argv.includes('--write')) {
  fs.writeFileSync(headersPath, next);
  console.log(`csp-hashes: wrote ${hashes.size} hash(es) to public/_headers`);
} else {
  console.log(list);
  process.exit(next === src ? 0 : 1);
}
