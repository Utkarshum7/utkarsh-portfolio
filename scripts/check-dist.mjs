#!/usr/bin/env node
// Post-build output scan: R7, R8, R9, R11, R12 on dist/, sitemap integrity, CSP coverage of inline scripts.
// Usage: node scripts/check-dist.mjs [--dist <dir>] [--require-site]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadGovernance } from './lib/governance.mjs';
import * as R from './lib/rules.mjs';
import { walk, report } from './lib/fsutil.mjs';

const TEXT_EXT = /\.(html|js|mjs|css|xml|txt|json|svg|webmanifest)$|(^|[\\/])_headers$|(^|[\\/])_redirects$/i;

export function checkDist({ dist, governance, approvedEmails = [], requireSite = false }) {
  const findings = [];
  const rel = (p) => path.relative(dist, p).split(path.sep).join('/');
  const files = [...walk(dist)];
  const textFiles = files.filter((f) => TEXT_EXT.test(f));
  const htmlFiles = textFiles.filter((f) => f.endsWith('.html'));
  const headersFile = path.join(dist, '_headers');
  const headers = fs.existsSync(headersFile) ? fs.readFileSync(headersFile, 'utf8') : '';
  if (!headers)
    findings.push({ rule: 'SEC', level: 'error', message: 'dist/_headers is missing (security headers)' });

  const allowed = governance.privatePatterns.allowedCredentials ?? [];
  const allowedTexts = allowed.map((a) => a.text);

  for (const file of textFiles) {
    const r = rel(file);
    const raw = fs.readFileSync(file, 'utf8');
    findings.push(...R.findSecrets(raw, { file: r, allowed: allowedTexts }));
    findings.push(...R.findPrivatePaths(raw, { file: r }));
    findings.push(...R.findLiterals(raw, governance.privatePatterns.literals, { file: r }));
    findings.push(...R.findNeverLink(raw, governance.neverLink, { file: r }));
    for (const a of allowed) {
      if (raw.includes(a.text) && !a.files.includes(r)) {
        findings.push({
          rule: 'R12',
          level: 'error',
          message: `Approved demo credential appears outside its approved page`,
          file: r,
        });
      }
    }
    if (r.endsWith('.html')) {
      const text = R.htmlVisibleText(raw);
      findings.push(...R.findDraftMarkers(text, { file: r }));
      findings.push(
        ...R.findCompanies(text, governance.unnamedCompanies.names, { file: r }).filter(
          (f) => f.level === 'error',
        ),
      );
      const hrefs = R.htmlHrefs(raw).join('\n');
      findings.push(
        ...R.findCompanies(hrefs, governance.unnamedCompanies.names, { file: r }).map((f) => ({
          ...f,
          level: 'warn',
        })),
      );
      findings.push(...R.findContactLeaks(text, { approvedEmails, file: r }));
      findings.push(...R.findGluedInline(raw, { file: r }));

      // CSP: every inline script must be hash-allowed in _headers
      for (const body of R.inlineScriptBodies(raw)) {
        const hash = `'sha256-${crypto.createHash('sha256').update(body).digest('base64')}'`;
        if (!headers.includes(hash)) {
          findings.push({
            rule: 'CSP',
            level: 'error',
            message: `Inline script not allowed by CSP (add ${hash} to public/_headers)`,
            file: r,
          });
        }
      }
      // Canonical must use the deployment origin
      const canonical = raw.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      if (!canonical && !r.startsWith('404'))
        findings.push({ rule: 'SEO', level: 'error', message: 'Missing canonical link', file: r });
      if (canonical && /localhost|127\.0\.0\.1/.test(canonical)) {
        findings.push({
          rule: 'SEO',
          level: requireSite ? 'error' : 'warn',
          message: `Canonical uses a local origin (${canonical}); set SITE_URL for deploy builds`,
          file: r,
        });
      }
    }
  }

  // Sitemap: exactly the public HTML routes (no 404, nothing extra)
  const routeOf = (f) => {
    const p =
      '/' +
      rel(f)
        .replace(/\.html$/, '')
        .replace(/(^|\/)index$/, '');
    return p === '/' ? '/' : p.replace(/\/$/, '');
  };
  const pages = new Set(htmlFiles.filter((f) => !/(^|[\\/])404\.html$/.test(f)).map(routeOf));
  const sitemaps = textFiles.filter((f) => /sitemap-\d+\.xml$/.test(f));
  if (!sitemaps.length) findings.push({ rule: 'SEO', level: 'error', message: 'No sitemap generated' });
  const locs = new Set();
  for (const s of sitemaps) {
    for (const m of fs.readFileSync(s, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const u = new URL(m[1]);
      locs.add(u.pathname.replace(/\/$/, '') || '/');
    }
  }
  for (const l of locs)
    if (!pages.has(l))
      findings.push({
        rule: 'SEO',
        level: 'error',
        message: `Sitemap lists a non-public or missing route: ${l}`,
      });
  for (const p of pages)
    if (!locs.has(p))
      findings.push({ rule: 'SEO', level: 'error', message: `Public route missing from sitemap: ${p}` });

  return { findings, files: files.length, pages: [...pages].sort() };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const i = process.argv.indexOf('--dist');
  const dist = path.resolve(i > -1 ? process.argv[i + 1] : 'dist');
  if (!fs.existsSync(dist)) {
    console.error('check-dist: dist/ not found; run the build first');
    process.exit(1);
  }
  const governance = loadGovernance();
  if (!governance.available)
    console.warn('⚠ governance data not found: R7, R8, R11 and private-literal checks skipped (local only).');
  const profileSrc = fs.readFileSync('src/data/profile.ts', 'utf8');
  const approvedEmails = [...profileSrc.matchAll(/email:\s*'([^']+)'/g)].map((m) => m[1].toLowerCase());
  const { findings, files, pages } = checkDist({
    dist,
    governance,
    approvedEmails,
    requireSite:
      process.argv.includes('--require-site') ||
      ['1', 'true'].includes(String(process.env.REQUIRE_SITE_URL ?? '').toLowerCase()),
  });
  process.exit(report('check-dist', findings, `${files} files, routes: ${pages.join(' ')}`) ? 0 : 1);
}
