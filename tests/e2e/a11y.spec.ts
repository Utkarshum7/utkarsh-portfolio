import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ROUTES, NOT_FOUND } from './routes';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

for (const scheme of ['light', 'dark'] as const) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test.describe(`axe · ${scheme} · motion ${reducedMotion}`, () => {
      test.use({ colorScheme: scheme, reducedMotion });
      for (const path of [...ROUTES.map((r) => r.path), NOT_FOUND]) {
        test(`${path} has no axe violations`, async ({ page }) => {
          await page.goto(path);
          // Open the case-study contents so its links are audited too
          await page.evaluate(() =>
            document.querySelectorAll('details').forEach((d) => ((d as HTMLDetailsElement).open = true)),
          );
          const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
          const summary = results.violations.map(
            (v) =>
              `${v.id} (${v.impact}): ${v.nodes
                .map((n) => n.target.join(' '))
                .slice(0, 3)
                .join(' | ')}`,
          );
          expect(summary).toEqual([]);
        });
      }
    });
  }
}
