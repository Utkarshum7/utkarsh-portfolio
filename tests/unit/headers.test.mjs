// public/_headers is the single source of truth for response headers; vercel.json (which Vercel reads instead) is derived
// from it. These tests fail when the two disagree, so a change to one without the other cannot ship.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  REQUIRED_SECURITY_HEADERS,
  buildVercelConfig,
  checkVercelConfig,
  parseHeadersFile,
  serialiseVercelConfig,
  toVercelSource,
  vercelCsp,
} from '../../scripts/lib/headers.mjs';
import { checkDist } from '../../scripts/check-dist.mjs';

const SAMPLE = `# comment
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-AAA';
  X-Frame-Options: DENY

/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/*.html
  Cache-Control: public, max-age=0, must-revalidate
`;
const errors = (findings) => findings.filter((f) => f.level === 'error');
const clone = (o) => JSON.parse(JSON.stringify(o));

test('headers: the _headers format is parsed, comments ignored, values kept intact', () => {
  const rules = parseHeadersFile(SAMPLE);
  assert.deepEqual(
    rules.map((r) => [r.path, r.headers.length]),
    [
      ['/*', 2],
      ['/_astro/*', 1],
      ['/*.html', 1],
    ],
  );
  assert.equal(rules[0].headers[0].value, "default-src 'self'; script-src 'self' 'sha256-AAA';");
  assert.throws(() => parseHeadersFile('  Orphan: header\n'), /before any path/);
  assert.throws(() => parseHeadersFile('/*\n  no colon here\n'), /Malformed/);
});

test('headers: paths translate to Vercel sources; unsupported wildcards are refused, not guessed', () => {
  assert.equal(toVercelSource('/*'), '/(.*)');
  assert.equal(toVercelSource('/_astro/*'), '/_astro/(.*)');
  assert.equal(toVercelSource('/about'), '/about');
  assert.throws(() => toVercelSource('/*.html'), /Cannot translate/);
  assert.throws(() => toVercelSource('/a/*/b'), /Cannot translate/);
});

test('headers: the derived vercel.json has clean URLs, no trailing slash, and every header unchanged', () => {
  const config = buildVercelConfig(SAMPLE);
  assert.equal(config.cleanUrls, true);
  assert.equal(config.trailingSlash, false);
  assert.deepEqual(
    config.headers.map((h) => h.source),
    ['/(.*)', '/_astro/(.*)'],
  ); // /*.html is Vercel's default
  assert.equal(vercelCsp(config), "default-src 'self'; script-src 'self' 'sha256-AAA';");
  assert.equal(serialiseVercelConfig(config).endsWith('}\n'), true);
});

test('headers: the real vercel.json is exactly what public/_headers generates (no drift)', () => {
  const headersText = fs.readFileSync('public/_headers', 'utf8');
  const actual = fs.readFileSync('vercel.json', 'utf8');
  assert.equal(
    actual,
    serialiseVercelConfig(buildVercelConfig(headersText)),
    'run: node scripts/csp-hashes.mjs --write',
  );
  const config = JSON.parse(actual);
  assert.deepEqual(errors(checkVercelConfig(config, headersText)), []);
  // All seven security headers apply to every route, and the CSP is character-for-character the _headers one
  const all = config.headers.find((h) => h.source === '/(.*)').headers.map((h) => h.key);
  assert.deepEqual(all, REQUIRED_SECURITY_HEADERS);
  const cspLine = headersText.split('\n').find((l) => l.trim().startsWith('Content-Security-Policy:'));
  assert.equal(vercelCsp(config), cspLine.slice(cspLine.indexOf(':') + 1).trim());
  assert.equal(
    config.headers.find((h) => h.source === '/_astro/(.*)').headers[0].value,
    'public, max-age=31536000, immutable',
  );
});

test('headers: every way the two files can disagree is reported', () => {
  const good = buildVercelConfig(SAMPLE);
  assert.deepEqual(
    errors(checkVercelConfig(good, SAMPLE)).filter((f) => !/must apply/.test(f.message)),
    [],
  );
  const mutate = (fn) => {
    const c = clone(good);
    fn(c);
    return errors(checkVercelConfig(c, SAMPLE)).map((f) => f.message);
  };
  const csp = (c) => c.headers[0].headers[0];
  assert.ok(
    mutate((c) => (csp(c).value += ' evil.example')).some((m) =>
      /disagree on Content-Security-Policy/.test(m),
    ),
  );
  assert.ok(mutate((c) => c.headers[0].headers.pop()).some((m) => /missing X-Frame-Options/.test(m)));
  assert.ok(
    mutate((c) => c.headers[0].headers.push({ key: 'X-Extra', value: '1' })).some((m) => /X-Extra/.test(m)),
  );
  assert.ok(mutate((c) => c.headers.pop()).some((m) => /no headers for \/_astro/.test(m)));
  assert.ok(
    mutate((c) => c.headers.push({ source: '/x', headers: [{ key: 'A', value: 'b' }] })).some((m) =>
      /\/x/.test(m),
    ),
  );
  assert.ok(mutate((c) => (c.cleanUrls = false)).some((m) => /cleanUrls/.test(m)));
  assert.ok(mutate((c) => (c.trailingSlash = true)).some((m) => /trailingSlash/.test(m)));
  // A missing or unparsable file, and a security header lost from BOTH files, also fail
  assert.ok(errors(checkVercelConfig(null, SAMPLE)).some((f) => /missing or not valid JSON/.test(f.message)));
  const bothMissing = '/*\n  X-Frame-Options: DENY\n';
  assert.ok(
    errors(checkVercelConfig(buildVercelConfig(bothMissing), bothMissing)).some((f) =>
      /must apply Strict-Transport-Security/.test(f.message),
    ),
  );
});

// -------------------------------------------------------------- check-dist integration
const GOV = {
  neverLink: { repos: [], projectNames: [] },
  unnamedCompanies: { names: [], allowedUrls: [] },
  privatePatterns: { literals: [], allowedCredentials: [], forbiddenFiles: [] },
};
const FULL = `/*
  Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-ZZZ';
  Strict-Transport-Security: max-age=1
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=()
  Cross-Origin-Opener-Policy: same-origin
`;
function dist(headersText) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hd-'));
  const page =
    '<!doctype html><html><head><link rel="canonical" href="https://example.org/"></head><body><p>hi</p></body></html>';
  for (const [f, c] of Object.entries({
    _headers: headersText,
    'index.html': page,
    '404.html': page,
    'sitemap-0.xml': '<urlset><url><loc>https://example.org/</loc></url></urlset>',
  }))
    fs.writeFileSync(path.join(root, f), c);
  return root;
}
const run = (d, vercelConfig) =>
  errors(checkDist({ dist: d, governance: GOV, vercelConfig }).findings).map((f) => f.message);

test('check-dist: matching vercel.json passes; any drift, or a missing file, fails the build', () => {
  const d = dist(FULL);
  assert.deepEqual(run(d, buildVercelConfig(FULL)), []);
  assert.deepEqual(
    run(d, undefined),
    [],
    'the Vercel check is opt-in for callers that do not pass the config',
  );
  const drifted = buildVercelConfig(FULL.replace('no-referrer', 'unsafe-url'));
  assert.ok(run(d, drifted).some((m) => /disagree on Referrer-Policy/.test(m)));
  assert.ok(run(d, null).some((m) => /vercel\.json is missing/.test(m)));
});

test('check-dist: an inline script the vercel.json CSP does not allow fails, even if _headers allows it', () => {
  const body = 'console.log(1)';
  const hash = `'sha256-${crypto.createHash('sha256').update(body).digest('base64')}'`;
  const headersWith = FULL.replace("'sha256-ZZZ'", hash);
  const d = dist(headersWith);
  fs.writeFileSync(
    path.join(d, 'index.html'),
    `<!doctype html><html><head><link rel="canonical" href="https://example.org/"></head><body><script>${body}</script></body></html>`,
  );
  assert.deepEqual(run(d, buildVercelConfig(headersWith)), []);
  const stale = buildVercelConfig(FULL); // vercel.json still has the old hash
  const messages = run(d, stale);
  assert.ok(
    messages.some((m) => /not allowed by the CSP in vercel\.json/.test(m)),
    messages.join(' | '),
  );
});
