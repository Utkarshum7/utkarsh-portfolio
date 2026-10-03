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
};
const page = (path, extra = '') =>
  `<link rel="canonical" href="${ORIGIN}${path}"><meta property="og:image" content="${ORIGIN}/og/default.png">${extra}`;
const DEMO =
  '<ul class="accounts"><li><code>analyst</code></li><li><code>auditor</code></li></ul> password demo12345';

function site(overrides = {}) {
  const routes = {
    '/': page('/'),
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
    const body = routes[new URL(url).pathname];
    const headers = new Headers(overrides.headers ?? HEADERS);
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
