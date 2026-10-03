// Unit tests for the validation rules. Fixture names are fictional; secret-like strings are assembled at runtime
// so that none appears literally in this repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../../scripts/lib/rules.mjs';

const rules = (findings) => findings.map((f) => f.rule);
const errors = (findings) => findings.filter((f) => f.level === 'error');

test('R9: draft markers are detected', () => {
  for (const marker of [
    '[VERIFY: owner, x]',
    '[CONFIRM: x]',
    '[DECIDE: y]',
    'text ⟦claim.id⟧',
    '⟨placeholder⟩',
    '> Note: internal',
  ]) {
    assert.deepEqual(
      rules(R.findDraftMarkers(`intro\n${marker}\n`)),
      ['R9']
        .concat(marker.includes('⟦') || marker.includes('⟨') ? ['R9'] : [])
        .slice(0, R.findDraftMarkers(marker).length),
    );
    assert.ok(R.findDraftMarkers(marker).length >= 1, marker);
  }
  assert.equal(R.findDraftMarkers('A normal sentence about verification.').length, 0);
});

test('R10: unsourced metrics fail, claimed or sourced ones pass', () => {
  assert.equal(errors(R.findUnsourcedMetrics('The system handles 99.9% uptime.')).length, 1);
  assert.equal(errors(R.findUnsourcedMetrics('It cut latency to 40 ms.')).length, 1);
  assert.equal(errors(R.findUnsourcedMetrics('We ran 120 tests in CI.')).length, 1);
  assert.equal(errors(R.findUnsourcedMetrics('Served 500+ users.')).length, 1);
  // Inside a Claim
  assert.equal(
    R.findUnsourcedMetrics('It reached <Claim id="x.y">56.5% accuracy</Claim> overall.').length,
    0,
  );
  assert.equal(R.findUnsourcedMetrics('Backend: <Claim id="x.tests" /> in CI.').length, 0);
  // Multi-line Claim
  assert.equal(
    R.findUnsourcedMetrics(
      '<Claim id="a.b" sidenote>In one run, 50 parsed\nand 33 passed (90% of them).</Claim>',
    ).length,
    0,
  );
  // Sourced block, ends at blank line
  const sourced = '{/* sourced: x.results */}\n| a | 56.5% |\n| b | 36.0% |\n\nUnsourced 12% here.';
  const f = R.findUnsourcedMetrics(sourced);
  assert.equal(f.length, 1);
  assert.equal(f[0].line, 5);
  // Exempt line
  assert.equal(
    R.findUnsourcedMetrics('{/* claim-exempt: example */}\nA "$4 of $5" and 80% example.').length,
    0,
  );
  // Attributes, code and URLs are not prose
  assert.equal(R.findUnsourcedMetrics('<img width="100%" /> `50%` https://x.test/50%').length, 0);
});

test('R10: strong unsupported claims fail', () => {
  assert.equal(errors(R.findUnsourcedMetrics('A production-grade platform.')).length, 1);
  assert.equal(errors(R.findUnsourcedMetrics('I am a passionate developer.')).length, 1);
  assert.equal(errors(R.findUnsourcedMetrics('It is blazing fast.')).length, 1);
  assert.equal(R.findUnsourcedMetrics('A carefully tested platform.').length, 0);
});

test('Claims registry: non-publishable status, duplicates and missing dates fail; stale claims warn', () => {
  const yaml = [
    '- id: a.ok',
    '  status: VERIFIED',
    '  checked: 2026-09-01',
    '- id: b.bad',
    '  status: UNVERIFIED',
    '  checked: 2026-09-01',
    '- id: a.ok',
    '  status: OWNER_CONFIRMED',
    '  checked: 2026-09-01',
    '- id: c.nodate',
    '  status: VERIFIED',
    '- id: d.old',
    '  status: VERIFIED',
    '  checked: 2025-01-01',
  ].join('\n');
  const entries = R.parseClaims(yaml);
  assert.equal(entries.length, 5);
  const f = R.checkClaimsRegistry(entries, { now: new Date('2026-10-01') });
  assert.ok(f.some((x) => x.rule === 'R2' && x.message.includes('b.bad')));
  assert.ok(f.some((x) => x.rule === 'R1' && x.message.includes('a.ok')));
  assert.ok(f.some((x) => x.rule === 'R3' && x.message.includes('c.nodate')));
  assert.ok(f.some((x) => x.rule === 'W1' && x.level === 'warn' && x.message.includes('d.old')));
});

test('R4: references to nonexistent claims fail', () => {
  const src = [
    '<Claim id="exists.one" />',
    '<EvidenceChip id="missing.two" />',
    "await getClaim('missing.three');",
    "  didClaim: 'exists.one',",
    '  - { claim: missing.four, what: "x" }',
    'chips: [exists.one, missing.five]',
    '{/* sourced: missing.six */}',
  ].join('\n');
  const refs = R.findClaimRefs(src);
  const f = R.checkClaimRefs(refs, new Set(['exists.one']));
  assert.deepEqual(f.map((x) => x.message.match(/"(.+)"/)[1]).sort(), [
    'missing.five',
    'missing.four',
    'missing.six',
    'missing.three',
    'missing.two',
  ]);
});

test('R7/R11: never-link repositories and hidden project names fail', () => {
  const gov = { repos: ['secret-side-project', 'Old.Notes'], projectNames: ['Project Nightjar'] };
  assert.equal(R.findNeverLink('see https://github.com/someone/secret-side-project', gov).length, 1);
  assert.equal(R.findNeverLink('Built Project Nightjar last year.', gov).length, 1);
  assert.equal(R.findNeverLink('the Old.Notes repo', gov).length, 1);
  assert.equal(R.findNeverLink('a not-secret-side-project-name? no: secret-side-projects', gov).length, 0);
  assert.equal(R.findNeverLink('Nothing hidden here.', gov).length, 0);
});

test('R8: unnamed companies fail in prose, warn inside URLs', () => {
  const names = ['Acmecorp'];
  assert.equal(errors(R.findCompanies('Built for Acmecorp as a take-home.', names)).length, 1);
  const url = R.findCompanies('Source: https://github.com/me/acmecorp-intern-task', names);
  assert.equal(url.length, 1);
  assert.equal(url[0].level, 'warn');
  assert.equal(R.findCompanies('Nothing to see.', names).length, 0);
});

test('R12: secret-like strings are detected (assembled at runtime)', () => {
  const samples = [
    'AKIA' + 'Q'.repeat(16),
    '-----BEGIN ' + 'RSA PRIVATE KEY-----',
    'sk-' + 'a1B2'.repeat(10),
    'sk-ant-' + 'x'.repeat(30),
    'AIza' + 'b'.repeat(35),
    'ghp_' + 'c'.repeat(36),
    'postgresql://user:' + 'hunter22' + '@db.example.com/x',
    'eyJ' + 'a'.repeat(12) + '.eyJ' + 'b'.repeat(12) + '.' + 'c'.repeat(12),
    'password = ' + 'Sup3rS3cretValue',
  ];
  for (const s of samples) assert.equal(R.findSecrets(`config\n${s}\n`).length >= 1, true, s.slice(0, 12));
  assert.equal(R.findSecrets('password: <set in your host>').length, 0);
  assert.equal(R.findSecrets('const token = process.env.TOKEN;').length, 0);
  assert.equal(R.findSecrets('A secret scan runs in CI.').length, 0);
  // Allow-list
  assert.equal(R.findSecrets('password = ' + 'demoPass99xx', { allowed: ['demoPass99xx'] }).length, 0);
});

test('R12: private filesystem paths are detected', () => {
  const win = ['C:', 'Users', 'someone', 'project', 'file.txt'].join('\\');
  assert.equal(R.findPrivatePaths(`see ${win}`).length >= 1, true);
  assert.equal(R.findPrivatePaths(['', 'Users', 'someone', 'Documents', 'x'].join('/')).length, 1);
  assert.equal(R.findPrivatePaths('file:' + '///tmp/x').length, 1);
  assert.equal(R.findPrivatePaths('src/components/Claim.astro and /work/scopetrace').length, 0);
});

test('R12: private literals are detected case-insensitively', () => {
  assert.equal(R.findLiterals('ref: Internal-Plan-Doc', ['internal-plan-doc']).length, 1);
  assert.equal(R.findLiterals('nothing', ['internal-plan-doc']).length, 0);
});

test('Contact leaks: unapproved e-mails and phone numbers fail', () => {
  const ok = 'Write to me@example.com';
  assert.equal(R.findContactLeaks(ok, { approvedEmails: ['me@example.com'] }).length, 0);
  assert.equal(R.findContactLeaks('or other@example.com', { approvedEmails: ['me@example.com'] }).length, 1);
  assert.equal(R.findContactLeaks('Call +91 98' + '765 43210', { approvedEmails: [] }).length, 1);
  assert.equal(R.findContactLeaks('Built in 2026 with 937 tests', { approvedEmails: [] }).length, 0);
});

test('HTML helpers: visible text excludes scripts and styles; inline script bodies exclude JSON-LD', () => {
  const html =
    '<p>Hi <b>there</b></p><script>var hidden=1</script><style>.x{}</style><script type="application/ld+json">{}</script><script src="/a.js"></script>';
  assert.equal(R.htmlVisibleText(html).trim(), 'Hi there');
  assert.deepEqual(R.inlineScriptBodies(html), ['var hidden=1']);
});

test('astroTemplateText strips frontmatter, style and script but keeps line numbers', () => {
  const src =
    '---\nconst a = "99%";\n---\n<p>ok</p>\n<style>.a{width:50%}</style>\n<script>let x = "5 ms"</script>\n<p>12% uptime</p>';
  const t = R.astroTemplateText(src);
  assert.equal(t.split('\n').length, src.split('\n').length);
  const f = R.findUnsourcedMetrics(t);
  assert.equal(f.length, 1);
  assert.equal(f[0].line, 7);
});

test('TYPO: words glued to inline elements fail; source markers and spaced text pass', () => {
  assert.equal(R.findGluedInline('<p>tested code.<a href="/x">Example</a></p>').length, 1);
  assert.equal(R.findGluedInline('<p>logs, and<span class="claim">a demo mode</span></p>').length, 1);
  assert.equal(R.findGluedInline('<p><a href="/x">Example</a>next</p>').length, 1);
  assert.equal(R.findGluedInline('<p>tested code. <a href="/x">Example</a>.</p>').length, 0);
  assert.equal(R.findGluedInline('<p>937 tests<a class="marker" href="/s">↗</a> run</p>').length, 0);
  assert.equal(R.findGluedInline('<script>a<a </script>').length, 0);
  assert.equal(R.findGluedInline('<p>I built <strong>ScopeTrace</strong>\n , an app</p>').length, 1);
  assert.equal(R.findGluedInline('<p>I built <strong>ScopeTrace</strong>, an app; 2 . 5</p>').length, 0);
});

test('R8: an explicitly allowlisted URL passes; unrelated company-name URLs and prose still fail', () => {
  const names = ['Acmecorp', 'Globex'];
  const allowedUrls = [{ url: 'https://acmecorp-demo.example.app/', company: 'Acmecorp', reason: 'test' }];
  const find = (text) => R.findCompanies(text, names, { allowedUrls });
  // The approved URL passes, with or without the trailing slash and inside an href
  assert.equal(find('Live: https://acmecorp-demo.example.app/').length, 0);
  assert.equal(find('<a href="https://acmecorp-demo.example.app">demo</a>').length, 0);
  // An arbitrary company-name URL still fails (warning), including the same company on another host or path
  assert.equal(find('Source: https://github.com/me/globex-take-home').length, 1);
  assert.equal(find('Source: https://github.com/me/acmecorp-take-home').length, 1);
  assert.equal(find('Live: https://acmecorp-demo.example.app/private/acmecorp').length, 1);
  assert.equal(find('Live: https://acmecorp-demo.example.app.evil.example/').length, 1);
  // The exemption is tied to its own company: it does not excuse a different name in the same URL
  assert.equal(
    find('Live: https://acmecorp-demo.example.app/ and https://globex-demo.example.app/').length,
    1,
  );
  // Prose mentions remain errors even when the allowlisted URL is on the same line
  const prose = find('Built for Acmecorp, live at https://acmecorp-demo.example.app/');
  assert.equal(prose.length, 1);
  assert.equal(prose[0].level, 'error');
  // Without any allowlist the same URL is reported
  assert.equal(R.findCompanies('Live: https://acmecorp-demo.example.app/', names).length, 1);
});

test('R8: the real governance allowlist (when available) is exact and narrow', async () => {
  const { loadGovernance } = await import('../../scripts/lib/governance.mjs');
  const gov = loadGovernance({ env: {} });
  if (!gov.available) return; // local-only check; CI loads the data from the secret
  const { names, allowedUrls } = gov.unnamedCompanies;
  assert.ok(allowedUrls.length >= 1);
  for (const a of allowedUrls) {
    assert.ok(a.reason, 'each exemption documents its reason in the private data');
    assert.ok(
      names.some((n) => n.toLowerCase() === a.company.toLowerCase()),
      'exemption names a governed company',
    );
    assert.equal(R.findCompanies('x ' + a.url, names, { allowedUrls }).length, 0, 'approved URL passes');
    const other = 'https://' + a.company.toLowerCase() + '-unrelated.example.com/';
    assert.equal(
      R.findCompanies(other, names, { allowedUrls }).length,
      1,
      'arbitrary same-company URL still warns',
    );
    assert.equal(
      R.findCompanies('Built for ' + a.company + ' ' + a.url, names, { allowedUrls })[0].level,
      'error',
    );
  }
});
