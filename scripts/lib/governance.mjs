// Loads PRIVATE governance data. Never stored in this repository.
//  - CI: the CONTENT_GOVERNANCE_JSON secret ({ neverLink, unnamedCompanies, privatePatterns }).
//  - Local: JSON files in GOVERNANCE_DIR, defaulting to ../governance next to this repository.
// Fail closed in CI: if the data is missing there, validation must not pass.
import fs from 'node:fs';
import path from 'node:path';

const EMPTY = {
  neverLink: { repos: [], projectNames: [] },
  unnamedCompanies: { names: [], allowedUrls: [] },
  privatePatterns: { literals: [], allowedCredentials: [], forbiddenFiles: [] },
};

export function loadGovernance({ env = process.env, cwd = process.cwd() } = {}) {
  if (env.CONTENT_GOVERNANCE_JSON) {
    const data = JSON.parse(env.CONTENT_GOVERNANCE_JSON);
    return { ...normalise(data), source: 'secret', available: true };
  }
  const dir = env.GOVERNANCE_DIR ? path.resolve(env.GOVERNANCE_DIR) : path.resolve(cwd, '..', 'governance');
  const read = (f) => {
    const p = path.join(dir, f);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  };
  const neverLink = read('never-link.json');
  const unnamedCompanies = read('unnamed-companies.json');
  const privatePatterns = read('private-patterns.json');
  if (!neverLink || !unnamedCompanies || !privatePatterns) {
    if (env.CI) {
      throw new Error(
        'Governance data unavailable in CI. Set the CONTENT_GOVERNANCE_JSON secret (validation fails closed).',
      );
    }
    return { ...EMPTY, source: 'missing', available: false };
  }
  return { ...normalise({ neverLink, unnamedCompanies, privatePatterns }), source: dir, available: true };
}

function normalise(d) {
  return {
    neverLink: { repos: d.neverLink?.repos ?? [], projectNames: d.neverLink?.projectNames ?? [] },
    unnamedCompanies: {
      names: d.unnamedCompanies?.names ?? [],
      allowedUrls: d.unnamedCompanies?.allowedUrls ?? [],
    },
    privatePatterns: {
      literals: d.privatePatterns?.literals ?? [],
      allowedCredentials: d.privatePatterns?.allowedCredentials ?? [],
      forbiddenFiles: d.privatePatterns?.forbiddenFiles ?? [],
    },
  };
}
