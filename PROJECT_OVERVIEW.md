# Project Overview — web-scrapers.com

> **For Claude / future sessions:** read this first. It captures architecture,
> conventions, and the work done so you don't have to re-discover it. Update it
> when you make structural changes.

## What this is

`www.web-scrapers.com` is a **Zola** static site (affiliate content site about
web scraping & proxy providers). It runs in Zola **`mode = "docs"`** using the
**Tanuki** theme, which is a **git submodule** at `themes/tanuki` (so any
checkout/build needs `git submodule update --init --recursive`).

Monetization model: affiliate links to proxy/scraper providers, cloaked behind
`/goto/<slug>/` redirect pages, plus display ads (Google AdSense + A-ADS).

## Repo layout

- `content/` — markdown content
  - `reviews/`, `comparisons/`, `learn/` (Learning Center), `solutions/` (Industry Solutions)
  - `proxy-providers.md` — ranked provider directory (hand-built HTML cards)
- `templates/` — overrides of the theme
  - `base.html` — `<head>` (analytics, ad loader), layout, includes partials
  - `page.html` — article layout (two branches: site/blog vs docs/book/product)
  - `landing.html` — landing page
  - `partials/` — `adsense.html`, `aads.html`, `newsletter.html`, `footer.html`
- `static/` — copied verbatim into the build
  - `static/goto/<slug>/index.html` — generated affiliate redirect pages
  - `static/ads.txt` — AdSense authorization
- `scripts/`
  - `gen-goto.py` — generates the `/goto/` redirect pages from an `AFFILIATES` dict
  - `goto-click-logger.gs` — Google Apps Script (lives in the Google Sheet, not run here)
- `config.toml` — site config; site-specific values live under `[extra]`
- `build` — legacy deploy script (see Deployment); CI now handles deploys
- `.github/workflows/deploy.yml` — CI build + deploy

## `[extra]` config keys (all read by templates and/or scripts)

| Key | Value | Used by |
|---|---|---|
| `ga4_id` | `G-2340JEW0BT` | GA4 snippet in `base.html`; also read by `gen-goto.py` |
| `hotjar_id` | `3142858` | Hotjar snippet in `base.html` |
| `adsense_client` | `ca-pub-2119108362521032` | AdSense loader + ad unit |
| `adsense_slot` | `2937189529` | end-of-article AdSense unit |
| `aads_unit` | `2441049` | A-ADS iframe unit |
| `goto_log_url` | Apps Script `/exec` URL | `gen-goto.py` beacon + newsletter popup |

Every ad/tracking feature is **gated by its config key** — if the key is absent,
the feature renders nothing. Follow this pattern for anything new.

## Key conventions

- **Affiliate links are never raw.** Always link to `/goto/<slug>/`, never the
  provider's affiliate URL directly. The redirect pages are generated, not
  hand-written. To add/update a provider: edit `AFFILIATES` in
  `scripts/gen-goto.py`, run `python3 scripts/gen-goto.py`, then deploy.
- **Inline `<script>` URLs in templates need `| safe`.** Zola/Tera HTML-escapes
  `{{ }}` output by default, which corrupts URLs (turns `/` into `&#x2F;`)
  inside `<script>`. Bug we hit with the newsletter beacon.
- **`hidden` attribute vs CSS `display`.** Author styles like `display:flex`
  override the browser's `[hidden]{display:none}`. If you toggle visibility via
  the `hidden` attribute, add an explicit `.thing[hidden]{display:none}` rule.
  (Hit this twice on the newsletter modal.)
- **Visual changes: screenshot-verify.** Build to a temp dir, serve with
  `python3 -m http.server`, screenshot with headless Chrome, and Read the image.
  This caught real bugs before they shipped.

## Deployment

**Production serves from the `gh-pages` branch** (GitHub Pages), domain via
`CNAME` = `www.web-scrapers.com`.

- **Current (CI):** `.github/workflows/deploy.yml` runs on **push to `main`** —
  checks out submodules, installs **Zola 0.22.1**, `zola build`, and publishes
  `public/` to `gh-pages` via `peaceiris/actions-gh-pages` (preserves CNAME +
  `.nojekyll`). **Merging a PR to main = deploy.** No manual step.
- **Legacy fallback:** `./build` does the same thing locally (force-pushes
  `public/` to `gh-pages`). Still works but redundant now.
- GitHub Pages caches ~10 min; hard-refresh when verifying. `public/` is gitignored.

## Click & subscriber tracking (Google Sheet)

A Google Apps Script web app (`scripts/goto-click-logger.gs`, deployed from the
bound Google Sheet) receives `navigator.sendBeacon` POSTs and appends rows:

- `/goto/` pages POST `{provider, dest, referrer, ua}` → **Clicks** tab
- Newsletter popup POSTs `{type:"subscribe", email, page, ua}` → **Subscribers** tab

**Apps Script gotchas:** web app must be deployed with access = **"Anyone"**
(not "Anyone with a Google account") or anonymous POSTs get 401. After editing
the script, redeploy via **Manage deployments → edit → New version** to keep the
**same `/exec` URL**; a brand-new deployment changes the URL and requires
updating `goto_log_url` + regenerating `/goto/` pages.

## Newsletter

A popup modal (`templates/partials/newsletter.html`, included in `base.html`).
Opens from `a[href$="#newsletter"]` / `[data-newsletter]` triggers and auto-shows
once per visitor after 15s (localStorage `nl-dismissed`). Submits via beacon →
Apps Script → Subscribers tab, then shows a thank-you and auto-closes.
**Storage only — there is no email-sending infrastructure.** The site footer was
removed (user preference); the popup is independent of it.

## Automated weekly content

A **scheduled remote agent** (claude.ai routine) drafts one article per week:

- Routine ID: `trig_01RLMU9A2LBKudPtCQnmAQkc`
- Dashboard: https://claude.ai/code/routines/trig_01RLMU9A2LBKudPtCQnmAQkc
- Schedule: Mondays `0 1 * * 1` UTC = **9am Asia/Manila**
- Behavior: alternates `content/learn/` ↔ `content/solutions/`, picks a fresh
  topic, writes in house style, builds, and **opens a PR** (never deploys/merges).
- Guardrail: must NOT invent promo/pricing/trial claims or unverifiable numbers
  about providers (general capability descriptions only).
- Flow: routine opens PR → human reviews & merges → CI auto-deploys.

## Open / pending items

- **AdSense site review pending** — ad requests fire but return `unfilled` until
  Google approves the site. Nothing to fix on our side; check AdSense → Sites.
- **A-ADS is live** (unit 2441049) and already serving.
- **Unverified claim to check:** the live Playwright article
  (`/learn/playwright-python-scraping/`) contains "7-day free trial, no credit
  card required" about Bright Data — written before the no-fabricated-claims
  guardrail. Verify it matches the real offer or edit it out.
- **Auto-merge-on-approval** workflow was discussed but NOT added (merge is the
  manual human gate before publish).

## Analytics notes

GA4 = `G-2340JEW0BT`. Early traffic from Germany with 0% engagement = datacenter
bots / ad-network verification crawlers (not real users, not caused by Hotjar or
A-ADS). The metrics that matter at this stage: `/goto/` redirect hits (the
"Redirecting…" page in GA + the Clicks sheet) and Subscribers rows — those only
move on real human interaction.
