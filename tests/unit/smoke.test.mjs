import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSmoke } from '../../scripts/smoke-test.mjs';

const ORIGIN = 'https://site.test';
const HEADERS = {
  'content-security-policy': "default-src 'self'; script-src 'self' 'sha256-abc'",
  'strict-transport-security': 'max-age=1',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=()',
  'cross-origin-opener-policy': 'same-origin',
};
const IMMUTABLE = 'public, max-age=31536000, immutable';
const page = (path, extra = '') =>
  `<link rel="canonical" href="${ORIGIN}${path}"><meta property="og:image" content="${ORIGIN}/og/default.png">${extra}`;
const DEMO =
  '<ul class="accounts"><li><code>analyst</code></li><li><code>auditor</code></li></ul> password demo12345';

function site(overrides = {}) {
  const routes = {
    '/': page('/', '<link rel="stylesheet" href="/_astro/site.abc123.css">'),
    '/_astro/site.abc123.css': 'body{}',
    '/work': page('/work'),
    '/work/scopetrace': page('/work/scopetrace', DEMO),
    '/work/support-intelligence': page('/work/support-intelligence'),
    '/work/resume-screener': page('/work/resume-screener'),
    '/about': page('/about'),
    '/colophon': page('/colophon'),
    '/sitemap-index.xml': '<loc>x</loc>',
    '/sitemap-0.xml': `<loc>${ORIGIN}/</loc><loc>${ORIGIN}/about</loc>`,
    '/robots.txt': `User-agent: *\nSitemap: ${ORIGIN}/sitemap-index.xml\n`,
    ...overrides.routes,
  };
  return async (url) => {
    const pathname = new URL(url).pathname;
    const headers = new Headers(overrides.headers ?? HEADERS);
    // Clean URLs: the .html and trailing-slash forms redirect to the extensionless page (unless a test overrides it)
    const redirects = { '/about.html': '/about', '/about/': '/about', ...overrides.redirects };
    if (redirects[pathname])
      return new Response(null, {
        status: 308,
        headers: { ...Object.fromEntries(headers), location: redirects[pathname] },
      });
    if (pathname.startsWith('/_astro/') && routes[pathname] !== undefined)
      headers.set('cache-control', overrides.assetCache ?? IMMUTABLE);
    const body = routes[pathname];
    if (body === undefined) return new Response('not found', { status: 404, headers });
    return new Response(body, { status: 200, headers });
  };
}
const failures = async (o) =>
  (await runSmoke(ORIGIN, { fetch: site(o) })).filter((r) => !r.ok).map((r) => r.name);

test('smoke: a correct deployment passes every check', async () => {
  assert.deepEqual(await failures(), []);
});

test('smoke: wrong origin, missing headers, 404s, secrets and credential leaks are all caught', async () => {
  const bad = async (o, name) => assert.ok((await failures(o)).includes(name), name);
  assert.ok(
    (await failures({ routes: { '/': '<link rel="canonical" href="http://localhost:4321/">' } })).some((n) =>
      n.startsWith('canonical'),
    ),
  );
  await bad({ headers: {} }, 'security headers present');
  await bad(
    { routes: { '/about': page('/about', 'key=AKIA' + '1'.repeat(16)) } },
    'no secret-like strings on /about',
  );
  await bad(
    { routes: { '/about': page('/about', 'login ' + ['org', 'admin'].join('')) } },
    'no admin credential on /about',
  );
  await bad(
    { routes: { '/about': page('/about', 'demo12345') } },
    'demo password only on the ScopeTrace page (/about)',
  );
  await bad(
    { routes: { '/work/scopetrace': page('/work/scopetrace', DEMO.replace('auditor', 'viewer')) } },
    'demo accounts are exactly analyst and auditor',
  );
  await bad({ routes: { '/work': undefined } }, 'GET /work → 200');
});

test('smoke: Vercel behaviours (clean URLs, trailing slash, asset caching, headers on the 404) are verified', async () => {
  const bad = async (o, name) => assert.ok((await failures(o)).includes(name), name);
  await bad({ redirects: { '/about.html': null } }, '/about.html redirects to /about');
  await bad({ redirects: { '/about/': null } }, '/about/ redirects to /about');
  await bad({ redirects: { '/about/': '/somewhere-else' } }, '/about/ redirects to /about');
  await bad(
    { assetCache: 'public, max-age=0, must-revalidate' },
    'hashed /_astro/ assets are cached immutably',
  );
  await bad({ routes: { '/': page('/') } }, 'hashed /_astro/ assets are cached immutably'); // no asset on the home page
  // A site that sends headers on pages but not on its 404 page is caught
  const noHeadersOn404 = async (url) => {
    const res = await site()(url);
    return res.status === 404 ? new Response('nf', { status: 404 }) : res;
  };
  const results = await runSmoke(ORIGIN, { fetch: noHeadersOn404 });
  assert.ok(results.some((r) => r.name === 'security headers also on the 404 page' && !r.ok));
});
