#!/usr/bin/env node
// Byte budgets per route (first load, compressed). Fails when any budget is exceeded.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { report } from './lib/fsutil.mjs';

const KB = 1024;
export const BUDGETS = {
  home: {
    html: 25 * KB,
    css: 20 * KB,
    js: 8 * KB,
    fontFiles: 3,
    fonts: 90 * KB,
    images: 330 * KB,
    total: 430 * KB,
  },
  case: {
    html: 50 * KB,
    css: 20 * KB,
    js: 20 * KB,
    fontFiles: 4,
    fonts: 120 * KB,
    images: 600 * KB,
    total: 750 * KB,
  },
  other: {
    html: 25 * KB,
    css: 20 * KB,
    js: 8 * KB,
    fontFiles: 3,
    fonts: 90 * KB,
    images: 150 * KB,
    total: 300 * KB,
  },
};

const gz = (buf) => zlib.gzipSync(buf, { level: 9 }).length;

export function classifyRoute(rel) {
  if (rel === 'index.html') return 'home';
  if (/^work\/[^/]+\.html$/.test(rel)) return 'case';
  return 'other';
}

/** Measures one HTML page and the assets it loads on first paint (lazy images counted too: worst case). */
export function measurePage(dist, rel) {
  const html = fs.readFileSync(path.join(dist, rel), 'utf8');
  const local = (u) => (u.startsWith('/') ? path.join(dist, decodeURIComponent(u.split('?')[0])) : null);
  const size = (p) => (p && fs.existsSync(p) ? fs.statSync(p).size : 0);
  const gzFile = (p) => (p && fs.existsSync(p) ? gz(fs.readFileSync(p)) : 0);

  const cssHrefs = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1]);
  const inlineCss = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('');
  const cssTexts = cssHrefs.map((h) =>
    local(h) && fs.existsSync(local(h)) ? fs.readFileSync(local(h), 'utf8') : '',
  );
  const css =
    cssHrefs.reduce((n, h) => n + gzFile(local(h)), 0) + (inlineCss ? gz(Buffer.from(inlineCss)) : 0);

  const jsSrcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  const inlineJs = [
    ...html.matchAll(/<script(?![^>]*src=)(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g),
  ]
    .map((m) => m[1])
    .join('');
  const js =
    jsSrcs.reduce((n, s) => n + gzFile(local(s)), 0) + (inlineJs.trim() ? gz(Buffer.from(inlineJs)) : 0);

  // Fonts: the Latin-subset WOFF2 files a Latin-only page actually downloads (other unicode ranges are skipped by browsers).
  const allCss = cssTexts.join('\n') + inlineCss;
  const fontUrls = new Set(
    [...allCss.matchAll(/url\(([^)]+\.woff2)\)/g)]
      .map((m) => m[1].replace(/["']/g, ''))
      .filter((u) => /latin-(?!ext)/.test(u) || !/(cyrillic|greek|vietnamese|latin-ext)/.test(u)),
  );
  const fontsBytes = [...fontUrls].reduce((n, u) => n + size(local(u)), 0);

  const imgSrcs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  const images = imgSrcs.reduce((n, s) => n + size(local(s)), 0);

  const htmlGz = gz(Buffer.from(html));
  return {
    html: htmlGz,
    css,
    js,
    fontFiles: fontUrls.size,
    fonts: fontsBytes,
    images,
    total: htmlGz + css + js + fontsBytes + images,
  };
}

export function checkBudgets(dist) {
  const findings = [];
  const rows = [];
  const pages = fs
    .readdirSync(dist, { recursive: true })
    .map((p) => String(p).split(path.sep).join('/'))
    .filter((p) => p.endsWith('.html'));
  for (const rel of pages.sort()) {
    const kind = classifyRoute(rel);
    const m = measurePage(dist, rel);
    rows.push({ rel, kind, ...m });
    for (const [k, limit] of Object.entries(BUDGETS[kind])) {
      if (m[k] > limit) {
        const unit = k === 'fontFiles' ? '' : ' B';
        findings.push({
          rule: 'BUDGET',
          level: 'error',
          message: `${k} ${m[k]}${unit} > ${limit}${unit} (${kind} budget)`,
          file: rel,
        });
      }
    }
  }
  return { findings, rows };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const dist = path.resolve('dist');
  const { findings, rows } = checkBudgets(dist);
  const k = (n) => (n / 1024).toFixed(1).padStart(6);
  console.log(
    'route'.padEnd(30),
    'html',
    '   css',
    '    js',
    ' fonts(n)',
    ' images',
    '  total  (KB, gzip; fonts/images raw)',
  );
  for (const r of rows)
    console.log(
      r.rel.padEnd(30),
      k(r.html),
      k(r.css),
      k(r.js),
      `${k(r.fonts)}(${r.fontFiles})`,
      k(r.images),
      k(r.total),
    );
  process.exit(report('check-budgets', findings, `${rows.length} pages within budget`) ? 0 : 1);
}
