// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// The canonical origin is supplied at deploy time via SITE_URL (e.g. https://your-domain).
// Local builds fall back to localhost; scripts/check-dist.mjs warns when a build still uses it.
// Production builds set REQUIRE_SITE_URL=1, which makes a missing or non-production origin a hard error.
const REQUIRE_SITE_URL = ['1', 'true'].includes(String(process.env.REQUIRE_SITE_URL ?? '').toLowerCase());
const SITE_URL = resolveSiteUrl(process.env.SITE_URL?.trim(), REQUIRE_SITE_URL);

/**
 * @param {string | undefined} value
 * @param {boolean} required
 */
function resolveSiteUrl(value, required) {
  if (!value) {
    if (required)
      throw new Error(
        'REQUIRE_SITE_URL=1 but SITE_URL is not set. Set SITE_URL to the production origin, e.g. https://your-domain.',
      );
    return 'http://localhost:4321';
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`SITE_URL is not a valid absolute URL: "${value}"`);
  }
  if (required) {
    if (url.protocol !== 'https:')
      throw new Error(`SITE_URL must use https:// in a production build (got "${value}")`);
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname))
      throw new Error(`SITE_URL must not be a local origin in a production build (got "${value}")`);
    if (url.pathname !== '/' || url.search || url.hash)
      throw new Error(`SITE_URL must be an origin only, without a path (got "${value}")`);
  }
  return url.origin;
}

export default defineConfig({
  site: SITE_URL,
  output: 'static',
  trailingSlash: 'never',
  // Inline the ~6 KB of CSS: removes the render-blocking stylesheet round trips (FCP budget)
  build: { format: 'file', inlineStylesheets: 'always' },
  integrations: [mdx(), sitemap({ filter: (page) => !page.endsWith('/404') && !page.includes('/_') })],
  markdown: {
    shikiConfig: { theme: 'css-variables' },
  },
  devToolbar: { enabled: false },
});
