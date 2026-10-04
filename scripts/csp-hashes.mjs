#!/usr/bin/env node
// Collects sha256 hashes of every inline <script> in dist/ and writes them into the CSP line of public/_headers
// (between the HASHES markers), then regenerates vercel.json from public/_headers (Vercel does not read _headers).
// Run after a build that changed an inline script:
//   npm run build:astro && node scripts/csp-hashes.mjs --write && npm run build:astro
// Other modes:
//   node scripts/csp-hashes.mjs                 check only: exit 1 if public/_headers or vercel.json is out of date
//   node scripts/csp-hashes.mjs --sync-vercel   only regenerate vercel.json from public/_headers (no dist needed)
// check-dist.mjs fails the build if any inline script is not covered or vercel.json disagrees, so drift can't ship.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { inlineScriptBodies } from './lib/rules.mjs';
import { walk } from './lib/fsutil.mjs';
import { buildVercelConfig, serialiseVercelConfig } from './lib/headers.mjs';

const headersPath = path.resolve('public/_headers');
const vercelPath = path.resolve('vercel.json');
const write = process.argv.includes('--write');
const syncOnly = process.argv.includes('--sync-vercel');

let headers = fs.readFileSync(headersPath, 'utf8');
let hashCount = 0;
if (!syncOnly) {
  const hashes = new Set();
  for (const f of walk(path.resolve('dist'))) {
    if (!f.endsWith('.html')) continue;
    for (const body of inlineScriptBodies(fs.readFileSync(f, 'utf8'))) {
      hashes.add(`'sha256-${crypto.createHash('sha256').update(body).digest('base64')}'`);
    }
  }
  hashCount = hashes.size;
  const list = [...hashes].sort().join(' ');
  headers = headers.replace(/script-src 'self'(?: '[^']+')* ?;/, `script-src 'self' ${list};`);
}

const vercel = serialiseVercelConfig(buildVercelConfig(headers));
const headersCurrent = fs.readFileSync(headersPath, 'utf8') === headers;
const vercelCurrent = fs.existsSync(vercelPath) && fs.readFileSync(vercelPath, 'utf8') === vercel;

if (write || syncOnly) {
  if (!syncOnly) {
    fs.writeFileSync(headersPath, headers);
    console.log(`csp-hashes: wrote ${hashCount} hash(es) to public/_headers`);
  }
  fs.writeFileSync(vercelPath, vercel);
  console.log('csp-hashes: regenerated vercel.json from public/_headers');
} else {
  if (!headersCurrent) console.log('public/_headers: CSP script hashes are out of date');
  if (!vercelCurrent) console.log('vercel.json is missing or does not match public/_headers');
  process.exit(headersCurrent && vercelCurrent ? 0 : 1);
}
