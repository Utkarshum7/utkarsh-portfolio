#!/usr/bin/env node
// Public/private repository boundary. Fails if private material, secrets, private paths, hidden project names or
// development artefacts are (or would be) committed. Checks tracked + untracked-but-not-ignored files.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadGovernance } from './lib/governance.mjs';
import * as R from './lib/rules.mjs';
import { walk, report } from './lib/fsutil.mjs';

/** Generic patterns for files that never belong in the public site repository. */
export const FORBIDDEN_PATHS = [
  { re: /(^|\/)governance\//i, why: 'private governance data' },
  { re: /(^|\/)security\//i, why: 'security remediation material' },
  { re: /(^|\/)\.env(\.(?!example$)[^/]*)?$/i, why: 'environment file' },
  { re: /\.(pem|key|p12|pfx|jks|keystore)$/i, why: 'key material' },
  { re: /(^|\/)id_(rsa|ed25519|ecdsa)(\.pub)?$/i, why: 'SSH key' },
  {
    re: /(^|\/)(dist|node_modules|\.astro|test-results|playwright-report|\.lighthouseci)\//,
    why: 'build or test output',
  },
  { re: /\.(output|log|dump|har)$/i, why: 'raw output or dump' },
  { re: /(^|\/)tool-results\//i, why: 'tool output' },
  { re: /(^|\/)(scratch|tmp|temp)\//i, why: 'temporary files' },
  {
    re: /\.(png|jpe?g|webp|gif|avif)$/i,
    test: (p) => !/^(src\/assets|public)\//.test(p),
    why: 'image outside src/assets or public (screenshot?)',
  },
  { re: /\.(zip|tar|gz|7z|rar)$/i, why: 'archive' },
];

export function listRepoFiles(root) {
  try {
    const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
    });
    return out.split('\n').filter(Boolean);
  } catch {
    return [...walk(root)].map((p) => path.relative(root, p).split(path.sep).join('/'));
  }
}

export function checkBoundary({ root, files, governance }) {
  const findings = [];
  const forbiddenNames = governance.privatePatterns.forbiddenFiles ?? [];
  for (const f of files) {
    for (const rule of FORBIDDEN_PATHS) {
      if (rule.re.test(f) && (!rule.test || rule.test(f))) {
        findings.push({
          rule: 'BOUNDARY',
          level: 'error',
          message: `Forbidden in public repo (${rule.why})`,
          file: f,
        });
      }
    }
    for (const name of forbiddenNames) {
      if (path.basename(f).toLowerCase().includes(name.toLowerCase())) {
        findings.push({
          rule: 'BOUNDARY',
          level: 'error',
          message: 'Private planning or governance file',
          file: f,
        });
      }
    }
    const abs = path.join(root, f);
    if (!fs.existsSync(abs) || fs.statSync(abs).size > 2_000_000) continue;
    if (/\.(png|jpe?g|webp|gif|avif|woff2?|ico|pdf)$/i.test(f) || f === 'package-lock.json') continue;
    const text = fs.readFileSync(abs, 'utf8');
    findings.push(...R.findSecrets(text, { file: f }));
    findings.push(...R.findPrivatePaths(text, { file: f }));
    findings.push(...R.findLiterals(text, governance.privatePatterns.literals, { file: f }));
    findings.push(...R.findNeverLink(text, governance.neverLink, { file: f }));
    findings.push(
      ...R.findCompanies(text, governance.unnamedCompanies.names, {
        file: f,
        allowedUrls: governance.unnamedCompanies.allowedUrls,
      }),
    );
  }
  return findings;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const root = process.cwd();
  const governance = loadGovernance({ cwd: root });
  if (!governance.available)
    console.warn('⚠ governance data not found: name and literal checks skipped (local only).');
  const files = listRepoFiles(root);
  const findings = checkBoundary({ root, files, governance });
  process.exit(report('check-repo-boundary', findings, `${files.length} files`) ? 0 : 1);
}
