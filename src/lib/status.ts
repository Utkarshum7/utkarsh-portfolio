/**
 * Validates the build-time "Running systems" snapshot. The section renders only when this returns a snapshot:
 * well-formed JSON, every configured system present with a known status, and checked within MAX_AGE_DAYS.
 * Anything else (missing file, malformed data, stale check) hides the section; the page never depends on it.
 */
export const STATUSES = ['responding', 'responding-after-cold-start', 'not-responding'] as const;
export type Status = (typeof STATUSES)[number];
export type StatusResult = { id: string; status: Status; checkedAt: string };
export type Snapshot = { checkedAt: string; results: StatusResult[] };
export const MAX_AGE_DAYS = 7;

export function validateSnapshot(raw: unknown, systemIds: string[], now: Date = new Date()): Snapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<Snapshot>;
  if (typeof s.checkedAt !== 'string' || Number.isNaN(Date.parse(s.checkedAt))) return null;
  const ageDays = (now.getTime() - Date.parse(s.checkedAt)) / 86_400_000;
  if (ageDays < -1 || ageDays > MAX_AGE_DAYS) return null;
  if (!Array.isArray(s.results)) return null;
  for (const id of systemIds) {
    const r = s.results.find((x) => x && x.id === id);
    if (!r || !STATUSES.includes(r.status as Status) || typeof r.checkedAt !== 'string') return null;
  }
  return s as Snapshot;
}
