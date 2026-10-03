// Pure validation rules. Each returns an array of findings:
// { rule, level: 'error' | 'warn', message, file?, line? }. No I/O here, so every rule is unit-testable.

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------------------------------------
// Generic secret / credential detection (shared by source, repository and dist scans)
// ---------------------------------------------------------------------------------------------
export const SECRET_PATTERNS = [
  { name: 'AWS access key ID', re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'OpenAI-style key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/ },
  { name: 'Anthropic key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'GitHub token', re: /\b(?:ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{30,}\b/ },
  {
    name: 'Slack token or webhook',
    re: /\bxox[abpr]-[A-Za-z0-9-]{10,}|hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]{20,}/,
  },
  { name: 'Stripe live key', re: /\bsk_live_[0-9a-zA-Z]{20,}\b/ },
  {
    name: 'credentialed connection string',
    re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?|amqp):\/\/[^\s:@/'"<>]+:[^\s@/'"<>]{4,}@/i,
  },
  { name: 'JWT', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  {
    name: 'password assignment',
    re: /\b(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*['"]?(?!\s*(?:<|\$\{|process\.env|null|undefined|''|""))[A-Za-z0-9!@#$%^&*_+=/-]{8,}/i,
  },
];

export function findSecrets(text, { file, allowed = [] } = {}) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const { name, re } of SECRET_PATTERNS) {
      const m = line.match(re);
      if (!m) continue;
      if (allowed.some((a) => m[0].includes(a))) continue;
      findings.push({
        rule: 'R12',
        level: 'error',
        message: `Secret-like string (${name})`,
        file,
        line: i + 1,
      });
    }
  });
  return findings;
}

// ---------------------------------------------------------------------------------------------
// Private workspace paths and literals
// ---------------------------------------------------------------------------------------------
export const PRIVATE_PATH_PATTERNS = [
  { name: 'Windows absolute path', re: /\b[A-Za-z]:\\(?:[^\\\s"'<>]+\\)+/ },
  {
    name: 'user home path',
    re: /(?:\/Users\/[A-Za-z0-9._-]+\/|\/home\/[A-Za-z0-9._-]+\/|\\Users\\[A-Za-z0-9._-]+\\)/,
  },
  { name: 'AppData path', re: /AppData[\\/](?:Local|Roaming)/i },
  { name: 'file URL', re: /\bfile:\/\/\// },
];

export function findPrivatePaths(text, { file } = {}) {
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const { name, re } of PRIVATE_PATH_PATTERNS) {
      if (re.test(line))
        out.push({
          rule: 'R12',
          level: 'error',
          message: `Private filesystem path (${name})`,
          file,
          line: i + 1,
        });
    }
  });
  return out;
}

export function findLiterals(text, literals, { file, rule = 'R12', label = 'Private literal' } = {}) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (const lit of literals) {
    if (!lit) continue;
    const re = new RegExp(escapeRe(lit), 'i');
    lines.forEach((line, i) => {
      if (re.test(line)) out.push({ rule, level: 'error', message: `${label}: "${lit}"`, file, line: i + 1 });
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// R7 / R11: never-link repositories and hidden projects; R8: unnamed companies
// ---------------------------------------------------------------------------------------------
export function findNeverLink(text, neverLink, { file } = {}) {
  const out = [];
  const lines = text.split(/\r?\n/);
  const repoRes = neverLink.repos.map((r) => ({
    r,
    re: new RegExp(`(?:github\\.com/[^/\\s"')]+/|\\b)${escapeRe(r)}(?![A-Za-z0-9_-])`, 'i'),
  }));
  const nameRes = neverLink.projectNames.map((n) => ({ n, re: new RegExp(`\\b${escapeRe(n)}\\b`, 'i') }));
  lines.forEach((line, i) => {
    for (const { r, re } of repoRes)
      if (re.test(line))
        out.push({
          rule: 'R7',
          level: 'error',
          message: `Never-link repository referenced: ${r}`,
          file,
          line: i + 1,
        });
    for (const { n, re } of nameRes)
      if (re.test(line))
        out.push({
          rule: 'R11',
          level: 'error',
          message: `Hidden project or employer-internal name: ${n}`,
          file,
          line: i + 1,
        });
  });
  return out;
}

/**
 * Company names must not appear in visible text (error) and are reported when they appear inside a URL (warning).
 * `allowedUrls` (private governance data: [{ url, company, reason }]) exempts one exact URL for one company name:
 * no wildcards, no other paths or hosts, and prose mentions are still errors.
 */
export function findCompanies(text, names, { file, allowedUrls = [] } = {}) {
  const out = [];
  const norm = (u) => u.replace(/\/+$/, '').toLowerCase();
  const isAllowed = (u, name) =>
    allowedUrls.some((a) => a.company?.toLowerCase() === name.toLowerCase() && norm(a.url) === norm(u));
  text.split(/\r?\n/).forEach((line, i) => {
    const urls = line.match(/https?:\/\/[^\s"'<>)]+/g) ?? [];
    const prose = line.replace(/https?:\/\/[^\s"'<>)]+/g, ' ');
    for (const name of names) {
      const re = new RegExp(`\\b${escapeRe(name)}\\b`, 'i');
      if (re.test(prose))
        out.push({
          rule: 'R8',
          level: 'error',
          message: `Unnamed company appears in text: ${name}`,
          file,
          line: i + 1,
        });
      else if (urls.some((u) => !isAllowed(u, name) && re.test(u.replace(/[-_./]/g, ' ')))) {
        out.push({
          rule: 'R8',
          level: 'warn',
          message: `Company name inside a URL (rename pending): ${name}`,
          file,
          line: i + 1,
        });
      }
    }
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// R9: draft markers
// ---------------------------------------------------------------------------------------------
export const DRAFT_MARKERS = ['[VERIFY', '[CONFIRM', '[DECIDE', '⟦', '⟧', '⟨', '⟩', '> Note:'];

export function findDraftMarkers(text, { file } = {}) {
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const m of DRAFT_MARKERS) {
      if (line.includes(m))
        out.push({
          rule: 'R9',
          level: 'error',
          message: `Draft marker "${m}" in publishable content`,
          file,
          line: i + 1,
        });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// R10: unsourced metrics and strong unsupported claims in prose
// ---------------------------------------------------------------------------------------------
export const METRIC_RE =
  /(?<![\w.#-])\d[\d,]*(?:\.\d+)?\s?(?:%|ms\b|×|x\s|k\+|\+\s|tests?\b|users?\b|requests?\b|queries\b|uptime\b|percent\b|times faster\b)/i;
export const STRONG_CLAIM_RE =
  /\b(?:production[- ]grade|enterprise[- ]grade|world[- ]class|cutting[- ]edge|blazing(?:ly)? fast|highly scalable|battle[- ]tested|bullet[- ]?proof|passionate|rockstar|ninja|guru|10x engineer|state[- ]of[- ]the[- ]art)\b/i;

/**
 * Scans prose for metrics outside <Claim>…</Claim>, sourced blocks and exempt lines.
 * `text` is MDX body or Astro template markup (style/script/frontmatter already stripped).
 */
export function findUnsourcedMetrics(text, { file } = {}) {
  const out = [];
  const lines = text.split(/\r?\n/);
  let sourced = false; // inside a block introduced by {/* sourced: id */}
  let exemptNext = false;
  let claimDepth = 0;
  lines.forEach((raw, i) => {
    const line = raw;
    if (/\{\/\*\s*sourced:\s*[\w.-]+\s*\*\/\}/.test(line)) {
      sourced = true;
      return;
    }
    if (/\{\/\*\s*claim-exempt:[^*]+\*\/\}/.test(line)) {
      exemptNext = true;
      return;
    }
    if (line.trim() === '') {
      sourced = false;
      return;
    }
    // Remove inline <Claim …>…</Claim> and self-closing <Claim … /> spans; track multi-line Claim blocks.
    let scan = line.replace(/<Claim\b[^>]*\/>/g, ' ').replace(/<Claim\b[^>]*>[\s\S]*?<\/Claim>/g, ' ');
    if (claimDepth > 0) {
      if (/<\/Claim>/.test(scan)) {
        claimDepth = 0;
        scan = scan.replace(/^[\s\S]*?<\/Claim>/, ' ');
      } else {
        return;
      }
    }
    if (/<Claim\b[^>]*>(?![\s\S]*<\/Claim>)/.test(scan)) {
      claimDepth = 1;
      scan = scan.replace(/<Claim\b[\s\S]*$/, ' ');
    }
    // Ignore markup attributes, code spans, URLs and import lines.
    scan = scan
      .replace(/^\s*import .*$/, ' ')
      .replace(/`[^`]*`/g, ' ')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/\b[\w:-]+=(?:"[^"]*"|'[^']*'|\{[^}]*\})/g, ' ');
    if (!sourced && !exemptNext && METRIC_RE.test(scan)) {
      out.push({
        rule: 'R10',
        level: 'error',
        message: `Unsourced metric: "${scan.match(METRIC_RE)[0].trim()}"`,
        file,
        line: i + 1,
      });
    }
    if (STRONG_CLAIM_RE.test(scan)) {
      out.push({
        rule: 'R10',
        level: 'error',
        message: `Unsupported strong claim: "${scan.match(STRONG_CLAIM_RE)[0]}"`,
        file,
        line: i + 1,
      });
    }
    exemptNext = false;
  });
  return out;
}

/** Strips frontmatter, <style>, <script> and comments from an .astro file, keeping line numbers stable. */
export function astroTemplateText(src) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  return src
    .replace(/^---[\s\S]*?\n---/, blank)
    .replace(/<style[\s\S]*?<\/style>/g, blank)
    .replace(/<script[\s\S]*?<\/script>/g, blank)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => (/sourced:|claim-exempt:/.test(m) ? m : blank(m)));
}

/** Strips MDX frontmatter (keeps line numbers). */
export function mdxBody(src) {
  return src.replace(/^---[\s\S]*?\n---/, (m) => m.replace(/[^\n]/g, ' '));
}

// ---------------------------------------------------------------------------------------------
// Claims registry checks (static, before Astro runs)
// ---------------------------------------------------------------------------------------------
export const PUBLISHABLE = ['VERIFIED', 'PARTIALLY_VERIFIED', 'OWNER_CONFIRMED'];

/** Minimal parser for the claims.yaml shape used here: "- id:" entries with status/checked keys. */
export function parseClaims(yamlText) {
  const entries = [];
  let cur = null;
  yamlText.split(/\r?\n/).forEach((line, i) => {
    const id = line.match(/^- id:\s*(\S+)/);
    if (id) {
      cur = { id: id[1], line: i + 1 };
      entries.push(cur);
      return;
    }
    if (!cur) return;
    const status = line.match(/^\s+status:\s*(\S+)/);
    if (status) cur.status = status[1];
    const checked = line.match(/^\s+checked:\s*(\d{4}-\d{2}-\d{2})/);
    if (checked) cur.checked = checked[1];
  });
  return entries;
}

export function checkClaimsRegistry(entries, { now = new Date(), staleDays = 180 } = {}) {
  const out = [];
  const seen = new Set();
  for (const e of entries) {
    if (seen.has(e.id))
      out.push({ rule: 'R1', level: 'error', message: `Duplicate claim id ${e.id}`, line: e.line });
    seen.add(e.id);
    if (!PUBLISHABLE.includes(e.status)) {
      out.push({
        rule: 'R2',
        level: 'error',
        message: `Claim ${e.id} has non-publishable status "${e.status}"`,
        line: e.line,
      });
    }
    if (!e.checked)
      out.push({ rule: 'R3', level: 'error', message: `Claim ${e.id} has no checked date`, line: e.line });
    else if ((now - new Date(e.checked)) / 86_400_000 > staleDays) {
      out.push({
        rule: 'W1',
        level: 'warn',
        message: `Claim ${e.id} last checked ${e.checked} (> ${staleDays} days)`,
        line: e.line,
      });
    }
  }
  return out;
}

/** Finds claim references in source text: <Claim id>, <EvidenceChip id>, <SourceLine id>, getClaim(), data-file fields, frontmatter lists. */
export function findClaimRefs(text) {
  const refs = new Set();
  const patterns = [
    /<(?:Claim|EvidenceChip|SourceLine)\b[^>]*\bid=["']([\w.-]+)["']/g,
    /getClaim\(\s*['"]([\w.-]+)['"]/g,
    /\b(?:claim|didClaim|whatClaim)\s*:\s*['"]([\w.-]+)['"]/g,
    /\{\s*claim:\s*([\w.-]+)\s*,/g,
    /\{\/\*\s*sourced:\s*([\w.-]+)\s*\*\/\}/g,
  ];
  for (const re of patterns) for (const m of text.matchAll(re)) refs.add(m[1]);
  const chips = text.match(/^chips:\s*\[([^\]]*)\]/m);
  if (chips)
    chips[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((c) => refs.add(c));
  return [...refs];
}

export function checkClaimRefs(refs, registryIds, { file } = {}) {
  return refs
    .filter((r) => !registryIds.has(r))
    .map((r) => ({ rule: 'R4', level: 'error', message: `Reference to nonexistent claim "${r}"`, file }));
}

// ---------------------------------------------------------------------------------------------
// HTML helpers for dist scanning
// ---------------------------------------------------------------------------------------------
export function htmlVisibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');
}

export function htmlHrefs(html) {
  return [...html.matchAll(/\b(?:href|src|content)=["']([^"']+)["']/gi)].map((m) => m[1]);
}

export const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
export const PHONE_RE = /(?:\+91[\s-]?)?(?<![\d.])[6-9]\d{4}[\s-]?\d{5}(?![\d.])/;

export function findContactLeaks(text, { approvedEmails = [], file } = {}) {
  const out = [];
  for (const m of text.matchAll(EMAIL_RE)) {
    if (!approvedEmails.includes(m[0].toLowerCase())) {
      out.push({
        rule: 'R12',
        level: 'error',
        message: `Unapproved e-mail address in output: ${m[0]}`,
        file,
      });
    }
  }
  if (PHONE_RE.test(text))
    out.push({ rule: 'R12', level: 'error', message: 'Phone-number-like string in visible text', file });
  return out;
}

/** CSP: every inline <script> body must be allowed by a sha256 hash in _headers. */
export function inlineScriptBodies(html) {
  return [
    ...html.matchAll(
      /<script(?![^>]*\bsrc=)(?![^>]*type=["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ]
    .map((m) => m[1])
    .filter((s) => s.trim().length > 0);
}

/**
 * Typography: a word or sentence glued to an inline link/emphasis ("code.Example", "anda demo").
 * Astro drops the whitespace between text and a component at a line break; this catches it in the output.
 */
export function findGluedInline(html, { file } = {}) {
  const body = html.replace(/<(script|style|pre|code)\b[\s\S]*?<\/\1>/gi, '');
  const out = [];
  for (const m of body.matchAll(
    /[A-Za-z][.,;:]?<(a|strong|em|span class="claim")[\s>]|<\/(a|strong|em)>[A-Za-z]/g,
  )) {
    // A source marker sits directly after the word it supports, by design
    if (/class="marker"/.test(body.slice(m.index, m.index + 60))) continue;
    out.push({
      rule: 'TYPO',
      level: 'error',
      message: `Missing space around inline element: "${body.slice(Math.max(0, m.index - 20), m.index + 30).replace(/\s+/g, ' ')}"`,
      file,
    });
  }
  // ...and the reverse: a line break left between an inline element and the punctuation that follows it
  for (const m of body.matchAll(/<\/(a|strong|em|span)>\s+[,.;:](?=\s|<|$)/g)) {
    out.push({
      rule: 'TYPO',
      level: 'error',
      message: `Space before punctuation: "${body.slice(Math.max(0, m.index - 30), m.index + 12).replace(/\s+/g, ' ')}"`,
      file,
    });
  }
  return out;
}
