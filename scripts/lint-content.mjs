#!/usr/bin/env node
// Pre-build content lint: R1–R4 (static), R7–R12 on source, W1.
// Exit 1 on any error. Usage: node scripts/lint-content.mjs [--root <dir>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGovernance } from './lib/governance.mjs';
import * as R from './lib/rules.mjs';
import { walk, report } from './lib/fsutil.mjs';

export function lintContent({ root, governance, now = new Date() }) {
  const findings = [];
  const rel = (p) => path.relative(root, p).split(path.sep).join('/');

  // Claims registry
  const claimsFile = path.join(root, 'src/data/claims.yaml');
  const entries = fs.existsSync(claimsFile) ? R.parseClaims(fs.readFileSync(claimsFile, 'utf8')) : [];
  for (const f of R.checkClaimsRegistry(entries, { now }))
    findings.push({ ...f, file: 'src/data/claims.yaml' });
  const ids = new Set(entries.map((e) => e.id));

  const files = [...walk(path.join(root, 'src')), ...walk(path.join(root, 'public'))].filter((f) =>
    /\.(astro|mdx|md|ts|mjs|js|json|yaml|yml|txt|svg|html|css|xml)$/i.test(f),
  );

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const r = rel(file);
    const isGenerated = r.startsWith('src/data/generated/');

    // R9 draft markers: every source file
    findings.push(...R.findDraftMarkers(text, { file: r }));
    // R4 static claim references
    findings.push(...R.checkClaimRefs(R.findClaimRefs(text), ids, { file: r }));
    // R10 metrics and strong claims in prose (MDX bodies and Astro templates)
    if (r.endsWith('.mdx')) findings.push(...R.findUnsourcedMetrics(R.mdxBody(text), { file: r }));
    if (r.endsWith('.astro') && (r.startsWith('src/pages/') || r.startsWith('src/layouts/'))) {
      findings.push(...R.findUnsourcedMetrics(R.astroTemplateText(text), { file: r }));
    }
    // R12 secrets, private paths, private literals
    if (!isGenerated) {
      findings.push(...R.findSecrets(text, { file: r }));
      findings.push(...R.findPrivatePaths(text, { file: r }));
    }
    findings.push(...R.findLiterals(text, governance.privatePatterns.literals, { file: r }));
    // R7 / R11 / R8
    findings.push(...R.findNeverLink(text, governance.neverLink, { file: r }));
    findings.push(...R.findCompanies(text, governance.unnamedCompanies.names, { file: r }));
  }
  return { findings, filesScanned: files.length, claims: entries.length };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const i = process.argv.indexOf('--root');
  const root = path.resolve(i > -1 ? process.argv[i + 1] : process.cwd());
  const governance = loadGovernance({ cwd: root });
  if (!governance.available)
    console.warn('⚠ governance data not found: R7, R8, R11 and private-literal checks skipped (local only).');
  const { findings, filesScanned, claims } = lintContent({ root, governance });
  const ok = report('lint-content', findings, `${filesScanned} files, ${claims} claims`);
  process.exit(ok ? 0 : 1);
}
