import fs from 'node:fs';
import path from 'node:path';

/** Recursively lists files under dir (skips node_modules and .git). */
export function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** Prints findings grouped by level; returns true when there are no errors. */
export function report(name, findings, summary = '') {
  const errors = findings.filter((f) => f.level === 'error');
  const warns = findings.filter((f) => f.level === 'warn');
  const fmt = (f) => `  [${f.rule}] ${f.file ?? ''}${f.line ? `:${f.line}` : ''}  ${f.message}`;
  if (warns.length) {
    console.warn(`${name}: ${warns.length} warning(s)`);
    for (const w of dedupe(warns)) console.warn(fmt(w));
  }
  if (errors.length) {
    console.error(`${name}: ${errors.length} error(s)`);
    for (const e of dedupe(errors)) console.error(fmt(e));
    return false;
  }
  console.log(`${name}: OK${summary ? ` (${summary})` : ''}`);
  return true;
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((f) => {
    const k = `${f.rule}|${f.file}|${f.line}|${f.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
