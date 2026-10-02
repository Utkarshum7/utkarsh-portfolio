import repos from '../data/repos.json';

type RepoEntry = { url: string; sha?: string };
const REPOS = repos as unknown as Record<string, RepoEntry>;

/**
 * Expands `repo:<key>` and `repo:<key>:<path>` into public GitHub URLs pinned to the commit in repos.json.
 * Paths without a file extension are treated as directories (`/tree/`), others as files (`/blob/`).
 * Plain https URLs pass through unchanged.
 */
export function resolveUrl(url: string): string {
  if (!url.startsWith('repo:')) return url;
  const [, key, ...rest] = url.split(':');
  const path = rest.join(':');
  const repo = key ? REPOS[key] : undefined;
  if (!repo || typeof repo !== 'object' || !('url' in repo)) {
    throw new Error(`Unknown repository key in "${url}". Add it to src/data/repos.json.`);
  }
  if (!path) return repo.url;
  if (!repo.sha)
    throw new Error(`Repository "${key}" has no pinned sha; file links must be pinned ("${url}").`);
  const kind = /\.[a-z0-9]+$/i.test(path) ? 'blob' : 'tree';
  return `${repo.url}/${kind}/${repo.sha}/${path}`;
}

export function repoUrl(key: string): string {
  return resolveUrl(`repo:${key}`);
}

export function isExternal(href: string): boolean {
  return /^https?:\/\//.test(href);
}

/** Canonical path for a page URL: no ".html", no "index", no trailing slash ("/" for home). */
export function canonicalPath(pathname: string): string {
  const p = pathname
    .replace(/\.html$/, '')
    .replace(/\/index$/, '/')
    .replace(/\/$/, '');
  return p === '' ? '/' : p;
}
