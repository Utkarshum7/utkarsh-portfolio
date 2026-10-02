#!/usr/bin/env node
// Renders the social-share image (1200×630 PNG) from an HTML template with the site's own fonts and tokens.
// Run after changing the positioning text: npm run og   → public/og/default.png (committed).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = process.cwd();
// Fonts are embedded as data URIs (a page created with setContent cannot load file:// fonts).
const font = (pkg, file) =>
  'data:font/woff2;base64,' +
  fs.readFileSync(path.join(root, 'node_modules/@fontsource', pkg, 'files', file)).toString('base64');
const out = path.join(root, 'public/og/default.png');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'Plex Sans';font-weight:400;src:url(${font('ibm-plex-sans', 'ibm-plex-sans-latin-400-normal.woff2')})}
@font-face{font-family:'Plex Sans';font-weight:600;src:url(${font('ibm-plex-sans', 'ibm-plex-sans-latin-600-normal.woff2')})}
@font-face{font-family:'Plex Mono';font-weight:400;src:url(${font('ibm-plex-mono', 'ibm-plex-mono-latin-400-normal.woff2')})}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#fafaf7;color:#16181b;font-family:'Plex Sans';position:relative;overflow:hidden}
.frame{position:absolute;inset:56px 72px;display:flex;flex-direction:column}
.label{font-family:'Plex Mono';font-size:22px;letter-spacing:.06em;text-transform:uppercase;color:#636973}
.rule{height:1px;background:#deded8;margin:28px 0 36px}
h1{font-weight:600;font-size:60px;line-height:1.15;letter-spacing:-.015em;max-width:1056px;text-wrap:balance}
.foot{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid #deded8;padding-top:24px}
.work{font-size:24px;color:#454a52}
.work b{color:#16181b;font-weight:600}
.mark{font-family:'Plex Mono';font-size:22px;color:#16181b;border-bottom:4px solid #b93c0e;padding-bottom:4px}
</style></head><body><div class="frame">
<p class="label">Utkarsh Amaresh · Backend engineer · Python · AI systems</p>
<div class="rule"></div>
<h1>I build backend systems where AI assists and deterministic code decides, and I measure whether it works.</h1>
<div class="foot"><p class="work">Case studies: <b>ScopeTrace</b> · <b>Delta Support Intelligence</b> · <b>AI Résumé Screener</b></p><p class="mark">UA</p></div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
fs.mkdirSync(path.dirname(out), { recursive: true });
await page.screenshot({ path: out, type: 'png' });
await browser.close();
console.log(`og image written: ${path.relative(root, out)} (${fs.statSync(out).size} bytes)`);
