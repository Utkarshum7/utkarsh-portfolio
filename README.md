# Utkarsh Amaresh: portfolio

Source for my personal site: a static [Astro](https://astro.build) build with three engineering case studies,
supporting projects, and an About page. No client framework, no third-party scripts, no tracking.

## Commands

Requires Node 24 (see `.nvmrc`).

| Command                | What it does                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `npm ci`               | Install exact dependencies                                                                            |
| `npm run dev`          | Local dev server                                                                                      |
| `npm run build`        | Content lint → `astro check` → build → output checks → size budgets (any failure stops the build)     |
| `npm run preview`      | Serve the production build                                                                            |
| `npm run test:unit`    | Unit tests for the validation rules and scripts (`node --test`)                                       |
| `npm run test:e2e`     | Playwright at 360 / 768 / 1280 px, light and dark: layout, navigation, links, keyboard, SEO, axe      |
| `npm run lhci`         | Lighthouse CI (mobile preset, 3 runs per page) against the performance budget; run after `build`      |
| `npm run check:boundary` | Fails if private material, secrets, local paths or build/test output would be committed             |
| `npm run status`       | Checks the deployed demos and writes the build-time snapshot shown under "Running systems"            |
| `npm run og`           | Re-renders the social-share image (`public/og/default.png`)                                           |
| `npm run format`       | Prettier                                                                                              |

## How content stays honest

Every number and strong claim on the site is rendered from `src/data/claims.yaml`, where each entry records its
status and a public source (usually a file at a pinned commit). Pages reference claims by id; an unknown id, an
unpublishable status, an unsourced metric in prose or a leftover draft marker fails the build.

Some validation data (lists of names and strings that must never appear in the output) is private and is not part
of this repository. Locally it is read from `GOVERNANCE_DIR` (default `../governance`); in CI from the
`CONTENT_GOVERNANCE_JSON` secret. In CI the checks fail closed when it is missing.

## Deploying

- Set `SITE_URL` to the production origin so canonical URLs, Open Graph tags and the sitemap use it.
  With `REQUIRE_SITE_URL=1` the output check rejects a local origin.
- Host build command: `npm run status && npm run build`, publish directory `dist`.
- `public/_headers` sets the Content Security Policy and other security headers (Netlify / Cloudflare Pages
  format). If an inline script changes, update its hash with `node scripts/csp-hashes.mjs --write`; the output
  check fails until the hash matches.
- `.github/workflows/scheduled-check.yml` checks the demos daily and calls `DEPLOY_HOOK_URL` (if set) to refresh
  the snapshot. The "Running systems" section hides itself when the snapshot is missing, invalid or older than
  seven days.

