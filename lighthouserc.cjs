/**
 * Lighthouse CI: lab budgets for the production build (mobile preset, median of 3 runs).
 * Run after `npm run build` (and with no other `astro preview` running): `npm run lhci`.
 * Uses Playwright's Chromium when CHROME_PATH is not set.
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');

const BASE = 'http://127.0.0.1:4330';
const home = ['/'];
const caseStudies = ['/work/scopetrace', '/work/support-intelligence', '/work/resume-screener'];
const other = ['/work', '/about', '/colophon'];

// Prefer Playwright's headless shell (some Windows setups block launching the full chrome.exe from Node)
function playwrightChrome() {
  const full = chromium.executablePath();
  const root = path.resolve(path.dirname(full), '..', '..');
  const rev = path.basename(path.resolve(path.dirname(full), '..')).replace('chromium-', '');
  const shellDir = path.join(root, `chromium_headless_shell-${rev}`);
  if (fs.existsSync(shellDir)) {
    for (const sub of fs.readdirSync(shellDir)) {
      for (const exe of ['chrome-headless-shell.exe', 'chrome-headless-shell']) {
        const candidate = path.join(shellDir, sub, exe);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  return full;
}
process.env.CHROME_PATH ||= playwrightChrome();

const categories = {
  'categories:performance': ['error', { minScore: 0.95 }],
  'categories:accessibility': ['error', { minScore: 1 }],
  'categories:best-practices': ['error', { minScore: 1 }],
  'categories:seo': ['error', { minScore: 1 }],
};

const vitals = (lcp, fcp, tbt) => ({
  'largest-contentful-paint': ['error', { maxNumericValue: lcp, aggregationMethod: 'median-run' }],
  'first-contentful-paint': ['error', { maxNumericValue: fcp, aggregationMethod: 'median-run' }],
  'total-blocking-time': ['error', { maxNumericValue: tbt, aggregationMethod: 'median-run' }],
  'cumulative-layout-shift': ['error', { maxNumericValue: 0.02, aggregationMethod: 'median-run' }],
});

// Transfer-size budgets in bytes (resource-summary), mirroring the performance budget
const sizes = (total, requests) => ({
  'resource-summary:total:size': ['error', { maxNumericValue: total * 1024 }],
  'resource-summary:total:count': ['error', { maxNumericValue: requests }],
  'resource-summary:script:size': ['error', { maxNumericValue: 8 * 1024 }],
  'resource-summary:third-party:count': ['error', { maxNumericValue: 0 }],
  'resource-summary:font:count': ['error', { maxNumericValue: 4 }],
});

const re = (paths) =>
  `^${BASE.replace(/[.]/g, '\\.')}(${paths.map((p) => p.replace(/\//g, '\\/')).join('|')})$`;

module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npx astro preview --host 127.0.0.1 --port 4330',
      startServerReadyPattern: '4330',
      url: [...home, ...caseStudies, ...other].map((p) => BASE + p),
      numberOfRuns: 3,
      settings: {
        chromeFlags: '--headless=new --no-sandbox --disable-gpu',
        // The preview server does not send the production headers file; header-dependent audits are covered by check-dist
        skipAudits: ['csp-xss', 'has-hsts', 'origin-isolation', 'clickjacking-mitigation'],
      },
    },
    assert: {
      assertMatrix: [
        {
          matchingUrlPattern: re(home),
          assertions: { ...categories, ...vitals(1800, 1200, 50), ...sizes(430, 12) },
        },
        {
          matchingUrlPattern: re(caseStudies),
          assertions: { ...categories, ...vitals(2200, 1400, 100), ...sizes(750, 25) },
        },
        {
          matchingUrlPattern: re(other),
          assertions: { ...categories, ...vitals(2200, 1400, 100), ...sizes(300, 12) },
        },
      ],
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci/reports' },
  },
};
