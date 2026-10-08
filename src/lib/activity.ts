/**
 * Build activity snapshot (src/data/activity.json, written by scripts/github-activity.mjs).
 * A snapshot, not a live feed: the page always shows the date it was taken. If the file is malformed the
 * activity sections are not rendered (never guessed or padded).
 */
import raw from '../data/activity.json';
import repos from '../data/repos.json';

export type RepoActivity = {
  key: string;
  language: string | null;
  commits: number;
  lastCommit: string | null;
  pushedAt: string | null;
};
export type Activity = {
  generatedAt: string;
  weeks: number;
  start: string;
  end: string;
  total: number;
  days: number[];
  repos: RepoActivity[];
};

function validate(a: unknown): Activity | null {
  const x = a as Partial<Activity>;
  if (!x || typeof x.generatedAt !== 'string' || !Array.isArray(x.days) || !Array.isArray(x.repos))
    return null;
  if (typeof x.weeks !== 'number' || x.days.length !== x.weeks * 7) return null;
  if (x.days.some((d) => !Number.isInteger(d) || d < 0)) return null;
  if (x.total !== x.days.reduce((s, d) => s + d, 0)) return null;
  const known = new Set(Object.keys(repos));
  if (x.repos.some((r) => !known.has(r.key))) return null;
  return x as Activity;
}

export const activity = validate(raw);

/** GitHub URL and repository name for a repos.json key */
export function repoInfo(key: string): { url: string; name: string } {
  const url = (repos as unknown as Record<string, { url: string }>)[key]!.url;
  return { url, name: new URL(url).pathname.split('/')[2]! };
}

/** Project id (content collection) for each repos.json key */
export const PROJECT_BY_REPO: Record<string, string> = {
  scopetrace: 'scopetrace',
  delta: 'support-intelligence',
  screener: 'resume-screener',
  robofleet: 'robofleet-monitor',
  appointments: 'appointment-board',
  taskora: 'taskora',
  copilot: 'ai-investment-copilot',
  edge: 'edge-observability-stack',
  apollo: 'apollo-family-clinic',
  vedaai: 'vedaai-frontend',
  dockermon: 'docker-monitoring-stack',
  k8snotes: 'k8s-notes-app-deployment',
  vyasa: 'vyasas-vision',
};

export const fmtDay = (iso: string, withYear = true) =>
  new Date(iso + (iso.length === 10 ? 'T00:00:00Z' : '')).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
