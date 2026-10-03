#!/usr/bin/env node
// Reports where the private governance data was loaded from and how many entries each list has: counts only,
// never values. Fails (like every validation script) when the data is missing, blank or hollow in CI.
// Use it as the first step of a pipeline so a configuration problem is obvious.
import { loadGovernance } from './lib/governance.mjs';

try {
  const g = loadGovernance();
  const where =
    g.source === 'secret'
      ? 'CONTENT_GOVERNANCE_JSON secret'
      : g.available
        ? 'local governance directory'
        : 'nowhere (local run)';
  console.log(
    `governance: loaded from ${where}; neverLink ${g.neverLink.repos.length}+${g.neverLink.projectNames.length}; companies ${g.unnamedCompanies.names.length}; allowedUrls ${g.unnamedCompanies.allowedUrls.length}; literals ${g.privatePatterns.literals.length}; allowedCredentials ${g.privatePatterns.allowedCredentials.length}; forbiddenFiles ${g.privatePatterns.forbiddenFiles.length}`,
  );
  if (!g.available) {
    console.warn('governance: name and literal checks will be skipped (allowed locally, never in CI).');
  }
} catch (e) {
  console.error(`::error::${e.message}`);
  process.exit(1);
}
