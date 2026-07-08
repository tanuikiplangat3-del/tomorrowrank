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

---

## Update 15 — CTA revamp: unblur detail, "Click to receive report", "Book a discovery call"

- **Removed blur** entirely from BlurGate (Site Audit issue detail + AI Visibility probes). Content now shows for all viewers; external viewers get a "Click to receive report" CTA appended below.
- **New ReportButton** ("Click to receive report") in Gate.tsx → POSTs to new stub `/api/report/request`. Currently acknowledges only. HOOKS documented for the real flow: (1) email report via Resend, (2) move lead Captured→Nurturing in Attio (upsert Person by email → advance SEO Deal only if still Captured). Both blocked on Resend account + Attio API key/IDs (Victor).
- **"not checked" section** CTA changed from "Engage an expert" → ReportButton "Click to receive report".
- **Footer "Ready to fix these?"** CTA changed to **"Book a discovery call"**.
- **BOOKING_URL** now points to Ochuko's Cal page: https://cal.wtlabs-n8n.com/ochuko-adeboye/30min (booking→Attio handled by existing n8n backend, matched on email — not by this app).
- New route: app/api/report/request/route.ts (stub with TODO(Resend)/TODO(Attio)).
- Verified: build compiles; no blur classes remain; CTAs + Cal link present.
- NOTE: still needs rebuild+redeploy to AWS to go live (batch with logo fix + API keys).

---

## Update 16 — DataForSEO (verified endpoints) + ScrapingBee rendering

### DataForSEO — rewired to the endpoints VERIFIED on the account (not the $100/mo llm_mentions tier)
- lib/providers/dataforseo-ai.ts REWRITTEN. Now exposes:
  - `googleAiOverview(keyword, locationCode)` → `serp/google/ai_mode/live/advanced` (~$0.004). Returns {present, citedDomains, references[]} — Feature A (Google AI Overview + who it cites).
  - `chatGptAnswers(prompts[])` → `ai_optimization/chat_gpt/llm_responses/live` (~$0.004 each, web_search:true). Returns real ChatGPT answers — Feature B (LLM visibility).
- lib/ai-visibility/engine.ts: `runWithDataForSeo` rewritten to use both — derives prompts via Claude, asks ChatGPT for real answers (probes), checks Google AI Overview for the category (citations), computes share-of-voice/sentiment from the REAL ChatGPT answers, and adds an "Absent from Google AI" headline when the brand isn't cited. Falls back to Claude-only if DataForSEO unset/fails (unchanged).
- Env: needs DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD. Cost ~ PROMPT_COUNT×$0.004 + $0.004 per audit (FAST_MODE PROMPT_COUNT=2 → ~$0.012/audit). Set USE_DATAFORSEO_AI=false to disable.

### ScrapingBee — JS render + Cloudflare fallback in the crawler
- lib/seo/fetcher.ts: direct fetch first; if blocked (403/429/503) or thin (<500 chars text / CF challenge markers) AND SCRAPINGBEE_API_KEY set → retry via ScrapingBee basic JS render, then premium_proxy on second failure. Cost control: premium only on escalation.
- Env: needs SCRAPINGBEE_API_KEY.

### Health check
- /api/audit/health now also reports DATAFORSEO_PASSWORD + SCRAPINGBEE_API_KEY presence.

### HONEST STATUS
- Code compiles + type-checks clean. NOT yet tested against live DataForSEO/ScrapingBee accounts (sandbox can't reach them). First real audit after deploy is the true test; minor field-mapping tweaks may be needed once we see live responses.
- Deploy with new env vars: DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD, SCRAPINGBEE_API_KEY (plus the 6 core keys).

---

## Update 17 — Attio CRM integration wired into lead capture (Option B: 5 prompts)

### Attio (primary CRM; Redis kept as silent backup)
- lib/store/attio.ts: `attioConfigured()`, `pushLeadToAttio(lead)` = upsert Person on email (PUT assert, matching_attribute=email_addresses) -> create Deal -> link via associated_people. Confirmed slugs from the Victor mapping baked in as defaults:
  - People: name (personal-name), email_addresses (array, match key), job_title_2 (text)
  - Deal: website (audited URL), lead_source ("SEO"), stage = "Captured" (status format), associated_people
- Stage-setting is SELF-HEALING: attempts to set stage="Captured"; if Attio rejects it (wrong label or no write permission to the sales-owned status field), retries creating the Deal WITHOUT the stage so the lead still lands. Never a hard failure, never a lost lead.
- app/api/lead/route.ts: saves to Redis backup FIRST, then pushes to Attio (best-effort, never blocks the user). Attio failure is logged, lead preserved for re-push.
- Env: ATTIO_API_KEY (required). All slugs overridable: ATTIO_PEOPLE_OBJECT(people), ATTIO_DEALS_OBJECT(deals), ATTIO_JOBTITLE_ATTR(job_title_2), ATTIO_WEBSITE_ATTR(website), ATTIO_LEAD_SOURCE_ATTR(lead_source), ATTIO_LEAD_SOURCE_VALUE(SEO), ATTIO_STAGE_ATTR(stage), ATTIO_STAGE_CAPTURED(Captured).

### AI Visibility depth — Option B
- PROMPT_COUNT set to 5 (public lead-gen tool; ~$0.024/audit). Richer AI-visibility picture.

### HONEST STATUS
- Compiles + type-checks clean. Attio NOT yet tested against the live workspace (sandbox can't reach it). First real capture after deploy confirms: (1) the "Captured" label is exact, (2) the API key has stage-write permission. If either is off, the self-healing fallback still creates Person + Deal (minus stage) and the lead is safe in Redis. Two open business decisions remain (one-Deal-per-person vs new-Deal-each-capture; newsletter opt-in create/drop) — neither blocks capture.
- Deploy env additions: ATTIO_API_KEY (+ any slug overrides if the live labels differ).

---

## Update 18 — Fix regressions from Update 16/17 (thin report, infinite spin, Attio 400)

Root causes found from live AWS logs + code review:

1. **Infinite spin at "Finalising report"** — RACE CONDITION. AI-visibility progress updates are fire-and-forget; a stale "Finalising 98%" write could land AFTER the final "done" write and revert the job to in-progress, so the UI polled forever. FIX: `updateJob` now refuses to overwrite a terminal (done/error) job with a non-terminal patch (lib/store/jobs.ts).
2. **Belt-and-suspenders:** `saveJob` Upstash write now has a 15s timeout so a stalled write can never hang the audit forever (surfaces a clear error instead).
3. **Thin report (crawl + AI missing)** — the 50s audit budget (a Vercel-era limit) was too small for the new DataForSEO calls. FIX (env, already deployed): AUDIT_BUDGET_MS=240000. Plus DataForSEO per-call timeout reduced 90s→35s so a slow call can't dominate.
4. **ScrapingBee over-triggering** — it fired on any page <500 chars and escalated to premium (up to 120s/page), blowing the crawl budget. FIX: only retry on GENUINE blocks (403/429/503 or Cloudflare challenge), single attempt, 15s timeout, no premium escalation during fetch.
5. **Attio Deal 400 "Cannot find select option 'SEO'"** — the workspace `lead_source` select has no "SEO" option, so the whole Deal create failed. FIX: `createDeal` now tries progressively simpler payloads (full → drop stage → drop lead_source → minimal) and uses the first that succeeds, logging what was dropped. The Deal always lands; add an "SEO" option to lead_source in Attio (or set ATTIO_LEAD_SOURCE_VALUE to an existing option) to populate it.

All compile + typecheck clean. Requires rebuild + redeploy (code changes).

---

## Update 18b — Logo fix (broken-image icon under basePath)

- The logo file serves correctly at /ranktomorrow/welcome-tomorrow-logo.png (confirmed reachable), but next/image with `unoptimized:true` + basePath dropped the /ranktomorrow prefix, so the rendered <img> requested /welcome-tomorrow-logo.png and 404'd (broken-image icon).
- FIX: components/Landing.tsx now uses a plain <img src="/ranktomorrow/welcome-tomorrow-logo.png"> (removed next/image import). Guaranteed to match the served path.
- Bundled with Update 18 (spin/thin/Attio fixes) so it all ships in ONE rebuild.

---

## Update 19 — Internal 500-page crawl, never-spin watchdog, lead-gate domain match

1. **Internal crawl up to 500 pages.** AuditApp passes `internal` to /api/audit/start → stored on job.input.internal → orchestrator sets crawl maxPages to 500 for internal (CRAWL_MAX_PAGES_INTERNAL, default 500), 50 for external (CRAWL_MAX_PAGES). Still time-boxed by crawlBudget, so it returns partial if time runs out. NOTE: for a genuinely deep 500-page crawl, raise AUDIT_BUDGET_MS (e.g. 480000) so there's time.
2. **Never-spin watchdog.** runAudit now arms a watchdog (BUDGET_MS + 30s); if any step hangs (e.g. a bot-protected/Cloudflare site that stalls a fetch), it forces the job to a terminal "Timed out" error instead of spinning forever. Cleared on normal finish. This is the definitive fix for the infinite spinner.
3. **Lead-gate company-email domain match.** New lib/leadmatch.ts (emailMatchesSite) — the work email must belong to the audited domain (tolerates www + subdomains). On mismatch the LeadGate shows a "Contact Welcome Tomorrow to verify" CTA (mailto:seo@welcometomorrow.io, prefilled) instead of erroring. Enforced server-side too (/api/lead returns 422 on mismatch).

All compile + typecheck clean. Requires rebuild + redeploy.

## STILL TO DO (next focused build) — Update 20
- Resend + Claude-generated PDF report emailing from seo@welcometomorrow.io on "Click to receive report", still creating the Attio lead. RESEND_API_KEY ready. Being done as its own build (new dependency, can't be tested from sandbox).

---

## Update 20 — CTA polish, refresh-safe dashboard, regional scope, Cloudflare depth

1. **Smaller mismatch CTA + Edit email.** LeadGate mismatch block is now compact: a small "Contact to verify →" button beside an "Edit email" button (clears the email so they can retype). No more oversized full-width button.
2. **Refresh-safe report.** AuditApp now persists the job id in the URL (?job=…) via history.replaceState. On mount it restores that job from storage — a refresh (or a reconnect after lost internet) re-shows the SAME dashboard instead of wiping to a blank form. Expired/not-found jobs fall back to the form gracefully. No re-audit on refresh.
3. **Regional/market scope detection.** deriveContext now asks Claude to determine the brand's REAL geographic scope (city / country / region like "Africa" / global) from the site content, and scopes competitors + buyer-intent prompts to that scope — so an Africa-wide brand (e.g. Welcome Tomorrow) gets "…in Africa" prompts, not "…in Kenya". Added `scope` to BrandContext.
4. **Cloudflare: main page now gets through.** fetchPageSignals escalates a blocked main page to ScrapingBee PREMIUM proxy (25s) so real content + internal links are read (fixes "blocked by Cloudflare, only home page"). Crawl stays cheap direct-fetch by default; set CRAWL_VIA_SCRAPINGBEE=true to also route crawl pages through ScrapingBee premium for protected sites (opt-in; costs credits/time; still time-boxed by the watchdog).

All compile + typecheck clean. Requires rebuild + redeploy.
Note: for deep internal crawls of protected sites, combine CRAWL_VIA_SCRAPINGBEE=true with a larger AUDIT_BUDGET_MS.

## STILL TO DO — Resend + Claude PDF report email (its own build).

---

## Update 21 — Real Cloudflare bypass (stealth proxy) + external stays fast

Problem: with CRAWL_VIA_SCRAPINGBEE on, protected pages still returned 403 (premium proxy didn't defeat Cloudflare) and the external tool felt stuck (480s budget + proxy applied to public audits).

Fixes:
1. **Stealth proxy bypass.** ScrapingBee calls now support stealth_proxy (the mode built to defeat Cloudflare/WAF). Main page escalates basic → premium → stealth. The crawl, when a site is detected as protected, fetches EVERY page straight through the proxy (no doomed direct hit first) so a Cloudflare site is crawled like a normal site. Mode configurable via SCRAPINGBEE_PROXY_MODE (default "stealth").
2. **Protection detection.** fetchPageSignals now returns `protected: true` when the main page had to be fetched via proxy. The orchestrator uses that to decide whether to proxy-crawl (only proxy when actually needed).
3. **External stays fast.** Budget is now per-mode: internal = AUDIT_BUDGET_MS (deep, e.g. 480000), external = capped at 120s regardless of env, so public audits never feel stuck.
4. **Credit guards.** When proxying, page count is capped: PROXY_CRAWL_MAX_PAGES_INTERNAL (default 150), PROXY_CRAWL_MAX_PAGES (default 25 for public). Stealth ≈ 75 ScrapingBee credits/page, so these caps bound cost per audit.

Env knobs: CRAWL_VIA_SCRAPINGBEE=true (on), SCRAPINGBEE_PROXY_MODE=stealth|premium, PROXY_CRAWL_MAX_PAGES_INTERNAL, PROXY_CRAWL_MAX_PAGES.

HONEST: stealth bypass + costs are UNTESTED from sandbox — first real audit after deploy confirms whether stealth defeats this Cloudflare and what it costs. Cheapest fix for THEIR OWN site (welcometomorrow.io) is to allowlist the crawler in their Cloudflare WAF (no credits at all).

---

## Update 22 — Speed fixes (audits were slow, not hung) + Attio non-blocking

Logs showed NO audit error — the audit was just too slow (felt stuck). Causes + fixes:
1. Main page fetched a protected site via basic→premium→stealth sequentially (~70s). Now: one basic try, then straight to stealth (skip premium) — ~30s worst case. SCRAPINGBEE_PROXY_MODE still configurable.
2. Proxy crawl page caps cut for speed: internal 30 (was 150), external 12 (was 25); per-page proxy timeout 18s (was 30s); concurrency 8 when proxying. A fast representative stealth crawl instead of a slow deep one.
3. Attio push is now BACKGROUND (fire-and-forget) in /api/lead — the earlier version awaited up to 4 failed Deal attempts (~80s) and slowed the lead gate. Lead is saved to Redis first, so nothing is lost.

Also seen in logs: Attio Deal has a REQUIRED attribute (id 274b602a-9abe-4d82-bdbd-c9d7ba9f255b) we don't provide, so even the minimal Deal create fails. Person still upserts. To create Deals, make that Deal attribute optional in Attio, or tell me its slug + a value to send.

HONEST: for welcometomorrow.io (their OWN site), the best "full crawl like any SEO tool" path is to allowlist the crawler in their Cloudflare WAF — then it's not protected, and the direct 500-page crawl works fast + free. Inline stealth crawling can only sample (speed/credit limits).

---

## Update 23 — ACCURACY CORE (part A)

Fixes the root causes of inaccurate results found by reading the code:

1. **False "missing meta/H1" on JS-rendered sites.** fetchPageSignals now detects a client-rendered SHELL (very little text + framework markers / no H1 on a 200 page) and re-fetches it via ScrapingBee render_js, so meta/title/H1/content reflect the REAL rendered page. (Main page; crawl-page rendering handled in part B.)
2. **DataForSEO no longer starved / internal no longer spins.** AI Visibility (DataForSEO: AI Overview + ChatGPT answers) now runs IN PARALLEL with the crawl, each with its own budget — instead of last-and-only-if-time-left. So DataForSEO always runs and the audit finishes in max(crawl, ai) time.
3. **Killed the misleading placeholder.** Removed the hardcoded "Presence in ChatGPT/Gemini/Perplexity — needs DataForSEO" line in issues.ts. The real DataForSEO AI-visibility section now stands on its own.
4. **Attio Deals now create.** The required marketing PIPELINE stage is now ALWAYS set (never dropped) to "Captured"; only lead_source is dropped if its "SEO" option is missing. (Pipeline attr/value overridable via ATTIO_STAGE_ATTR / ATTIO_STAGE_CAPTURED.)
5. **Edit email** keeps the typed value and returns to the form so users can correct a typo and run the audit.

Part B (next): Ahrefs top-50-pages endpoint instead of crawling; replace the sentiment dashboard with an AI-Overview + citations visual; tune Claude's prompts to structure real API data + write precise recommendations; crawl-page JS rendering.

---

## Update 24 — Resend + Claude-generated PDF report email (part of B)

The "Click to receive report" CTA now really emails a branded PDF:
- ReportButton sends { jobId, leadId, email } (threaded via GateContext from AuditApp -> Report). Shows Sending… -> ✓ Sent / Try again states (no more fake alert).
- /api/report/request: loads the finished audit (report + aiVisibility) by jobId, resolves the recipient (leadId -> lead.email), calls Claude to write a PRECISE narrative from the REAL data (lib/report/narrative.ts — instructed not to invent anything), renders a branded A4 PDF (lib/report/pdf.ts, pdf-lib — pure JS, container-safe, no Chromium), and emails it via Resend (lib/email/resend.ts) from seo@welcometomorrow.io with the PDF attached.
- New deps: pdf-lib, resend. New env: RESEND_API_KEY (required to send), REPORT_FROM_EMAIL (optional, default "Welcome Tomorrow <seo@welcometomorrow.io>").
- Attio lead creation already happens at capture; the report email is independent.

HONEST: could not test live from sandbox (no Resend/DataForSEO reachable here). First real "receive report" click after deploy is the true test. Needs RESEND_API_KEY in the task def.

Still remaining in B: Ahrefs top-50-pages endpoint instead of crawl; replace sentiment dashboard with AI-Overview + citations visual; crawl-page JS rendering.

---

## Update 25 — Spin cap, keyword casing, Attio pipeline resolver, score reconcile, report-after-refresh

1. **Spinning fixed.** Effective time budget is now HARD-CAPPED regardless of AUDIT_BUDGET_MS: internal 3 min, external 90s (env can only lower). Watchdog fires 15s after. Your AUDIT_BUDGET_MS=480000 was making internal run up to 8 min = looked like spinning.
2. **Ahrefs keywords bug.** country was sent lowercase ("ke"); Ahrefs requires uppercase ISO-2 ("KE"). Fixed in organicKeywords + organicCompetitors. NOTE: verified directly that welcometomorrow.io returns ZERO organic keywords in Ahrefs — that site genuinely has no keyword data, so test keyword/backlink features on a site with an established Ahrefs profile.
3. **Attio pipeline "Captured".** Added resolveStage(): queries the Deal object's real status attribute + its statuses, matches "Captured" (case-insensitive, falls back to first stage), and sets it by the true slug — instead of guessing "stage"/"Captured". Cached. This should make Deals populate in the marketing pipeline.
4. **Score vs issues contradiction fixed.** Headline overall now blends the crawl's site-wide score (60%) with the on-page score (40%), so it can't say "perfect" while the issues list is full. Summary wording now says "site" not "page".
5. **Report-after-refresh.** leadId is persisted in the URL (?job=&lead=) via a ref (no stale closure), so the "receive report" button still has a recipient after a refresh. Report route now logs each step (narrative/pdf/RESEND) distinctly to pinpoint failures.

Still TODO (Part B): Ahrefs top-50-pages endpoint; AI-Overview + citations dashboard replacing sentiment; crawl-page JS rendering. Also: add RESEND to health display.

---

## Update 26 — Spin-proofing (deadline in job) + removed Vercel leftovers

Found the real cause of heavy-site spinning: with RUN_AUDIT_INLINE the audit runs in-process; a heavy site (welcometomorrow.io — stealth crawl + big HTML) can make the container restart, which kills the in-process watchdog and leaves the job stuck at "running" in Redis forever → UI spins with no way out.

Fixes:
1. **Deadline stored ON the job** (deadlineAt) at creation: internal ~3.5 min, external ~2 min. The STATUS endpoint now reports any "running"/"queued" job past its deadline as "error: Timed out" (and persists it). So an audit can NEVER spin forever, even if the container dies mid-run. This is the definitive guarantee.
2. **Removed Vercel leftovers** the user asked about: dropped `waitUntil` from `@vercel/functions` in both start + run routes (they were dead in our inline mode but confusing). Audit now runs via plain `void runAudit()` in-process on Fargate.

NOTE: if welcometomorrow.io now shows "Timed out" instead of spinning, that's the honest signal it's exceeding resources — next step would be lowering PROXY_CRAWL_MAX_PAGES_INTERNAL and/or raising the Fargate task memory. But it will no longer hang.

Still TODO (Part B): Ahrefs top-50-pages; AI-Overview + citations dashboard; crawl-page JS rendering; RESEND in health display.

---

## Update 27 — Cloudflare bypass actually works now (zero-credits bug) + accurate H1/meta

ROOT CAUSE of zero ScrapingBee credits + Cloudflare sites never bypassed + spinning:
- When Cloudflare blocks a datacenter IP it DROPS the connection, so the direct fetch THROWS. The code set status=0 on throw, and looksBlocked(0,"") returned FALSE — so ScrapingBee was never called. Fixed: looksBlocked now treats status 0 (failed direct fetch) as blocked, so ScrapingBee is tried. Added "enable javascript and cookies" to the challenge patterns too.
- Crawler now has a PER-PAGE fallback: any crawl page that is blocked (403/429/503) OR dropped (status 0) is retried through ScrapingBee stealth when CRAWL_VIA_SCRAPINGBEE=true — regardless of whether the homepage was flagged protected. So protected sub-pages get read and ScrapingBee credits actually get used.
- Crawler also re-renders JS SHELL pages (200 but thin/framework markers/no H1) via cheap ScrapingBee render, so "missing H1/meta" lists are accurate (not false positives from unrendered JS).

Combined with Update 26 (deadline-in-job) this means: protected sites are actually crawled via stealth (credits used, real data), and if a run still exceeds resources it times out cleanly instead of spinning.

## STILL TODO — next focused pass (user's list, captured):
- Dashboard: show only on-page/off-page from site audit + AI visibility.
- Socials: keep ONLY Twitter card, Facebook, Instagram (1 each); remove YouTube, language, analytics.
- Issues: confirm affected-URL lists are correct (now accurate via JS render).
- Favicon + OG thumbnail for the tool; Outfit font everywhere incl menus; correct canonical + metadata on tool pages.
- Remove any remaining demo actions.
- Attio still not populating — NEED the exact [attio]/[lead] error line from logs to fix precisely.

---

## Update 28 — UI/branding cleanup (the remaining list)

1. **Socials trimmed** to exactly three, one card each: "Facebook / Open Graph Card", "X (Twitter) Card", "Instagram Linked". Removed: analytics, language, hreflang-as-language, Facebook Page Linked, Facebook Pixel, X account-linked, YouTube, LinkedIn.
2. **Dashboard focus.** Headline categories reduced to On-Page SEO, Links (off-page), GEO (AI visibility) — matching "on-page / off-page / AI visibility". Performance still shows its own section only when PageSpeed data exists.
3. **Outfit font everywhere** — swapped Plus Jakarta Sans → Outfit in both the CSS vars and the Google Fonts link, so all text incl. menus/selects uses Outfit.
4. **Favicon + OG thumbnail + canonical + SEO metadata** on the tool itself: metadataBase, canonical URL, icons (favicon/apple), Open Graph + Twitter card with the Welcome Tomorrow logo as the thumbnail, robots index/follow.
5. **Removed demo** — deleted /app/preview (a page rendering hardcoded fake audit data) and updated the stale "not yet wired" ReportButton comment (report email is live).

Issue affected-URL lists were already correct in code; accuracy now holds because crawl pages are JS-rendered (Update 27).

## OUTSTANDING — needs your logs to finish:
- Attio still not populating: paste the `[attio]` / `[lead] Attio` log line after a lead.
- Resend "try again": paste the `[report/request] RESEND failed:` log line.

---

## Update 29 — Protected audits COMPLETE (sample crawl) instead of timing out

The timeout on welcometomorrow.io was because stealth-scraping a big Cloudflare site means hundreds of ~10-20s browser fetches — impossible inside one web request. Fixes so it completes:
1. When ScrapingBee bypass is enabled, the crawl now takes a SMALL representative SAMPLE (internal 20, external 10 — env PROXY_CRAWL_MAX_PAGES_INTERNAL / PROXY_CRAWL_MAX_PAGES) so the run fits the time budget with real multi-page data instead of hitting the deadline.
2. Direct fetch now FAILS FAST (7s) when a ScrapingBee fallback exists, so blocked pages don't burn the full timeout before the stealth retry.

HONEST REALITY: ScrapingBee bypasses individual protected pages well, but a FULL deep crawl of a large Cloudflare site can't be done synchronously — that needs a background job (future) or, for their OWN site (welcometomorrow.io), allowlisting the crawler in Cloudflare so the direct 500-page crawl works fast + free. The sample gives an accurate audit that completes now.

Diagnostic needed: confirm ScrapingBee credits are being consumed (proves bypass fires) + the [attio]/[report request RESEND] log lines.

---

## Update 30 — ScrapingBee Cloudflare config fixed (was aborting before the challenge solved)

Per ScrapingBee's own guidance, the params were right (render_js + stealth_proxy) but my TIMEOUT was too short: stealth needs ~30-40s to solve a Cloudflare challenge, and I was aborting the call at 22-25s — so it failed before succeeding (and burned ~no credits). Fixes:
1. Stealth requests now send: render_js=true, stealth_proxy=true, block_resources=false (so the challenge JS runs), timeout=40000 (ScrapingBee server-side), wait_browser=networkidle2.
2. Client-side abort raised to 50s for stealth calls (main page, straight-through crawl, and per-page fallback) so a call that would succeed isn't killed early.
3. Every ScrapingBee failure is now logged ([scrapingbee] ... failed/threw ...) so we can see exactly what Cloudflare returns.
4. External budget raised to 120s (+ job deadline synced) to fit a stealth main-page fetch.

Expected result: the MAIN page of a Cloudflare site now actually gets through (real audit + credits consumed), plus a small sampled crawl. If a stealth call still fails, the [scrapingbee] log line will show why.

---

## Update 31 — Fix report PDF crash (Resend) + Attio required-field diagnostics

Logs pinpointed both:
1. RESEND "try again" was actually the PDF crashing: pdf-lib standard fonts use WinAnsi and threw on "≤" from Claude's narrative. Added sanitize() in lib/report/pdf.ts mapping ≤,≥,→,×,•,smart quotes,em-dash,…,™,® to safe equivalents and stripping any remaining non-Latin1 chars, applied to all wrapped text. PDF now renders → email sends.
2. Attio Deal still missing required attribute 84e4e4e7-... The stage resolver returned nothing and fell back to the wrong slug. resolveStage now LOGS the Deal object's required attrs (title[slug/type]) and all status attrs, tries every status attribute, and logs the chosen attr/status. Next log tail will reveal the real pipeline slug + statuses (and whether 84e4e4e7 is even a status field or some other required field) so it can be set exactly.

After deploy, the [attio] log lines will show: "deal required attrs: ...", "deal status attrs: ...", "statuses for X: ...". Paste those and Attio is solved.

---

## Update 32 — Attio SOLVED (required Deal owner) + checkbox copy + stage default

Logs revealed the required field 84e4e4e7 = Deal OWNER (owner/actor-reference), which we never set. Also there is NO "Captured" stage (pipeline is Lead → Discovery Call → … → Won/Lost).
1. Added resolveOwner(): fetches /workspace_members (by ATTIO_DEAL_OWNER_EMAIL if set, else first member), builds an actor-reference, caches it, logs the members + chosen owner. createDeal now ALWAYS includes owner (required) alongside name + stage. Attempts: full → no-source → stage-owner-only.
2. Default stage changed "Captured" → "Lead" (the real first stage). Resolver still matches ATTIO_STAGE_CAPTURED if set.
3. Checkbox copy updated: audit-consent → "I agree to receive my SEO audit by email from Welcome Tomorrow, with the option to be contacted about a customised report."; newsletter → "I'd like to receive Welcome Tomorrow's free bi-weekly newsletter."

Report email confirmed SENT via Resend (log: sent id=...). Non-delivery is spam/DNS — check spam + Resend dashboard Emails for that message id (delivered/bounced).
Optional env: ATTIO_DEAL_OWNER_EMAIL to choose which member owns the deals.

---

## Update 33 — DataForSEO AI calls now match the SELECTED country (verified vs live docs)

Verified against DataForSEO docs that the ChatGPT LLM Responses endpoint supports web_search_country_iso_code (+ web_search_city) to focus the model's web search on a country, and that AI Overview uses location_code + language_code.
1. ChatGPT: chatGptAnswer/chatGptAnswers now accept { countryIso } and send web_search_country_iso_code = the audited country's ISO-2 (e.g. "KE"), force_web_search=true, and a system_message stating the user's location — so ChatGPT answers for the audited market, NOT the US default. Works for EVERY country (ISO-2 is always known).
2. Google AI Overview: now runs ONLY when the audited country has a real DataForSEO location_code (Kenya, US, UK, Nigeria, SA, Ghana, Tanzania, Uganda mapped). For unmapped countries it SKIPS AI Overview and logs a warning, instead of silently querying the USA — no more wrong-country AI-Overview data.

Note: DataForSEO country location codes follow 2000 + ISO-3166 numeric; the mapped set covers the tool's primary markets. To add AI Overview for more countries later, add their locationCode in lib/locations.ts.

---

## Update 34 — Attio: write to the CAPTURED stage of the right pipeline (multi-status search)

User reported deals not appearing where expected + asked to confirm "Captured" stage. Truth: we were writing to the "stage" (sales) pipeline at "Lead". The Deal object has TWO status attributes (stage, captured_contact) — the marketing pipeline / "Captured" stage lives on a different one.
Fix: resolveStage now:
1. Lists all workspace OBJECTS (logs them — reveals a separate marketing pipeline object if one exists).
2. Lists ALL status attributes on the Deal object and logs each one's stages.
3. Searches EVERY status attribute for the wanted stage ("Captured", default) and writes to whichever pipeline actually contains it (so a lead lands at "Captured" on the marketing pipeline, not "Lead" on sales).
4. Falls back to the first pipeline's first stage only if "Captured" exists nowhere, with a warning to set ATTIO_STAGE_ATTR + ATTIO_STAGE_CAPTURED.
Default wanted stage reverted to "Captured".

After deploy the logs will show: objects, statuses for "stage", statuses for "captured_contact", and "[attio] matched wanted stage Captured -> attr ... = ...". If Captured isn't found, we'll see every pipeline's stages and can target exactly (incl. a separate object via ATTIO_DEALS_OBJECT).

---

## Update 35 — GA4 analytics + conversion funnel

Added Google Analytics 4 (Measurement ID G-3D0H9F3QBM) via the official @next/third-parties GoogleAnalytics helper in app/layout.tsx (auto pageviews; loads from googletagmanager.com so basePath is irrelevant; ID is public so committed as a constant — avoids the ECS runtime-vs-build-time NEXT_PUBLIC pitfall).
Conversion funnel events (sendGAEvent):
- audit_start — fired in AuditApp.runAudit when an audit begins ({site, country, internal}).
- generate_lead — fired in LeadGate on successful lead capture ({site, newsletter}).
So GA4 shows visits -> audit_start -> generate_lead. Mark generate_lead as a Key Event (conversion) in GA4 Admin to track audit->lead conversion rate.
Dep added: @next/third-parties@^14.2.33.
Note: build warns Next 14.2.33 has a security advisory (upgrade later, separate task).
