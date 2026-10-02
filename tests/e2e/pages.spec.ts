import { test, expect, type Page } from '@playwright/test';
import { ROUTES, NOT_FOUND } from './routes';

async function noHorizontalOverflow(page: Page) {
  const { scrollWidth, clientWidth, offenders } = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders: string[] = [];
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width > 0 && r.right > vw + 1 && style.position !== 'fixed' && !el.closest('.visually-hidden')) {
        // Elements inside a horizontally scrollable container (e.g. code blocks) are allowed.
        const scroller = el.parentElement?.closest('pre, .scroll-x');
        if (!scroller) offenders.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
      }
    });
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: vw,
      offenders: offenders.slice(0, 10),
    };
  });
  expect(offenders, 'elements extending past the viewport').toEqual([]);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    for (const route of ROUTES) {
      test(`${route.path} renders without overflow, with nav, headings and alt text`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

        const res = await page.goto(route.path);
        expect(res?.status()).toBe(200);
        await expect(page).toHaveTitle(route.title);

        // Header: name and both nav links visible inside the viewport at every width (no hidden or clipped nav)
        const vw = page.viewportSize()!.width;
        for (const name of ['Utkarsh Amaresh', 'Work', 'About']) {
          const link = page.getByRole('banner').getByRole('link', { name, exact: true });
          await expect(link).toBeVisible();
          const box = (await link.boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(vw + 0.5);
        }

        // The h1 is fully inside the viewport (guards against the clipped-headline regression)
        const h1 = page.locator('h1');
        await expect(h1).toHaveCount(1);
        const hb = (await h1.boundingBox())!;
        expect(hb.x + hb.width).toBeLessThanOrEqual(vw + 0.5);

        await noHorizontalOverflow(page);

        // Heading levels never skip (h1 → h2 → h3)
        const levels = await page.$$eval('main h1, main h2, main h3, main h4, main h5, main h6', (els) =>
          els.map((e) => Number(e.tagName[1])),
        );
        expect(levels[0]).toBe(1);
        for (let i = 1; i < levels.length; i++) expect(levels[i]! - levels[i - 1]!).toBeLessThanOrEqual(1);

        // Images: every <img> has an alt attribute; meaningful images have non-empty alt
        const imgs = await page.$$eval('img', (els) =>
          els.map((e) => ({ alt: e.getAttribute('alt'), src: e.currentSrc || e.src })),
        );
        for (const img of imgs) {
          expect(img.alt, `alt on ${img.src}`).not.toBeNull();
          expect(img.alt!.length, `non-empty alt on ${img.src}`).toBeGreaterThan(0);
        }

        // SVG icons are hidden from assistive technology
        const exposedIcons = await page.$$eval('svg.icon:not([aria-hidden="true"])', (els) => els.length);
        expect(exposedIcons).toBe(0);

        expect(errors).toEqual([]);
      });
    }
  });
}

test('404 page renders with links home and to the work index', async ({ page }) => {
  const res = await page.goto(NOT_FOUND);
  expect(res?.status()).toBe(404);
  await expect(page.locator('h1')).toHaveText("This page doesn't exist.");
  await expect(page.getByRole('main').getByRole('link', { name: 'Work' })).toHaveAttribute('href', '/work');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
});

test('navigation works and marks the current page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('banner').getByRole('link', { name: 'Work', exact: true }).click();
  await expect(page).toHaveURL(/\/work$/);
  await expect(page.getByRole('banner').getByRole('link', { name: 'Work', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByRole('link', { name: 'ScopeTrace', exact: true }).first().click();
  await expect(page).toHaveURL(/\/work\/scopetrace$/);
  await expect(page.getByRole('banner').getByRole('link', { name: 'Work', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByRole('banner').getByRole('link', { name: 'About', exact: true }).click();
  await expect(page).toHaveURL(/\/about$/);
  await page.getByRole('banner').getByRole('link', { name: 'Utkarsh Amaresh' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('all internal links and in-page anchors resolve', async ({ page, request }) => {
  test.setTimeout(120_000);
  const seen = new Set<string>();
  for (const route of ROUTES) {
    await page.goto(route.path);
    const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')!));
    for (const href of hrefs) {
      if (/^(https?:|mailto:)/.test(href)) continue;
      const url = new URL(href, `http://x${route.path}`);
      const key = url.pathname + url.hash;
      if (seen.has(key)) continue;
      seen.add(key);
      const res = await request.get(url.pathname);
      expect(res.status(), `${href} (linked from ${route.path})`).toBe(200);
      if (url.hash) {
        const target = await (async () => {
          await page.goto(url.pathname);
          return page.locator(`[id="${decodeURIComponent(url.hash.slice(1))}"]`).count();
        })();
        expect(target, `anchor ${href} (from ${route.path})`).toBe(1);
        await page.goto(route.path);
      }
    }
  }
  expect(seen.size).toBeGreaterThan(10);
});

test('theme toggle switches and persists across reloads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: /Switch to dark theme/ });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(17, 19, 21)');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: /Switch to light theme/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('reduced motion disables transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const duration = await page
    .locator('main a')
    .first()
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  for (const d of duration.split(',')) expect(parseFloat(d)).toBeLessThanOrEqual(0.001);
  await expect(page.locator('h1')).toBeVisible();
});

test('copy e-mail button copies and announces', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only here');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  const button = page.locator('main button[data-copy]').first();
  await expect(button).toHaveAccessibleName('Copy');
  await button.click();
  await expect(button).toContainText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('utkarshjsr7@gmail.com');
  await expect(page.locator('[data-copy-status]').first()).toHaveText('E-mail address copied');
});
