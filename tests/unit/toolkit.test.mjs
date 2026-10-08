// The engineering toolkit is evidence, so its data is checked like evidence: every use points at something real,
// every mark exists, and nothing reads like a proficiency rating.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { disciplines, frontendAndTooling, allTech, techByProject, AREAS } from '../../src/data/toolkit.ts';

const projectIds = new Set(
  fs
    .readdirSync('src/content/projects')
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => f.replace(/\.mdx$/, '')),
);
const sprite = fs.readFileSync('src/assets/tech-marks.svg', 'utf8');

test('toolkit: three disciplines, matching the area ids used by projects', () => {
  assert.deepEqual(
    disciplines.map((d) => d.id),
    ['backend', 'ai', 'cloud'],
  );
  for (const d of disciplines) assert.ok(AREAS[d.id], d.id);
  assert.ok(frontendAndTooling.length > 0);
});

test('toolkit: ids are unique and URL-safe; every entry has evidence', () => {
  const ids = allTech.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate technology id');
  for (const t of allTech) {
    assert.match(t.id, /^[a-z0-9-]+$/, t.id);
    assert.ok(t.uses.length > 0, `${t.id} has no uses`);
  }
});

test('toolkit: every project use refers to a project that exists', () => {
  for (const t of allTech)
    for (const u of t.uses)
      if (u.kind === 'project')
        assert.ok(projectIds.has(u.project), `${t.id} → unknown project ${u.project}`);
  for (const id of techByProject().keys()) assert.ok(projectIds.has(id), id);
});

test('toolkit: every icon mark exists in the sprite; text marks are short', () => {
  for (const t of allTech) {
    if ('icon' in t.mark)
      assert.ok(sprite.includes(`<symbol id="${t.mark.icon}"`), `${t.id}: missing ${t.mark.icon}`);
    else assert.ok(t.mark.text.length <= 4, `${t.id}: text mark too long`);
  }
});

test('toolkit: no proficiency language, percentages or years of experience', () => {
  const text = JSON.stringify(allTech);
  assert.doesNotMatch(text, /\b(expert\w*|proficien\w*|advanced|beginner|intermediate|years? of|mastery)\b/i);
  assert.doesNotMatch(text, /\d+\s?%/);
});

// Build activity snapshot (scripts/github-activity.mjs): the calendar is pure date arithmetic, tested on fixed dates.
import { calendar, WEEKS } from '../../scripts/github-activity.mjs';
import activity from '../../src/data/activity.json' with { type: 'json' };

test('activity: commits land on the right UTC day; future and out-of-window dates are ignored', () => {
  const now = new Date('2026-10-07T12:00:00Z'); // a Wednesday
  const cal = calendar(
    [
      '2026-10-07T01:00:00Z',
      '2026-10-07T23:59:00Z',
      '2026-10-06T10:00:00Z',
      '2026-10-09T10:00:00Z',
      '2024-01-01T00:00:00Z',
    ],
    now,
  );
  assert.equal(cal.days.length, WEEKS * 7);
  assert.equal(cal.end, '2026-10-07');
  const startDay = new Date(cal.start + 'T00:00:00Z');
  assert.equal(startDay.getUTCDay(), 0, 'calendar starts on a Sunday');
  const idx = (d) => Math.round((Date.parse(d + 'T00:00:00Z') - startDay.getTime()) / 86_400_000);
  assert.equal(cal.days[idx('2026-10-07')], 2);
  assert.equal(cal.days[idx('2026-10-06')], 1);
  assert.equal(
    cal.days.reduce((a, b) => a + b, 0),
    3,
    'future (Oct 9) and old (2024) commits are not counted',
  );
});

test('activity: the committed snapshot is internally consistent and contains no commit text', () => {
  assert.equal(activity.days.length, activity.weeks * 7);
  assert.equal(
    activity.total,
    activity.days.reduce((a, b) => a + b, 0),
  );
  assert.equal(
    activity.repos.reduce((a, r) => a + r.commits, 0),
    activity.total,
    'per-repository counts use the same window as the calendar',
  );
  for (const r of activity.repos)
    assert.deepEqual(Object.keys(r).sort(), ['commits', 'key', 'language', 'lastCommit', 'pushedAt']);
  assert.match(activity.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
});
