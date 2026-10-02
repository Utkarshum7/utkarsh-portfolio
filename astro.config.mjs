// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// The canonical origin is supplied at deploy time (domain not chosen yet).
// Local builds fall back to localhost; scripts/check-dist.mjs warns when a build still uses it.
const SITE_URL = process.env.SITE_URL ?? 'http://localhost:4321';

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
