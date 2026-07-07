# TomorrowRank — Design Update (Welcome Tomorrow dark theme)

This update replaces the old white/yellow entry design with the Welcome Tomorrow
dark hero look (warped green grid + edge glow), applied across the whole app:
the entry screen, the running-audit screen, and the results report.

## What changed
- **components/Background.tsx** (new) — fixed full-viewport canvas: pure-black base,
  warped "gravity-well" grid mesh (SVG feDisplacementMap) and olive-green light
  bleeding from the edges. Mounted once in `app/layout.tsx`, so it sits behind every
  page automatically.
- **app/layout.tsx** — mounts `<Background />`; body is now black with white text.
- **app/globals.css** — black canvas, dark form controls, dark scrollbar, green
  progress halo. The old hand-drawn underline was removed.
- **tailwind.config.ts** — new dark/green token set:
  - `wtgreen` #4CA66B (CTA, sampled from the brand screenshot)
  - `wtgreenDeep` #3E9059 (hover)
  - `wtglow` #9BC846 (edge glow / accents)
  - `glass` / `glassStrong` / `glassBorder` (translucent panels)
  - `muted` #B9C2BC (body text on dark)
- **app/page.tsx** — transparent nav over the canvas; the ☀ + text wordmark was
  replaced with the provided Welcome Tomorrow logo, recolored white so it reads on
  black (`public/welcome-tomorrow-logo.png`).
- **components/AuditApp.tsx** — heading "SEO Audit & AI Visibility Tool" is now white
  with no underline; "AUDIT →" button uses the brand green; inputs/selects and the
  processing screen are dark glass with green accents.
- **components/Report.tsx**, **Primitives.tsx**, **AiVisibility.tsx** — all cards are
  dark "glass" panels so the warped background shows through; gauges/charts use a
  green-led palette on dark.
- **public/welcome-tomorrow-logo.png** (new) — your supplied logo, inverted to white.

## Notes
- The logo is your exact artwork, inverted to white so it shows on the black bar.
- `next build` succeeds and all pages render (verified in a headless browser).
- A build-time warning about fetching `fonts.googleapis.com` only appears in network-
  restricted sandboxes; it is harmless and does not occur on Vercel.

---

## Update 2 — Audit reliability + diagnostics

Fixes the "Unexpected end of JSON input" runtime error (a server crash that returned
an empty body) and makes deploy issues self-diagnosing.

- **lib/store/jobs.ts** — Upstash read/write wrapped in try/catch with clear,
  actionable error messages; added `isRedisConfigured()` and `pingStore()` for health.
- **app/api/audit/start/route.ts** — whole handler wrapped in try/catch so it ALWAYS
  returns JSON (never an empty 500); returns a clear message when Upstash isn't set;
  background worker now triggered via Vercel `waitUntil` for reliable delivery.
- **app/api/audit/run/route.ts** — returns immediately and runs the audit under
  `waitUntil`; catches pipeline errors and records them on the job.
- **app/api/audit/health/route.ts** (new) — `GET /api/audit/health` reports which env
  vars are present (booleans only) and whether Redis is actually reachable.
- **components/AuditApp.tsx** — robust response parsing surfaces the real server error
  instead of "Unexpected end of JSON input"; status polling handles failures gracefully.
- **package.json** — added `@vercel/functions` (for `waitUntil`).

See DEPLOYMENT.md for the full env-var checklist and the health-check workflow.

---

## Update 3 — Accurate meta-tag extraction (fixes false SEO issues)

Well-optimized pages were being flagged for "missing" title/description/canonical.
Root cause was in `lib/seo/fetcher.ts`: the regexes were attribute-order- and
quote-sensitive. Rewrote head-metadata extraction to be robust:

- **Order-independent attribute parsing** — `<meta>` / `<link>` tags are now parsed
  into attribute maps, so `<meta content="..." name="description">` (content first)
  and `<link href="..." rel="canonical">` (href first) are read correctly.
- **Quote-safe values** — values containing apostrophes (e.g. "Kenya's") are no
  longer truncated; single-quoted and unquoted attributes are supported.
- **HTML entities decoded** — `&amp;`, `&#39;`, `&quot;`, numeric/hex entities are
  decoded so title/description text and character counts are accurate.
- Applied the same robust parsing to canonical, robots meta, viewport, favicon,
  hreflang, and Open Graph / Twitter card counts.

Verified with a test page using content-first attributes, apostrophes, entities and
single quotes — all fields now extract correctly instead of being flagged.

### Known limitation
The fetcher reads static HTML only. Pages that inject meta tags client-side via
JavaScript (pure SPAs) won't expose them to static analysis. Most sites server-render
these tags, so this is rarely the cause — but if a specific site still shows missing
tags, check whether its `<title>`/`<meta>` are present in "View Source" (static) vs only
in the rendered DOM (JS). Headless rendering could be added later if needed.

---

## Update 4 — Fix the infinite "Polling AI engines" hang + real Claude citations

### The hang (critical)
The whole audit ran in one Vercel function (60s on Hobby). AI Visibility makes
several Claude+web-search calls that can take 60–120s, so the function was killed
mid-step and the job was never marked done/error — the UI polled a half-finished
job forever. Fixed:
- **Wall-clock budget** in `lib/orchestrator.ts` (`AUDIT_BUDGET_MS`, default 50s). The
  core SEO/GEO/backlinks/PageSpeed report is always saved and the job is ALWAYS marked
  `done` (or `error`) — it can no longer hang.
- **AI Visibility is time-boxed** (`withTimeout`) against the remaining budget; if it
  can't finish in time it's skipped and the report still completes.
- **PageSpeed timeout** cut from 90s → ≤20s (it was longer than the whole budget) and
  is now clamped to the remaining budget.
- FAST_MODE prompt count trimmed 3 → 2; `deriveContext` no longer uses web search.

> On Vercel **Pro**: set `AUDIT_BUDGET_MS=240000` and raise `maxDuration` to 300 in
> `app/api/audit/run/route.ts` for the full multi-engine depth.

### Citations (requested)
Claude's web-search calls now surface the **actual sources** instead of discarding them:
- `claudeAnswerWithCitations()` in `lib/providers/llm.ts` reads `web_search_tool_result`
  blocks + inline text citations, dedupes them, and returns `{ answer, citations }`.
- The engine threads these into `AiVisibilityReport.citations`, flagging any source whose
  URL/title references the brand (`brandCited`).
- A new **Citations** card in `components/AiVisibility.tsx` lists the sources, links out,
  and highlights "cites your brand".

## NOT yet built (needs an infrastructure decision) — multi-page crawl / Ahrefs hybrid
Requested: if the domain is a verified Ahrefs project → use Ahrefs Site Audit; else →
in-app crawler covering 50+ pages. This is designed but NOT in this build because a
50+ page crawl cannot run in a 60s Hobby function — it requires Vercel **Pro**
(maxDuration 300) or a queued multi-invocation crawl. See chat for the plan.

---

## Update 5 — Foundation for the multi-page crawler (per-page analyzer)

Added `lib/crawl/analyzer.ts`: a tested, data-backed per-page analyzer that extracts
real facts from each crawled page (no guessing) aligned to the Welcome Tomorrow audit
rubric (Tech + Content tabs): decoded title + length, meta description + length,
canonical + self-reference, robots/noindex, H1s (count + text), H2 outline, word count /
thin-content, viewport, favicon, OG/Twitter counts, JSON-LD @types (incl. @graph),
FAQ / Breadcrumb / Article schema, FAQ-by-content heuristic, image alt coverage,
internal vs external links, empty anchors, hreflang.

This is the foundation the crawler + hybrid + clickable drill-down report build on.
Not yet wired into the live audit flow — see chat for the plan and the two decisions
needed (Vercel Pro vs Hobby crawl architecture; connect Google Search Console).

---

## Update 6 — Multi-page crawler + Ahrefs hybrid + clickable drill-down report

Built the multi-page audit on the tested analyzer foundation.

- **lib/crawl/crawler.ts** — crawls up to `CRAWL_MAX_PAGES` (default 50) starting from
  the homepage: discovers URLs via sitemap.xml / robots.txt sitemaps, else BFS of
  internal links; limited concurrency; budget-aware so the audit always finishes.
- **lib/crawl/issues.ts** — maps crawled facts to the Welcome Tomorrow rubric (Tech +
  Content tabs) as prioritized issues (your 1–9 scale), each recording EVERY affected
  URL with first-hand evidence + a recommendation + action chips. Checks that need GSC
  or a SERP/LLM data source are emitted as "not_checked" with a reason — never faked.
  `scoreFromIssues()` rolls them into a weighted score/grade.
- **lib/providers/ahrefs-siteaudit.ts** — hybrid routing: if the domain is a verified
  Ahrefs Site Audit project, use Ahrefs' crawl; otherwise the in-app crawler. Defensive
  (any failure falls back to the crawler).
- **components/SiteIssues.tsx** — clickable report: each issue expands to list every
  affected URL + evidence, then recommendation + actions (Fix / Add / Remove / Contact
  developer / SEO or content specialist). Passed + not-checked shown separately.
- **types/audit.ts** — added `SiteIssue`, `CrawlMeta`, and `report.siteIssues` / `crawlMeta`.
- **lib/orchestrator.ts** — runs the hybrid crawl (time-boxed) and attaches results.

### Deploy notes
- On **Vercel Pro**: set `maxDuration=300` in `app/api/audit/run/route.ts`,
  `AUDIT_BUDGET_MS=240000`, and `CRAWL_MAX_PAGES=50`. On Hobby the crawl is skipped when
  the 60s budget can't accommodate it (core report still completes).

### Still needs live data to finish (honest)
- Ahrefs Site Audit per-URL detail + the exact field mapping is best-effort until pointed
  at a real verified project.
- H1-matches-service, content quality/E-E-A-T, semantic depth, AI-Overview presence still
  need the Claude-judgment layer / DataForSEO to be fully data-backed.

---

## Update 7 — Fix false crawl results + clickable AI insights

Fixes for the first live audit (welcometomorrow.io) which showed false data.

1. **Only 1 page crawled → now follows the sitemap index.** `discoverFromSitemaps`
   rewritten to read robots.txt sitemaps, detect `<sitemapindex>`, and follow child
   sitemaps (bounded to 30 sitemaps / 200 URLs) to build the real page list.
2. **False "noindex" / 403 findings removed.** The site is Cloudflare-protected and
   was serving a 403/bot-challenge page whose meta contained noindex. Added
   `looksBlocked()` + a `blocked` flag on every page. Blocked pages are excluded from
   ALL content/meta/noindex/status checks and instead reported honestly as
   "Pages could not be read (bot protection / 403 / JS challenge)" — no invented issues.
   Fetch now uses a real browser User-Agent + headers to reduce false 403s.
3. **AI Visibility insights are now clickable.** Each insight expands to show the real
   probes behind it: the exact prompt sent to each engine, the AI's answer, whether the
   brand was mentioned, and the sources the AI cited. Added `probes` to
   `AiVisibilityReport` and threaded prompt→answer pairing through the engine.

### Known limitation (still)
Cloudflare-protected / JS-rendered sites may still not be fully readable by a static
fetch — the crawler now says so honestly instead of inventing findings. Full fix =
headless-browser rendering (planned as a separate follow-up).

---

## Update 8 — Fix "stuck at Queued" + slow start (Render)

Root cause: the app used a Vercel-style self-HTTP call (`/start` → `/api/audit/run`)
with `waitUntil`. That's right for Vercel serverless but fragile on an always-on
server like Render — on a cold start the internal call must wake the service, which
left jobs sitting at "Queued" and made starts feel stuck.

- **In-process execution on long-lived servers.** When `RENDER=true` (Render sets this)
  or `RUN_AUDIT_INLINE=true`, `/start` now runs `runAudit()` directly in the same
  process — no self-HTTP call. The Vercel HTTP-trigger path is kept for serverless.
- **maxDuration raised to 300** on the run route (Render ignores it; Vercel Pro honors).
- **Cold-start-aware UI.** The progress screen now shows "Waking the server (free tier
  can take up to ~1 min)…" instead of a silent "Queued", and nudges the bar so it never
  looks frozen.

### Recommended env var
Add `RUN_AUDIT_INLINE=true` in Render to guarantee in-process execution.

---

## Update 9 — Searchable country selector + visible dropdown hover

- **All 196 countries**, sorted with common ones (Kenya, US, UK, Nigeria, South Africa,
  Ghana, Tanzania, Uganda) pinned to the top. `locationCode` is now optional; countries
  without a DataForSEO code still work for crawl + AI-visibility (which use the country
  name). DataForSEO calls fall back to a default code where unmapped.
- **New `components/SearchableSelect.tsx`** replaces the native `<select>`, whose option
  hover rendered dark-on-dark (invisible). The new dropdown is scrollable, searchable
  (type to find your country), and shows clear hover/selection — white text on green.
  Used for both Country (searchable) and Language.

---

## Update 10 — Fix AI Visibility bubble tooltip readability

- Tooltip text is now **white** (`labelStyle`/`itemStyle` = #fff) — was dark-on-dark and unreadable.
- Fixed **double percent** ("54%%") — axes no longer add `unit="%"` on top of the formatter; ticks keep `%` via tickFormatter.
- Hid the internal bubble-size value that was showing as a stray "z : 648%".

---

## Update 11 — Lead-capture gate before audit runs

A non-dismissable gate now appears when the user clicks Audit; the audit only
starts after a valid submission (also enforced server-side, so it can't be bypassed
by hiding the popup — the /api/audit/start call happens only after /api/lead succeeds).

- **components/LeadGate.tsx** — Welcome Tomorrow styled modal: first name, last name,
  company email, position (optional), and a required agreement checkbox
  ("I agree to receive the SEO audit on my email from Welcome Tomorrow, and possible
  reach-out if I'd like a customized report."). No close/X, no outside-click/ESC dismiss.
- **app/api/lead/route.ts** — validates: name + agreement required; valid email format;
  **rejects free providers** (Gmail/Yahoo/Outlook/iCloud/Proton/etc.); **MX-record check**
  so fake/dead domains are rejected. Stores the lead.
- **lib/store/leads.ts** — stores leads in Upstash Redis (free, already connected).
  Swap to a CRM later by changing saveLead()/listLeads() only.
- **app/api/leads/route.ts** — protected export to demo captured leads:
  `/api/leads?secret=INTERNAL_SECRET` (JSON) or add `&format=csv` to download CSV.

### Note / future
- "Unremovable" is enforced at the action level (no audit without a valid lead), which is
  the real, dependable version — a pure front-end popup can always be hidden in dev tools.
- True "this person owns this inbox" requires a verification link (double opt-in) + an
  email-sending service — a follow-up when you wire email/CRM.

---

## Update 13 — AWS-ready: basePath /ranktomorrow + Docker (Maxime's tools./ranktomorrow model)

- **next.config.js**: added `basePath: "/ranktomorrow"` (app now served under tools.welcometomorrow.io/ranktomorrow) and `output: "standalone"` (small container image).
- **components/Gate.tsx**: added BASE_PATH + `apiPath()` helper (client-side fetch is NOT auto-prefixed by Next.js basePath).
- Prefixed all client API calls with apiPath(): /api/lead (LeadGate), /api/audit/start + /api/audit/status (AuditApp).
- **Dockerfile** (multi-stage, node:20-slim, non-root, runs .next/standalone/server.js on port 3000).
- **.dockerignore** added.
- Verified locally on the standalone server: / → 404, /ranktomorrow → 200, /ranktomorrow/seo → 200, /ranktomorrow/api/audit/health responds.
- On ECS set env var **RUN_AUDIT_INLINE=true** (no RENDER var there) so audits run in-process.

### Routing target (for ECS/ALB step)
- ALB path rule: /ranktomorrow* → this service (container port 3000). Later /tool2* → another service.
- Cloudflare: tools.welcometomorrow.io → ALB (DNS only / grey cloud).

---

## Update 14 — Fix missing logo on AWS (image optimizer under basePath/standalone)

- next.config.js: added `images.unoptimized: true`. Next.js image optimizer endpoint
  (/ranktomorrow/_next/image) fails silently in the standalone container (no sharp),
  so the logo 404'd. Serving images unoptimized (direct from /public) fixes it.
- No other changes. Rebuild image → push to ECR → new task-def revision → update service.
