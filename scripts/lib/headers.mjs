// Single source of truth for response headers: public/_headers (Cloudflare Pages / Netlify format).
// Vercel ignores that file and reads `headers` from vercel.json instead, so vercel.json is DERIVED from it here:
//   node scripts/csp-hashes.mjs --write        (after a build; also refreshes the CSP script hashes)
//   node scripts/csp-hashes.mjs --sync-vercel  (only regenerate vercel.json from public/_headers)
// check-dist.mjs and the unit tests fail when vercel.json and public/_headers disagree.

/** The headers every page must carry (checked in addition to equality, so losing one from both files still fails). */
export const REQUIRED_SECURITY_HEADERS = [
  'Content-Security-Policy',
  'Strict-Transport-Security',
  'X-Content-Type-Options',
  'X-Frame-Options',
  'Referrer-Policy',
  'Permissions-Policy',
  'Cross-Origin-Opener-Policy',
];

/**
 * _headers rules deliberately not copied to vercel.json. `/*.html` sets `Cache-Control: public, max-age=0,
 * must-revalidate`, which is Vercel's own default for static files; with `cleanUrls` the `.html` URLs also only redirect.
 */
export const NOT_NEEDED_ON_VERCEL = new Set(['/*.html']);

/** Parses the _headers format: an unindented path line, then indented `Name: value` lines. `#` starts a comment. */
export function parseHeadersFile(text) {
  const rules = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (/^\S/.test(raw)) {
      current = { path: raw.trim(), headers: [] };
      rules.push(current);
    } else if (current) {
      const i = raw.indexOf(':');
      if (i < 1) throw new Error(`Malformed header line under ${current.path}: "${raw.trim()}"`);
      current.headers.push({ key: raw.slice(0, i).trim(), value: raw.slice(i + 1).trim() });
    } else {
      throw new Error(`Header line before any path: "${raw.trim()}"`);
    }
  }
  return rules;
}

/** `/*` → `/(.*)`, `/_astro/*` → `/_astro/(.*)`. Any other wildcard form must be handled explicitly, not guessed. */
export function toVercelSource(p) {
  if (!p.includes('*')) return p;
  if (/^(\/[^*]*)?\/\*$/.test(p)) return p.replace(/\*$/, '(.*)');
  throw new Error(
    `Cannot translate header path "${p}" to a Vercel source; add it to NOT_NEEDED_ON_VERCEL or support it`,
  );
}

/** The full vercel.json for this site, derived from the _headers text. */
export function buildVercelConfig(headersText) {
  const headers = parseHeadersFile(headersText)
    .filter((r) => !NOT_NEEDED_ON_VERCEL.has(r.path))
    .map((r) => ({ source: toVercelSource(r.path), headers: r.headers }));
  return {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    cleanUrls: true, // pages are built as about.html: serve them at /about and 308 /about.html there
    trailingSlash: false, // /about/ → 308 /about (one URL per page)
    headers,
  };
}

export const serialiseVercelConfig = (config) => JSON.stringify(config, null, 2) + '\n';

/** The CSP value applied to all routes in a vercel.json object (or undefined). */
export function vercelCsp(config) {
  const all = config?.headers?.find((h) => h.source === '/(.*)');
  return all?.headers?.find((h) => h.key === 'Content-Security-Policy')?.value;
}

/** Findings for a vercel.json object checked against the _headers text it must mirror. */
export function checkVercelConfig(config, headersText) {
  const out = [];
  const err = (message) => out.push({ rule: 'SEC', level: 'error', message });
  if (!config || typeof config !== 'object') {
    err(
      'vercel.json is missing or not valid JSON (Vercel ignores _headers, so it carries the security headers)',
    );
    return out;
  }
  if (config.cleanUrls !== true) err('vercel.json: cleanUrls must be true (pages are built as .html files)');
  if (config.trailingSlash !== false) err('vercel.json: trailingSlash must be false');
  const expected = buildVercelConfig(headersText);
  const bySource = (c) =>
    new Map((c.headers ?? []).map((h) => [h.source, new Map(h.headers.map((x) => [x.key, x.value]))]));
  const have = bySource(config);
  const want = bySource(expected);
  for (const [source, wantHeaders] of want) {
    const haveHeaders = have.get(source);
    if (!haveHeaders) {
      err(
        `vercel.json has no headers for ${source} (present in public/_headers). Run: node scripts/csp-hashes.mjs --write`,
      );
      continue;
    }
    for (const [key, value] of wantHeaders) {
      if (!haveHeaders.has(key)) err(`vercel.json is missing ${key} for ${source}`);
      else if (haveHeaders.get(key) !== value)
        err(
          `vercel.json and public/_headers disagree on ${key} for ${source}. Run: node scripts/csp-hashes.mjs --write`,
        );
    }
    for (const key of haveHeaders.keys())
      if (!wantHeaders.has(key)) err(`vercel.json has ${key} for ${source} that public/_headers does not`);
  }
  for (const source of have.keys())
    if (!want.has(source)) err(`vercel.json has headers for ${source} that public/_headers does not`);
  const all = have.get('/(.*)');
  for (const name of REQUIRED_SECURITY_HEADERS)
    if (!all?.has(name)) err(`vercel.json must apply ${name} to every route`);
  return out;
}
