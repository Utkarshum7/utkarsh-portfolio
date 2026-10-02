#!/usr/bin/env node
// Build-time health checks for the "Running systems" panel.
// Writes src/data/generated/status.json. Never fails the build; exit code 2 only with --alert when a system
// has been down in this run AND the previous run (so the scheduled workflow can notify the owner).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const systemsFile = path.join(root, 'src/data/systems.json');
const outFile = path.join(root, 'src/data/generated/status.json');

export const COLD_MS = 10_000;
export const TIMEOUT_MS = 90_000;

/** Classify one check result. Exported for unit tests. */
export function classify({ ok, ms }) {
  if (!ok) return 'not-responding';
  return ms >= COLD_MS ? 'responding-after-cold-start' : 'responding';
}

export async function checkOne(
  url,
  { fetchImpl = fetch, timeoutMs = TIMEOUT_MS, now = () => Date.now() } = {},
) {
  const started = now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'portfolio-status-check' },
    });
    const ms = now() - started;
    return { ok: res.status >= 200 && res.status < 400, ms, httpStatus: res.status };
  } catch {
    return { ok: false, ms: now() - started, httpStatus: null };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const alert = process.argv.includes('--alert');
  const { systems } = JSON.parse(fs.readFileSync(systemsFile, 'utf8'));
  const previous = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : null;
  const checkedAt = new Date().toISOString();
  const results = await Promise.all(
    systems.map(async (s) => {
      const r = await checkOne(s.url);
      return {
        id: s.id,
        status: classify(r),
        latencyMs: Math.round(r.ms),
        httpStatus: r.httpStatus,
        checkedAt,
      };
    }),
  );
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ checkedAt, results }, null, 2));
  for (const r of results)
    console.log(`${r.status.padEnd(28)} ${String(r.latencyMs).padStart(6)} ms  ${r.id}`);

  if (alert && previous) {
    const downTwice = results.filter(
      (r) =>
        r.status === 'not-responding' &&
        previous.results?.find((p) => p.id === r.id)?.status === 'not-responding',
    );
    if (downTwice.length) {
      console.error(`Down in two consecutive checks: ${downTwice.map((r) => r.id).join(', ')}`);
      process.exitCode = 2;
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
