import { test, expect } from '@playwright/test';

test('skills page: a tool opens with the keyboard and shows where it was used', async ({ page }) => {
  await page.goto('/skills');
  const docker = page.locator('details[data-tech="docker"]');
  await docker.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(docker).toHaveAttribute('open', '');
  await expect(docker.getByRole('link', { name: 'ScopeTrace' })).toBeVisible();
  await expect(docker.getByRole('link', { name: 'DevOps internship' })).toHaveAttribute(
    'href',
    '/about#experience',
  );
  // The project link goes to the work index, filtered to this technology
  await docker.getByRole('link', { name: /projects that use Docker/ }).click();
  await expect(page).toHaveURL(/\/work\?tech=docker$/);
  await expect(page.locator('[data-tech-filter]')).toContainText('Docker');
  await expect(page.locator('[data-count]')).toHaveText(/^Showing \d+ of \d+ projects$/);
});

test('skills page: every tool is listed in the HTML, without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/skills');
  const names = await page.locator('section.toolkit details summary .name').allTextContents();
  expect(names).toEqual(
    expect.arrayContaining(['Python', 'Kubernetes', 'Terraform', 'LLM integration', 'AWS']),
  );
  for (const h of ['Backend engineering', 'AI systems', 'Cloud & DevOps'])
    await expect(page.getByRole('heading', { level: 3, name: h })).toBeVisible();
  await context.close();
});

test('work filters: discipline buttons filter, announce the count and update the URL', async ({ page }) => {
  await page.goto('/work');
  const all = page.locator('[data-entry], li.row');
  const total = await all.count();
  const cloud = page.getByRole('button', { name: /^Cloud & DevOps/ });
  await cloud.click();
  await expect(cloud).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/\?area=cloud$/);
  const visible = await page.locator('[data-entry]:visible, li.row:visible').count();
  expect(visible).toBeGreaterThan(0);
  expect(visible).toBeLessThan(total);
  await expect(page.locator('[data-count]')).toHaveText(`Showing ${visible} of ${total} projects`);
  // Every visible entry is tagged Cloud & DevOps
  for (const tags of await page
    .locator('[data-entry]:visible, li.row:visible')
    .evaluateAll((els) =>
      els.map(
        (e) =>
          (e as HTMLElement).dataset.areas ?? e.querySelector<HTMLElement>('[data-areas]')?.dataset.areas,
      ),
    ))
    expect(tags).toContain('cloud');
  await page.getByRole('button', { name: /^All/ }).click();
  await expect(page).toHaveURL(/\/work$/);
  await expect(page.locator('[data-entry]:visible, li.row:visible')).toHaveCount(total);
});

test('work filters: without JavaScript every project is listed and the controls stay hidden', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/work?area=cloud');
  await expect(page.locator('[data-filters]')).toBeHidden();
  const entries = page.locator('[data-entry], li.row');
  await expect(entries.first()).toBeVisible();
  expect(await page.locator('[data-entry]:visible, li.row:visible').count()).toBe(await entries.count());
  await context.close();
});

test('ScopeTrace explorer: opening a component highlights its node; clicking a node opens it', async ({
  page,
}) => {
  await page.goto('/work/scopetrace');
  const gateway = page.locator('[data-explain="gateway"]');
  await gateway.locator('summary').click();
  await expect(gateway).toHaveAttribute('open', '');
  await expect(gateway).toContainText('The only path to a model');
  const visibleNode = (id: string) => page.locator(`.diagram svg:visible [data-node="${id}"]`);
  const opacity = (id: string) => visibleNode(id).evaluate((g) => getComputedStyle(g).opacity);
  // Opacity eases over 150 ms, so wait for the settled value
  await expect.poll(() => opacity('gateway')).toBe('1');
  await expect.poll(async () => Number(await opacity('redis'))).toBeLessThan(0.5);
  // Pointer shortcut: click the Redis node in the drawing
  await visibleNode('redis').click();
  await expect(page.locator('[data-explain="redis"]')).toHaveAttribute('open', '');
  await expect.poll(() => opacity('redis')).toBe('1');
});

test('skills page: a deep link opens that tool', async ({ page }) => {
  await page.goto('/skills#tech-kubernetes');
  await expect(page.locator('#tech-kubernetes')).toHaveAttribute('open', '');
});

test('home inventory: a tool opens its evidence in place, and closes again', async ({ page }) => {
  await page.goto('/');
  const k8s = page.locator('[data-inventory] button[data-tech="kubernetes"]');
  await expect(k8s).toHaveAttribute('aria-expanded', 'false');
  await k8s.click();
  await expect(k8s).toHaveAttribute('aria-expanded', 'true');
  const panel = page.locator('[data-evidence]');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Kubernetes: where I used it');
  await expect(panel.getByRole('link', { name: 'DevOps internship' })).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Kubernetes Notes App Deployment' })).toBeVisible();
  await k8s.click();
  await expect(panel).toBeHidden();
  await expect(k8s).toHaveAttribute('aria-expanded', 'false');
});

test('home inventory: without JavaScript every tool is a link to its evidence', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  const link = page.locator('[data-inventory] a.chip[data-tech="docker"]');
  await expect(link).toHaveAttribute('href', '/skills#tech-docker');
  await expect(page.locator('[data-evidence]')).toBeHidden();
  await context.close();
});

test('build activity: the snapshot is dated and says it is not live', async ({ page }) => {
  for (const path of ['/', '/code']) {
    await page.goto(path);
    const caption = page.locator('figure.activity figcaption');
    await expect(caption).toContainText(/Snapshot taken \d{1,2} \w{3,4} \d{4}, not live/);
    await expect(page.locator('figure.activity [role="img"]')).toHaveAttribute('aria-label', /commits/);
  }
});

test('navigation: Code and Skills are reachable and marked current', async ({ page }) => {
  await page.goto('/');
  for (const [name, url] of [
    ['Code', /\/code$/],
    ['Skills', /\/skills$/],
  ] as const) {
    await page.getByRole('banner').getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole('banner').getByRole('link', { name, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
  }
});

test('home motif: decorative, and static under reduced motion', async ({ browser }) => {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    const context = await browser.newContext({ reducedMotion });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('.bus')).toHaveAttribute('aria-hidden', 'true');
    const running = await page.evaluate(
      () => document.getAnimations().filter((a) => a.playState === 'running').length,
    );
    if (reducedMotion === 'reduce') {
      await expect(page.locator('.track')).toBeHidden();
      expect(running).toBe(0);
    } else {
      expect(running).toBeGreaterThan(0);
    }
    await context.close();
  }
});

test('ScopeTrace explorer on a phone: "Show in diagram" brings the highlighted node on screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/work/scopetrace');
  const item = page.locator('[data-explain="gateway"]');
  await item.locator('summary').click();
  const link = item.getByRole('link', { name: /Show in diagram/ });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/#scopetrace-diagram$/);
  await expect(page.locator('.diagram:not(.preview) svg.narrow [data-node="gateway"]')).toBeInViewport();
});
