# Utkarsh Amaresh: portfolio

Source for my personal site: a static [Astro](https://astro.build) build with three engineering case studies,
supporting projects, and an About page. No client framework, no third-party scripts, no tracking.

## Stack

Astro 7 (static output) · TypeScript (strict) · MDX content · plain CSS with design tokens · IBM Plex (self-hosted).
Tests: `node --test`, Playwright, axe, Lighthouse CI.

## Local development

Requires Node 24 (see `.nvmrc`).

```bash
npm ci
npm run dev        # local dev server
npm run build      # lint → type check → build → output checks → size budgets
npm run preview    # serve the production build
```

## Commands

| Command                  | What it does                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `npm run build`          | Content lint → `astro check` → build → output checks → size budgets (any failure stops the build)  |
| `npm run test:unit`      | Unit tests for the validation rules and scripts (`node --test`)                                    |
| `npm run test:e2e`       | Playwright at 360 / 768 / 1280 px, light and dark: layout, navigation, links, keyboard, SEO, axe   |
| `npm run lhci`           | Lighthouse CI (mobile preset, 3 runs per page) against the performance budget; run after `build`   |
| `npm run check:boundary` | Fails if private material, secrets, local paths or build/test output would be committed            |
| `npm run smoke`          | Post-deployment smoke test against a live origin (see below)                                       |
| `npm run status`         | Checks the deployed demos and writes the build-time snapshot shown under "Running systems"         |
| `node scripts/github-activity.mjs` | Refreshes the build-activity snapshot (`src/data/activity.json`) from the public GitHub API, no token; commit the result |
| `npm run og`             | Re-renders the social-share image (`public/og/default.png`)                                        |
| `npm run format`         | Prettier                                                                                           |

## How content stays honest

Every number and strong claim on the site is rendered from `src/data/claims.yaml`, where each entry records its
status and a public source (usually a file at a pinned commit). Pages reference claims by id; an unknown id, an
unpublishable status, an unsourced metric in prose or a leftover draft marker fails the build.

## Environment configuration

No value below is stored in this repository.

| Name                      | Kind                                   | Purpose                                                                                                                                                                                  |
| ------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SITE_URL`                | Build variable (not secret)            | Production origin, e.g. `https://your-domain`: origin only, no path. Used for canonical URLs, Open Graph/Twitter URLs, JSON-LD, the sitemap and `robots.txt`. Defaults to localhost when unset. |
| `REQUIRE_SITE_URL`        | Build variable (`1` in production)     | Makes the build **fail** if `SITE_URL` is missing, not `https://`, a local address, or has a path. Set it on every production build so localhost can never reach a deployed canonical URL.  |
| `CONTENT_GOVERNANCE_JSON` | Secret (CI and the production host) | Private validation data (lists of names and strings that must never appear in the output). Locally the scripts read it from `GOVERNANCE_DIR` (default `../governance`). In CI and on the host's build the checks **fail closed** without it. |
| `DEPLOY_HOOK_URL`         | Secret (optional, scheduled job only)  | If set, the daily status workflow calls it to rebuild the site with a fresh "Running systems" snapshot. Inactive when unset.                                                              |

```bash
# Production-style build (example origin shown; use your own)
REQUIRE_SITE_URL=1 SITE_URL=https://your-domain npm run build
```

## Deploying

The site is fully static: Astro builds plain HTML into `dist/`. It needs no server, adapter or functions.

- **Build command:** `npm run status && npm run build` (checks the demos for the "Running systems" snapshot, then lints
  content, type-checks, builds, scans the output and enforces size budgets).
- **Output directory:** `dist`
- **Node:** 24 (`.nvmrc`)
- **Environment:** `SITE_URL`, `REQUIRE_SITE_URL=1` and `CONTENT_GOVERNANCE_JSON` (see above). Set them for production
  builds, and for preview builds if previews are built.

### Response headers: `public/_headers` is the source, `vercel.json` is derived

Security and caching headers (a Content Security Policy, HSTS, `X-Frame-Options` and the rest) are written once, in
`public/_headers`. That file works on Cloudflare Pages and Netlify but **is ignored by Vercel**, which reads headers
from `vercel.json` instead. So `vercel.json` is **generated from `public/_headers`** and must not be edited by hand:

```bash
node scripts/csp-hashes.mjs --write        # after a build: refresh the CSP script hashes, then regenerate vercel.json
node scripts/csp-hashes.mjs --sync-vercel  # only regenerate vercel.json from public/_headers (no build needed)
```

`vercel.json` also turns on `cleanUrls` (pages are built as `about.html` and must be served at `/about`, with
`/about.html` redirecting there) and sets `trailingSlash: false` (`/about/` redirects to `/about`). The `/*.html` cache
rule in `_headers` is not copied: Vercel already revalidates static files by default.

`check-dist` (part of `npm run build`) and the unit tests **fail if `vercel.json` and `public/_headers` disagree**, if
`cleanUrls`/`trailingSlash` change, if any of the seven security headers is missing from `vercel.json`, or if an inline
script is not covered by the CSP in both files. If an inline script changes, run the `--write` command above and commit
both files.

### Vercel

1. Import the repository as a new project. Framework preset **Astro**; no adapter is needed.
2. Build Command: `npm run status && npm run build`. Output Directory: `dist`. Node.js Version: **24.x** (Settings →
   Build and Deployment; Vercel does not read `.nvmrc`).
3. Environment variables (Production and Preview):
   - `SITE_URL`: the production origin, e.g. `https://your-domain` (origin only, no path).
   - `REQUIRE_SITE_URL`: `1`.
   - `CONTENT_GOVERNANCE_JSON`: the private validation data, as a **Sensitive** variable. Vercel builds run with `CI`
     set, so the build **fails closed** without it, and a commit that violates the content rules can never go live.
     The value is never stored in this repository.
4. Optional: create a Deploy Hook for `main` and store its URL as the GitHub Actions secret `DEPLOY_HOOK_URL`, so the
   daily workflow rebuilds the site and keeps the "Running systems" snapshot fresh (it hides itself after 7 days).
5. Do not enable Vercel Analytics or Speed Insights: the site loads no analytics or third-party scripts.

Changing `SITE_URL` requires a new deployment, because canonical URLs, the sitemap and `robots.txt` are generated at
build time.

### Other static hosts

Cloudflare Pages and Netlify read `public/_headers` directly (it is copied into `dist/`). The same build settings apply.

### Automation

- `.github/workflows/ci.yml` runs the full validation on pull requests and `main`. It does not deploy.
- `.github/workflows/scheduled-check.yml` checks the demos daily; it only triggers a rebuild if `DEPLOY_HOOK_URL` is
  configured.

### Post-deployment smoke test

After a deployment, run this against the live origin (read-only; needs no secrets):

```bash
npm run smoke -- https://your-domain
```

It checks that the main pages return 200, an unknown route returns 404, `/about.html` and `/about/` redirect to
`/about`, the sitemap and `robots.txt` exist and use the production origin, canonical and `og:image` URLs use the
production origin, all seven security headers are present (also on the 404 page), hashed `/_astro/` assets are cached
immutably, no secret-like strings appear in any page, and that the ScopeTrace page lists only the approved demo accounts.
