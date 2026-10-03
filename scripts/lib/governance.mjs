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

/** The lists every check depends on. A governance object without them would make the checks pass vacuously. */
const REQUIRED = [
  ['neverLink.repos', (g) => g.neverLink.repos],
  ['neverLink.projectNames', (g) => g.neverLink.projectNames],
  ['unnamedCompanies.names', (g) => g.unnamedCompanies.names],
  ['privatePatterns.literals', (g) => g.privatePatterns.literals],
  ['privatePatterns.forbiddenFiles', (g) => g.privatePatterns.forbiddenFiles],
];

function assertUsable(g, where) {
  const empty = REQUIRED.filter(([, get]) => get(g).length === 0).map(([name]) => name);
  if (empty.length) {
    throw new Error(
      `Governance data from ${where} has empty required lists (${empty.join(', ')}); refusing to validate against an empty blocklist.`,
    );
  }
  return g;
}

export function loadGovernance({ env = process.env, cwd = process.cwd() } = {}) {
  if (env.CONTENT_GOVERNANCE_JSON) {
    let data;
    try {
      data = JSON.parse(env.CONTENT_GOVERNANCE_JSON);
    } catch {
      // Report the size only, never the content
      throw new Error(
        `CONTENT_GOVERNANCE_JSON is not valid JSON (${env.CONTENT_GOVERNANCE_JSON.length} characters).`,
      );
    }
    return { ...assertUsable(normalise(data), 'CONTENT_GOVERNANCE_JSON'), source: 'secret', available: true };
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
      const why =
        env.CONTENT_GOVERNANCE_JSON === undefined
          ? 'CONTENT_GOVERNANCE_JSON is not set.'
          : 'CONTENT_GOVERNANCE_JSON is set but empty: GitHub passes an empty string when the secret is missing, blank, or not available to this run (for example a pull request from a fork).';
      throw new Error(`Governance data unavailable in CI. ${why} Validation fails closed.`);
    }
    return { ...EMPTY, source: 'missing', available: false };
  }
  const loaded = normalise({ neverLink, unnamedCompanies, privatePatterns });
  if (env.CI) assertUsable(loaded, dir);
  return { ...loaded, source: dir, available: true };
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
