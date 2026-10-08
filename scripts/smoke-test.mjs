#!/usr/bin/env node
// Post-deployment smoke test. Read-only: issues GET requests against a deployed origin and reports pass/fail.
//   node scripts/smoke-test.mjs https://your-domain
//   SITE_URL=https://your-domain npm run smoke
// Requires no secrets and no private data. Exit code 1 if any check fails.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { findSecrets } from './lib/rules.mjs';

const PAGES = [
  '/',
  '/work',
  '/work/scopetrace',
  '/work/support-intelligence',
  '/work/resume-screener',
  '/code',
  '/skills',
  '/about',
  '/colophon',
];
const REQUIRED_HEADERS = [
  'content-security-policy',
  'strict-transport-security',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
  'cross-origin-opener-policy',
];
const REDIRECT = [301, 302, 307, 308];
const DEMO_PASSWORD = 'demo12345';
const DEMO_PAGE = '/work/scopetrace';
// Strings that must never appear on any page (admin credentials, private-account names)
const FORBIDDEN = [
  ['org', 'admin'],
  ['admin', '12345'],
  ['create', 'superuser'],
  ['django', ' admin'],
].map((parts) => new RegExp(parts.join(''), 'i'));

export async function runSmoke(base, { fetch: f = fetch } = {}) {
  const origin = new URL(base).origin;
  const results = [];
  const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail });
  const get = async (p) => {
    const res = await f(origin + p, { redirect: 'manual' });
    return { res, body: await res.text() };
  };

  const pages = {};
  for (const p of PAGES) {
    try {
      const { res, body } = await get(p);
      pages[p] = { res, body };
      check(`GET ${p} → 200`, res.status === 200, `got ${res.status}`);
    } catch (e) {
      check(`GET ${p} → 200`, false, String(e.message ?? e));
    }
  }

  try {
    const { res } = await get('/this-page-does-not-exist-smoke');
    check('Unknown route → 404', res.status === 404, `got ${res.status}`);
    const missing = REQUIRED_HEADERS.filter((h) => !res.headers.get(h));
    check('security headers also on the 404 page', missing.length === 0, `missing: ${missing.join(', ')}`);
  } catch (e) {
    check('Unknown route → 404', false, String(e.message ?? e));
  }

  // One URL per page: the .html file URL and the trailing-slash URL redirect to the extensionless one
  for (const [from, label] of [
    ['/about.html', '/about.html redirects to /about'],
    ['/about/', '/about/ redirects to /about'],
  ]) {
    try {
      const { res } = await get(from);
      const to = res.headers.get('location') ?? '';
      check(
        label,
        REDIRECT.includes(res.status) && new URL(to, origin).pathname === '/about',
        `got ${res.status} → ${to || 'no location'}`,
      );
    } catch (e) {
      check(label, false, String(e.message ?? e));
    }
  }

  for (const [p, label] of [
    ['/sitemap-index.xml', 'sitemap index'],
    ['/sitemap-0.xml', 'sitemap'],
    ['/robots.txt', 'robots.txt'],
  ]) {
    try {
      const { res, body } = await get(p);
      check(`${label} exists`, res.status === 200, `got ${res.status}`);
      if (p === '/sitemap-0.xml') {
        const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
        check(
          'sitemap lists only the production origin',
          locs.length > 0 && locs.every((l) => l.startsWith(origin + '/') || l === origin),
          locs.find((l) => !l.startsWith(origin)) ?? 'no entries',
        );
        check('sitemap excludes the 404 page', !locs.some((l) => /\/404$/.test(l)));
      }
      if (p === '/robots.txt')
        check(
          'robots.txt points at the production sitemap',
          body.includes(`Sitemap: ${origin}/sitemap-index.xml`),
        );
    } catch (e) {
      check(`${label} exists`, false, String(e.message ?? e));
    }
  }

  const home = pages['/'];
  const asset = home?.body.match(/["'](\/_astro\/[^"']+\.(?:woff2|css|js|webp))["']/)?.[1];
  if (home) {
    try {
      if (!asset) throw new Error('no /_astro/ asset found on the home page');
      const { res } = await get(asset);
      const cc = res.headers.get('cache-control') ?? '';
      check(
        'hashed /_astro/ assets are cached immutably',
        res.status === 200 && /max-age=31536000/.test(cc) && /immutable/.test(cc),
        `${asset}: ${res.status} ${cc}`,
      );
    } catch (e) {
      check('hashed /_astro/ assets are cached immutably', false, String(e.message ?? e));
    }
  }
  if (home) {
    const canonical = home.body.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    check('canonical uses the production origin', canonical === origin + '/', canonical ?? 'missing');
    const ogImage = home.body.match(/property="og:image" content="([^"]+)"/)?.[1];
    check('og:image uses the production origin', ogImage?.startsWith(origin + '/'), ogImage ?? 'missing');
    const headers = home.res.headers;
    const missing = REQUIRED_HEADERS.filter((h) => !headers.get(h));
    check(
      'security headers present',
      missing.length === 0,
      missing.length ? `missing: ${missing.join(', ')}` : '',
    );
    const csp = headers.get('content-security-policy') ?? '';
    check(
      'CSP has no wildcard script source',
      !/script-src[^;]*(\*|'unsafe-inline'|'unsafe-eval')/.test(csp),
    );
  }
  for (const p of PAGES) {
    const page = pages[p];
    if (!page) continue;
    const canonical = page.body.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? '';
    check(
      `canonical on ${p}`,
      canonical.startsWith(origin) && !/localhost|127\.0\.0\.1/.test(canonical),
      canonical || 'missing',
    );
    const secrets = findSecrets(page.body, { file: p, allowed: [DEMO_PASSWORD] });
    check(`no secret-like strings on ${p}`, secrets.length === 0, secrets.map((s) => s.message).join('; '));
    const bad = FORBIDDEN.find((re) => re.test(page.body));
    check(`no admin credential on ${p}`, !bad, bad ? String(bad) : '');
    if (p !== DEMO_PAGE)
      check(`demo password only on the ScopeTrace page (${p})`, !page.body.includes(DEMO_PASSWORD));
  }
  const demo = pages[DEMO_PAGE];
  if (demo) {
    check('ScopeTrace page shows the approved demo password', demo.body.includes(DEMO_PASSWORD));
    const accounts = demo.body.match(/class="accounts"[\s\S]*?<\/ul>/)?.[0] ?? '';
    const names = [...accounts.matchAll(/<code[^>]*>([^<]+)<\/code>/g)].map((m) => m[1].trim()).sort();
    check(
      'demo accounts are exactly analyst and auditor',
      names.join(',') === 'analyst,auditor',
      names.join(',') || 'none found',
    );
  }
  return results;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const base = process.argv[2] ?? process.env.SITE_URL;
  if (!base) {
    console.error('Usage: node scripts/smoke-test.mjs https://your-domain   (or set SITE_URL)');
    process.exit(2);
  }
  const results = await runSmoke(base);
  for (const r of results)
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok || !r.detail ? '' : `  (${r.detail})`}`);
  const failed = results.filter((r) => !r.ok);
  console.log(`\nsmoke-test: ${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
