import { test, expect } from '@playwright/test';
import { ROUTES } from './routes';

test('keyboard: skip link is first, works, and focus is always visible', async ({ page }) => {
  await page.goto('/work/scopetrace');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);

  // Tab through the first 25 focusable elements: each must show a visible focus indicator
  await page.goto('/');
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const after = getComputedStyle(el, '::after');
      const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2;
      const pseudoOutline = after.outlineStyle !== 'none' && parseFloat(after.outlineWidth) >= 2;
      return {
        tag: el.tagName,
        text: (el.textContent ?? '').trim().slice(0, 40),
        visible: outline || pseudoOutline,
      };
    });
    if (!info) continue;
    expect(info.visible, `focus visible on ${info.tag} "${info.text}"`).toBe(true);
  }
});

test('keyboard: case-study contents disclosure opens with Enter on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/work/scopetrace');
  const summary = page.locator('nav.toc summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('nav.toc details')).toHaveAttribute('open', '');
  await expect(page.locator('nav.toc').getByRole('link').first()).toBeVisible();
});

for (const route of ROUTES) {
  test(`SEO metadata on ${route.path}`, async ({ page }) => {
    await page.goto(route.path);
    const meta = await page.evaluate(() => {
      const q = (s: string) => document.querySelector(s)?.getAttribute('content') ?? null;
      return {
        description: q('meta[name="description"]'),
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
        ogTitle: q('meta[property="og:title"]'),
        ogImage: q('meta[property="og:image"]'),
        ogUrl: q('meta[property="og:url"]'),
        twitter: q('meta[name="twitter:card"]'),
        ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(
          (s) => s.textContent ?? '',
        ),
      };
    });
    expect(meta.description?.length ?? 0).toBeGreaterThan(50);
    expect(meta.description!.length).toBeLessThanOrEqual(160);
    expect(meta.canonical).toBeTruthy();
    const canonical = new URL(meta.canonical!);
    expect(canonical.pathname).toBe(route.path);
    expect(meta.ogUrl).toBe(meta.canonical);
    expect(meta.ogTitle).toBeTruthy();
    expect(meta.ogImage).toMatch(/\/og\/default\.png$/);
    expect(meta.twitter).toBe('summary_large_image');
    for (const block of meta.ld) expect(() => JSON.parse(block)).not.toThrow();
  });
}

test('social image, robots.txt and sitemap are served correctly', async ({ request }) => {
  const og = await request.get('/og/default.png');
  expect(og.status()).toBe(200);
  expect(og.headers()['content-type']).toContain('image/png');

  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toMatch(/^User-agent: \*/);
  expect(robots).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap-index\.xml/);

  const sitemap = await (await request.get('/sitemap-0.xml')).text();
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
  expect(locs.sort()).toEqual(ROUTES.map((r) => r.path).sort());
});
