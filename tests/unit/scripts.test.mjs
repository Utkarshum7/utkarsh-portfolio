// Integration tests for the check scripts against temporary fixture trees (fictional data only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { lintContent } from '../../scripts/lint-content.mjs';
import { checkDist } from '../../scripts/check-dist.mjs';
import { checkBudgets, classifyRoute, BUDGETS } from '../../scripts/check-budgets.mjs';
import { checkBoundary } from '../../scripts/check-repo-boundary.mjs';
import { loadGovernance } from '../../scripts/lib/governance.mjs';
import { classify, checkOne } from '../../scripts/check-status.mjs';
import { validateSnapshot } from '../../src/lib/status.ts';

const GOV = {
  neverLink: { repos: ['hidden-thing'], projectNames: ['Nightjar'] },
  unnamedCompanies: {
    names: ['Acmecorp'],
    allowedUrls: [{ url: 'https://acmecorp-demo.example.app/', company: 'Acmecorp', reason: 'test' }],
  },
  privatePatterns: {
    literals: ['PRIVATE_PLAN_DOC'],
    allowedCredentials: [{ text: 'demoPW123', files: ['work/demo.html'] }],
    forbiddenFiles: ['PRIVATE_PLAN_DOC'],
  },
};

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-'));
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return root;
}

const CLAIMS = '- id: ok.claim\n  status: VERIFIED\n  checked: 2026-09-30\n';
const HEADERS = "/*\n  Content-Security-Policy: script-src 'self';\n";
const page = (body, extra = '') =>
  `<!doctype html><html><head><link rel="canonical" href="https://example.org/x">${extra}</head><body>${body}</body></html>`;
const sitemap = (paths) =>
  `<urlset>${paths.map((p) => `<url><loc>https://example.org${p}</loc></url>`).join('')}</urlset>`;

// ------------------------------------------------------------------ lint-content
test('lint-content passes a clean tree', () => {
  const root = tree({
    'src/data/claims.yaml': CLAIMS,
    'src/content/projects/a.mdx':
      '---\ntitle: A\nchips: [ok.claim]\n---\nIt has <Claim id="ok.claim" /> and nothing else.\n',
  });
  const { findings } = lintContent({ root, governance: GOV, now: new Date('2026-10-01') });
  assert.deepEqual(
    findings.filter((f) => f.level === 'error'),
    [],
  );
});

test('lint-content fails on each violation type', () => {
  const cases = {
    R9: 'Text [VERIFY: owner, check]\n',
    R4: '<Claim id="does.not.exist" />\n',
    R10: 'We served 500+ users.\n',
    R7: 'See hidden-thing for details.\n',
    R11: 'Nightjar was my first app.\n',
    R8: 'Built for Acmecorp.\n',
    R12: 'Ref PRIVATE_PLAN_DOC here.\n',
  };
  for (const [rule, body] of Object.entries(cases)) {
    const root = tree({
      'src/data/claims.yaml': CLAIMS,
      'src/content/projects/a.mdx': `---\ntitle: A\n---\n${body}`,
    });
    const { findings } = lintContent({ root, governance: GOV, now: new Date('2026-10-01') });
    assert.ok(
      findings.some((f) => f.rule === rule && f.level === 'error'),
      `${rule} should fail, got ${JSON.stringify(findings.map((f) => f.rule))}`,
    );
  }
});

test('lint-content fails on secrets and private paths in source', () => {
  const key = 'AKIA' + 'Z'.repeat(16);
  const p = ['D:', 'work', 'secret', 'notes.txt'].join('\\');
  const root = tree({ 'src/data/claims.yaml': CLAIMS, 'src/data/x.ts': `const k = '${key}';\n// ${p}\n` });
  const { findings } = lintContent({ root, governance: GOV });
  assert.ok(findings.some((f) => f.rule === 'R12' && f.message.includes('Secret')));
  assert.ok(findings.some((f) => f.rule === 'R12' && f.message.includes('path')));
});

test('lint-content fails on a non-publishable claim status', () => {
  const root = tree({ 'src/data/claims.yaml': '- id: bad\n  status: UNVERIFIED\n  checked: 2026-09-30\n' });
  const { findings } = lintContent({ root, governance: GOV });
  assert.ok(findings.some((f) => f.rule === 'R2'));
});

// ------------------------------------------------------------------ check-dist
function distTree(extra = {}) {
  return tree({
    _headers: HEADERS,
    'index.html': page('<p>Hello. Mail me@example.org</p>'),
    'about.html': page('<p>About</p>'),
    '404.html': page('<p>Not found</p>'),
    'sitemap-0.xml': sitemap(['/', '/about']),
    ...extra,
  });
}
const runDist = (dist) => checkDist({ dist, governance: GOV, approvedEmails: ['me@example.org'] });

test('check-dist passes clean output', () => {
  const { findings } = runDist(distTree());
  assert.deepEqual(
    findings.filter((f) => f.level === 'error'),
    [],
  );
});

test('check-dist fails on leaks into output', () => {
  const cases = {
    'hidden repo': ['work.html', page('<a href="https://github.com/me/hidden-thing">x</a>')],
    'company in text': ['work.html', page('<p>Done for Acmecorp</p>')],
    'secret in js': ['_astro/a.js', 'const k="' + 'AKIA' + 'Y'.repeat(16) + '"'],
    'private path in css': [
      '_astro/a.css',
      '/* ' + ['', 'Users', 'someone', 'project', 'x'].join('/') + ' */',
    ],
    'private literal': ['work.html', page('<p>see PRIVATE_PLAN_DOC</p>')],
    'draft marker': ['work.html', page('<p>[VERIFY: owner, x]</p>')],
    'unapproved email': ['work.html', page('<p>other@example.org</p>')],
    'demo credential on wrong page': ['work.html', page('<p>demoPW123</p>')],
    'inline script without CSP hash': ['work.html', page('<p>x</p><script>alert(1)</script>')],
  };
  for (const [name, [file, content]] of Object.entries(cases)) {
    const sm = file.endsWith('.html') ? { 'sitemap-0.xml': sitemap(['/', '/about', '/work']) } : {};
    const { findings } = runDist(distTree({ [file]: content, ...sm }));
    assert.ok(
      findings.some((f) => f.level === 'error'),
      `${name} should fail`,
    );
  }
});

test('check-dist allows the approved demo credential only on its page', () => {
  const dist = distTree({
    'work/demo.html': page('<p>password demoPW123</p>'),
    'sitemap-0.xml': sitemap(['/', '/about', '/work/demo']),
  });
  assert.deepEqual(
    runDist(dist).findings.filter((f) => f.level === 'error'),
    [],
  );
});

test('check-dist fails when the sitemap and public routes disagree', () => {
  const extraRoute = runDist(distTree({ 'sitemap-0.xml': sitemap(['/', '/about', '/private-thing']) }));
  assert.ok(extraRoute.findings.some((f) => f.message.includes('non-public or missing route')));
  const missing = runDist(distTree({ 'sitemap-0.xml': sitemap(['/']) }));
  assert.ok(missing.findings.some((f) => f.message.includes('missing from sitemap')));
  const with404 = runDist(distTree({ 'sitemap-0.xml': sitemap(['/', '/about', '/404']) }));
  assert.ok(with404.findings.some((f) => f.message.includes('/404')));
});

test('check-dist fails without security headers', () => {
  const dist = distTree();
  fs.rmSync(path.join(dist, '_headers'));
  assert.ok(runDist(dist).findings.some((f) => f.rule === 'SEC'));
});

// ------------------------------------------------------------------ check-budgets
test('check-budgets classifies routes', () => {
  assert.equal(classifyRoute('index.html'), 'home');
  assert.equal(classifyRoute('work/scopetrace.html'), 'case');
  assert.equal(classifyRoute('about.html'), 'other');
});

test('check-budgets passes small pages and fails oversized assets', () => {
  const small = tree({
    'index.html': page('<p>hi</p>', '<script type="module" src="/_astro/a.js"></script>'),
    '_astro/a.js': 'console.log(1)',
  });
  assert.deepEqual(checkBudgets(small).findings, []);
  // Incompressible JS over the 8 KB home budget
  const noise = crypto.randomBytes(40_000).toString('base64');
  const big = tree({
    'index.html': page('<p>hi</p>', '<script type="module" src="/_astro/a.js"></script>'),
    '_astro/a.js': noise,
  });
  const f = checkBudgets(big).findings;
  assert.ok(
    f.some((x) => x.message.startsWith('js ')),
    JSON.stringify(f),
  );
  assert.ok(zlib.gzipSync(noise).length > BUDGETS.home.js);
});

test('check-budgets counts font files and image bytes', () => {
  const css = ['a', 'b', 'c', 'd'].map((n) => `@font-face{src:url(/_astro/f-latin-${n}.woff2)}`).join('');
  const files = {
    'index.html': page('<img src="/_astro/i.webp" alt="">', '<link rel="stylesheet" href="/_astro/s.css">'),
    '_astro/s.css': css,
    '_astro/i.webp': Buffer.alloc(400 * 1024),
  };
  for (const n of ['a', 'b', 'c', 'd']) files[`_astro/f-latin-${n}.woff2`] = Buffer.alloc(1000);
  const f = checkBudgets(tree(files)).findings.map((x) => x.message.split(' ')[0]);
  assert.ok(f.includes('fontFiles'));
  assert.ok(f.includes('images'));
});

// ------------------------------------------------------------------ check-repo-boundary
test('check-repo-boundary flags private files and content', () => {
  const root = tree({
    'README.md': 'Public readme',
    'governance/never-link.json': '{}',
    'notes/PRIVATE_PLAN_DOC.md': 'x',
    'tests/shot.png': 'png',
    'src/assets/ok.png': 'png',
    '.env': 'X=1',
    'build.log': 'log',
    'src/x.ts': 'const u = "https://github.com/me/hidden-thing";',
  });
  const files = [
    'README.md',
    'governance/never-link.json',
    'notes/PRIVATE_PLAN_DOC.md',
    'tests/shot.png',
    'src/assets/ok.png',
    '.env',
    'build.log',
    'src/x.ts',
  ];
  const f = checkBoundary({ root, files, governance: GOV }).filter((x) => x.level === 'error');
  const flagged = new Set(f.map((x) => x.file));
  for (const bad of [
    'governance/never-link.json',
    'notes/PRIVATE_PLAN_DOC.md',
    'tests/shot.png',
    '.env',
    'build.log',
    'src/x.ts',
  ]) {
    assert.ok(flagged.has(bad), `${bad} should be flagged`);
  }
  assert.ok(!flagged.has('README.md'));
  assert.ok(!flagged.has('src/assets/ok.png'));
});

// ------------------------------------------------------------------ governance loading
test('governance fails closed in CI when the secret is absent', () => {
  assert.throws(() =>
    loadGovernance({ env: { CI: 'true' }, cwd: fs.mkdtempSync(path.join(os.tmpdir(), 'g-')) }),
  );
  const local = loadGovernance({ env: {}, cwd: fs.mkdtempSync(path.join(os.tmpdir(), 'g-')) });
  assert.equal(local.available, false);
  const fromSecret = loadGovernance({ env: { CONTENT_GOVERNANCE_JSON: JSON.stringify(GOV) } });
  assert.equal(fromSecret.available, true);
  assert.deepEqual(fromSecret.neverLink.repos, ['hidden-thing']);
  // Every governance list must survive loading (a dropped list silently disables its check)
  assert.deepEqual(fromSecret.privatePatterns, GOV.privatePatterns);
  assert.deepEqual(fromSecret.unnamedCompanies, GOV.unnamedCompanies);
  assert.deepEqual(fromSecret.neverLink, GOV.neverLink);
});

// ------------------------------------------------------------------ status check
test('status: classification and graceful failure', async () => {
  assert.equal(classify({ ok: true, ms: 500 }), 'responding');
  assert.equal(classify({ ok: true, ms: 15_000 }), 'responding-after-cold-start');
  assert.equal(classify({ ok: false, ms: 90_000 }), 'not-responding');
  const failing = await checkOne('https://example.invalid/', {
    fetchImpl: async () => {
      throw new Error('ENOTFOUND');
    },
  });
  assert.equal(failing.ok, false);
  const server500 = await checkOne('https://example.invalid/', { fetchImpl: async () => ({ status: 500 }) });
  assert.equal(server500.ok, false);
});

test('status: snapshot validation hides malformed or stale data', () => {
  const now = new Date('2026-10-03T00:00:00Z');
  const ids = ['a', 'b'];
  const good = {
    checkedAt: '2026-10-02T06:00:00Z',
    results: [
      { id: 'a', status: 'responding', checkedAt: '2026-10-02T06:00:00Z' },
      { id: 'b', status: 'not-responding', checkedAt: '2026-10-02T06:00:00Z' },
    ],
  };
  assert.ok(validateSnapshot(good, ids, now));
  assert.equal(validateSnapshot(null, ids, now), null);
  assert.equal(validateSnapshot({ ...good, checkedAt: 'nope' }, ids, now), null);
  assert.equal(validateSnapshot({ ...good, checkedAt: '2026-09-01T00:00:00Z' }, ids, now), null);
  assert.equal(validateSnapshot({ ...good, results: [good.results[0]] }, ids, now), null);
  assert.equal(
    validateSnapshot(
      { ...good, results: [{ ...good.results[0], status: 'great' }, good.results[1]] },
      ids,
      now,
    ),
    null,
  );
});

test('governance: a blank, malformed or hollow CI secret fails closed with a precise message', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'g-'));
  const load = (value) => () =>
    loadGovernance({ env: { CI: 'true', GOVERNANCE_DIR: cwd, CONTENT_GOVERNANCE_JSON: value }, cwd });
  assert.throws(load(''), /set but empty/);
  assert.throws(
    load('{not json'),
    (e) => /not valid JSON \(9 characters\)/.test(e.message) && !e.message.includes('{not json'),
  );
  assert.throws(load('{}'), /empty required lists/);
  assert.throws(
    load(JSON.stringify({ ...GOV, neverLink: { repos: [], projectNames: [] } })),
    /neverLink\.repos/,
  );
  assert.throws(() => loadGovernance({ env: { CI: 'true', GOVERNANCE_DIR: cwd }, cwd }), /is not set/);
  // A complete secret still loads
  assert.equal(load(JSON.stringify(GOV))().source, 'secret');
});
