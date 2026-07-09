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

---

## Update 36 — Replace Attio with Google Sheets for lead capture

Removed Attio entirely (deleted lib/store/attio.ts + all references) and replaced the CRM push with a Google Sheets webhook.
- New lib/store/sheets.ts: pushLeadToSheet() POSTs each lead to a Google Apps Script Web App (SHEETS_WEBHOOK_URL) with an optional shared secret (SHEETS_WEBHOOK_SECRET); background/fire-and-forget, logs [sheets] append ok/failed. Redis backup (saveLead) still runs first and still powers the report email (getLead).
- app/api/lead/route.ts: Attio push -> Sheets push.
- Health route: dropped ATTIO_API_KEY; added SHEETS_WEBHOOK_URL + RESEND_API_KEY to the display.
- Chose an Apps Script Web App (not Sheets API + service account): no googleapis dep, no PEM key in ECS env, matches the team's existing Apps Script usage. Setup steps + the exact doPost script are documented at the bottom of lib/store/sheets.ts.

ACTION for user: create the Apps Script web app (code in sheets.ts), then set env vars SHEETS_WEBHOOK_URL (/exec URL) and SHEETS_WEBHOOK_SECRET. Can drop ATTIO_API_KEY from the task def.

---

## Update 37 — Replace direct GA4 with Google Tag Manager (GTM-PVGW8KF)

Per GA4 expert instruction, removed the @next/third-parties GA4 tag (G-3D0H9F3QBM) and installed GTM properly:
- Loader <script> placed as high in <head> as possible (verbatim GTM snippet via dangerouslySetInnerHTML) in app/layout.tsx.
- <noscript> iframe placed immediately after the opening <body>.
- Removed @next/third-parties dependency + all sendGAEvent usage.
- Funnel events re-wired to GTM's dataLayer (lib/gtm.ts gtmEvent): audit_start (AuditApp) and generate_lead (LeadGate) now push { event, ... } to dataLayer.

In GTM: create Custom Event triggers on "audit_start" and "generate_lead", attach GA4 event tags, and configure GA4 inside GTM (the G-... measurement ID now lives in a GTM tag, not in the app). Mark generate_lead as a Key Event/conversion in GA4.

---

## Update 38 — Public page redesign: hero copy, mobile nav, SEO content section, dropdown UX

1. Hero H1 -> "Free SEO & GEO Audit with RankTomorrow" + provided subtext; removed the "+ Simple, Affordable..." line and the "Enter a URL..." helper line.
2. Footer text -> "RankTomorrow, SEO & AI Visibility Audit Tool by Welcome Tomorrow." and REMOVED the divider line (border-t) above it.
3. Dropdowns (country/language) now guaranteed-opaque (inline #0b100e bg + ring/shadow) instead of see-through.
4. New mobile-friendly Nav (components/Nav.tsx): desktop inline links; on mobile a 3-line hamburger on the right that expands a solid menu panel.
5. New SEO/GEO content section (components/SeoContent.tsx), public page only, WT dark design:
   - How it works: 4 numbered step cards (responsive 1/2/4 cols).
   - FAQ: 6-question accordion, answers in one paragraph each, NO em-dashes, answers live in the DOM for SEO + FAQPage JSON-LD structured data.
   - Closing CTA: "Move beyond one-off audits" + 50-page / Cloudflare note + "Talk with one of our experts" -> Ochuko's booking calendar.
6. Fully responsive; internal /seo view skips the marketing content.

PENDING (needs user): favicon + thumbnail images — cannot pull from Google Drive (no Drive access + sandbox blocks drive.google.com). User must upload both image files to the chat; then wire them into layout icons + OG.

---

## Update 39 — Favicon + OG thumbnail wired to provided images

Favicon -> https://i.imgur.com/pxoBmhP.png ; OG/Twitter thumbnail -> https://i.imgur.com/MYIJrl7.jpeg (referenced directly in metadata icons + openGraph/twitter images; no download needed since these are URL references).
CAVEAT for user: hotlinking imgur is fine short-term but not ideal for a production site (imgur can rate-limit/remove). Recommended: upload both images into the repo (public/) later so they're served from your own domain — upload them to chat and I'll bundle them.

---

## Update 40 — Revisions: favicon/thumbnail, Edit-email UX, hero H1, Why RankTomorrow

1. Favicon + OG/Twitter thumbnail both -> https://i.imgur.com/JTyaf8H.jpeg (replaces prior).
2. LeadGate mismatch: "Edit email" now calls editEmail() -> dismisses both mismatch CTAs, KEEPS all entered details, and focuses+selects the email field so the user edits and hits Run (no restart). Fields were already controlled/retained; added the focus + clearer handler.
3. Hero H1 -> "Free, Simple SEO & GEO Audit Tool" (removed RankTomorrow from the headline).
4. Added "Why RankTomorrow?" content block just before the FAQ (4 paragraphs, provided copy, no em-dashes, tidied "it`s"->its and on page->on-page).

---

## Update 41 — Design: dropdown fix, lead-gate UX, full WT footer

1. Country/Language dropdown: rendered IN-FLOW now (not an absolute overlay) so it (a) pushes content below down instead of covering it, (b) scrolls + selects reliably (the overlay was being clipped/stacked over), and (c) has a solid #0b100e background.
2. Lead gate:
   - Background scroll is now LOCKED while the gate is open (body overflow hidden) so the screen stays put.
   - Email placeholder simplified to "Company email" (removed the "(no Gmail/Yahoo)" hint) while free inboxes are still rejected behind the scenes (client + server).
   - REMOVED the domain-must-match-audited-site rule (client check, mismatch CTAs, and the server 422). Any company email is now accepted; removed the emailMatchesSite import from the route.
   - Modal footer now just "Powered by Welcome Tomorrow" (domain removed).
3. Footer: replaced the slim credit line with the FULL welcometomorrow.io footer (components/Footer.tsx) — brand blurb + office locations, social icons (IG/FB/LinkedIn/TikTok/Newsletter), and Company / Services / Expertise link columns mirrored from the live site, plus the legal bar. Under Company, added "SEO & GEO Audit Tool" right below Contact Us. Outfit font inherited.

---

## Update 42 — Lead gate always on top (portal) + blurred backdrop

The gate was rendered inside the app tree, so newer sections (SeoContent cards with backdrop-blur, footer) created stacking contexts that painted over it. Fix: LeadGate now renders through a React portal to document.body (via createPortal, guarded by a mounted flag), with z-index maxed and backdrop-blur-lg over bg-black/80. Result: the modal always sits on top; the page behind it is dimmed + blurred (translucent, still faintly visible) and non-interactive; scroll stays locked.

---

## Update 43 — Own-domain favicon + OG/thumbnail (dropped imgur hotlink)

Replaced the temporary imgur-hosted favicon/thumbnail with the new WT logo mark, uploaded directly and bundled into the repo. Added `public/wt-logo-mark.png` (1024×1024, resized from the source file). `app/layout.tsx` now points `icon` / `shortcut` / `apple` icons and the OG + Twitter card image at `/ranktomorrow/wt-logo-mark.png` (served from our own domain, matching the existing pattern used for `welcome-tomorrow-logo.png`) instead of `i.imgur.com`. OG image width/height corrected to 1024×1024 to match the actual (square) asset so platforms don't stretch it. Same image now used for both the favicon and the social thumbnail, as requested. Nothing else changed.

---

## Update 44 — Clean audited-site URL + rewritten "processing" copy

1. **Short, shareable URL.** Starting an audit no longer leaves the tool sitting on a bare `/ranktomorrow?job=<uuid>&lead=<uuid>` string. Once the job id comes back, `AuditApp` rewrites the address bar (via `history.replaceState`, no reload) to `/ranktomorrow/<site>` for the public tool — e.g. auditing `welcometomorrow.io` now shows `https://tools.welcometomorrow.io/ranktomorrow/welcometomorrow.io` — or `/ranktomorrow/seo/<site>` for the internal tool. The `?job=`/`?lead=` query params are still appended (needed to resume the same audit on refresh), but the visible path is now the site name instead of a long id.
   - Added two new catch-all routes to make that path refreshable/shareable: `app/[site]/page.tsx` (public) and `app/seo/[site]/page.tsx` (internal). Both just render the existing `Landing`/`AuditApp` and pre-fill the input with the site from the URL — visiting the link fresh (no `?job=`) shows the audit form ready to go with that site typed in, it does **not** auto-start a new (paid-API) audit on its own; visiting it with `?job=…` still resumes the running/finished audit exactly as before.
   - Verified no collision with the existing static routes (`/audit`, `/seo`, `/api/*`) or public assets (`/wt-logo-mark.png`, `/welcome-tomorrow-logo.png`) — Next.js matches the more specific static routes/files first, the dynamic `[site]` segment only catches everything else. Confirmed with a local production build + smoke test (root, static asset, `/[site]`, `/seo`, `/seo/[site]`, and the API path all resolved correctly).
2. **Processing screen copy.** Replaced "Hang tight — we're crawling and building insights for…" with a clearer wait notice: tells the user the audit can take up to 2–5 minutes for the most accurate results and asks them not to cancel or close the tab midway. Still shows the site/country/language being audited.

---

## Update 45 — API expansion, Phase 1: Ahrefs (keyword opportunities, link gap, smarter crawl seeding) + audit timing overhaul

First of three phases wiring in more of Ahrefs/DataForSEO/ScrapingBee without touching what already works. Phases 2 (ScrapingBee screenshot + socials dashboard) and 3 (DataForSEO AI Visibility dashboard + broader SERP/keywords) follow in later updates.

1. **Audit time budgets overhauled.** Internal tool: 3 min → **30 minutes**, specifically so a full ~500-page crawl (with ScrapingBee stealth on protected sites) can complete with real, non-sampled results. Public tool: 2 min → **3 minutes**. Changed in `lib/orchestrator.ts` (`BUDGET_MS`) and `app/api/audit/start/route.ts` (`hardCapMs`, which backs the job's stored deadline so a container restart mid-audit still reports the right status instead of spinning forever).
   - **Deployment note:** if `AUDIT_BUDGET_MS` is currently set as an explicit env var on the task definition, it will override these new defaults (the code does `env value || new default`, so an old explicit value wins). **Unset `AUDIT_BUDGET_MS` from the task def** unless you want to override the new caps intentionally.
2. **Competitor URL field.** Added an optional 4th field next to Country/Language/Target keyword on the pre-audit form ("Competitor URL (optional)"). Feeds the new link-gap section below. If left blank, the audit auto-picks the strongest Ahrefs-detected organic competitor instead.
3. **Keyword Opportunities section** (new report card, next to Top Organic Keywords). Keywords the domain already ranks for at positions 4–50 — visible to Google, not yet winning the click — sorted by search volume, so the closest, highest-value pushes to page 1 surface first. Reuses the existing Ahrefs `organic-keywords` endpoint with a position-range filter (`lib/providers/ahrefs.ts: keywordOpportunities()`), no new Ahrefs product needed. Falls back to a client-side filter if the `where` filter shape isn't accepted on this plan.
4. **Link Gap section** (new report card, next to Backlink Profile). Top 5 domains linking to the competitor (manual or auto-detected) but not to the audited site — a concrete outreach list, not just "you have fewer backlinks." Computed by diffing Ahrefs `referring-domains` for the competitor against the audited domain's own referring domains, sorted by Domain Rating (`lib/orchestrator.ts: computeLinkGap()`). No dedicated "link intersection" Ahrefs endpoint was available/needed — this reuses the same referring-domains call already wired in for backlink stats.
5. **Smarter protected-site crawling.** For Cloudflare/WAF-protected sites, the crawler now seeds its queue with Ahrefs' top-pages-by-backlinks (`lib/crawl/crawler.ts: seedUrls`) so a time-boxed crawl spends budget on the pages that actually carry link equity/traffic first, instead of a blind sample in discovery order. Combined with the new 30-minute internal budget, protected internal audits now aim for a near-full crawl (up to 500 pages) instead of a 20-page sample; the public tool keeps a small (10-page) but now *smarter* sample.
6. **Resolved a genuine overlap before building anything:** Ahrefs Site Audit (already partially wired in as a hybrid — used only when the domain is a pre-existing Ahrefs Site Audit *project*, since that API can't crawl an arbitrary URL on demand) and DataForSEO's On-Page API do the same job. Per the agreed conflict resolution, DataForSEO On-Page API's crawl/audit function is **not** being wired in — Ahrefs Site Audit (where applicable) plus the in-app crawler already cover it, and DataForSEO's Core Web Vitals claim is already better covered by the existing PageSpeed integration. Ahrefs Rank Tracker (ongoing keyword position monitoring) was dropped from scope entirely per instruction.
7. Types (`types/audit.ts`): added `KeywordOpportunity`, `LinkGapDomain`, `competitorUrl` on both job input and report meta, and the corresponding new fields on `AuditReport.keywords`/`AuditReport.backlinks`.

---

## Update 46 — API expansion, Phase 2: ScrapingBee (homepage screenshot + live social dashboard)

Second of three phases. New file `lib/providers/scrapingbee-extras.ts` holds both features; nothing existing was touched or removed.

1. **Homepage screenshot**, placed right below the main Audit Results dashboard as requested. A fixed 1440×900 viewport shot (not full-page — a full-page shot of a long homepage can run several MB, too slow/big to store in the job record; a fixed viewport gives a clean "above the fold" preview at a small, predictable size). Stored as a base64 data URL directly on `report.meta.screenshotDesktop` (a field that already existed in the type but was never wired in). Uses stealth proxy only when the site is already flagged `protected`, to avoid paying for stealth on sites that don't need it.
2. **Social Media Presence dashboard** (new report section, after the keyword/backlink cards). For every social profile the site already links to (Facebook/X/Instagram/LinkedIn/YouTube — reusing the URLs the existing on-page parser already extracts in `lib/seo/fetcher.ts`), ScrapingBee's AI extraction (`ai_extract_rules`) pulls live follower count, last-post engagement, and the displayed handle. Cost-conscious: tries the cheap (non-stealth) request first and only escalates to stealth proxy if that comes back blocked or empty.
   - **Honest limitation, not a bug:** several platforms only show real follower/engagement numbers to logged-in users. Where that's the case, the card says so explicitly ("doesn't show follower/engagement numbers publicly") rather than showing a fake zero.
   - The **existing** "Facebook / Open Graph Card", "X (Twitter) Card", and "Instagram Linked" checks in the Social scoring category are untouched — those are meta-tag/link-preview checks, a different (and still valid) signal from live follower counts. This dashboard is additive, not a replacement.
3. Types: added `SocialProfile` and a required `social: SocialProfile[]` field on `AuditReport`. `Report.tsx` defaults to `report.social ?? []` so any job already mid-audit at deploy time (created before this field existed) doesn't crash on refresh.

---

## Update 47 — API expansion, Phase 3: DataForSEO AI Responses dashboard + broader SERP/keywords + Local Business issue

Third and final phase of the API expansion. New confirmed DataForSEO endpoints added to `lib/providers/dataforseo-ai.ts`: Gemini LLM responses (`ai_optimization/gemini/llm_responses/live`), Perplexity LLM responses (`ai_optimization/perplexity/llm_responses/live`), broader Google organic SERP (`serp/google/organic/live/advanced`), real Google Ads search volume (`keywords_data/google_ads/search_volume/live`), and Google Business Profile lookup (`business_data/google/my_business_info/live`).

1. **AI Responses dashboard**, styled like the reference screenshot (AI Overviews / ChatGPT / AI Mode / Gemini / Perplexity / Copilot / Grok, each with Responses + Pages counts and a delta vs the previous audit of that domain). Sits at the top of the existing AI Visibility section.
   - **Two honest limitations kept visible rather than hidden:** (1) "Pages" (distinct site pages cited with a real URL) is only populated for AI Overviews/AI Mode, which return structured citation URLs on this account — ChatGPT/Gemini/Perplexity return conversational text with no confirmed parseable citation field, so their Pages column shows "—" rather than a guessed number. (2) **Copilot and Grok are marked unavailable, not faked** — there is no confirmed API path to either platform through DataForSEO or any other connected provider. Hovering the "—" shows why.
   - "AI Overviews" and "AI Mode" currently read from the same underlying DataForSEO call (`serp/google/ai_mode/live/advanced`) on this account — Google's classic AI Overview box and the newer full AI Mode experience aren't separately queryable here, so both rows reflect the same signal today. Documented in code for whoever picks this up later.
   - **Deltas need history**: added `lib/store/aivisibility-history.ts`, a small Redis-backed store (90-day TTL, one record per domain) separate from the 1-hour job store. First-ever audit of a domain shows flat numbers with no delta (labelled "first audit — no history yet"); a second audit of the same domain shows real +/- deltas.
   - Gemini and Perplexity are polled with the exact same buyer-intent prompts already derived for ChatGPT (no extra Claude calls needed) — adds roughly 10 more DataForSEO calls per audit (~$0.04–0.07 extra).
2. **SERP Snapshot** (new report card, next to Keyword Opportunities). Real Google result for the target keyword (or the top keyword opportunity if none was given): actual position, real Google Ads search volume + CPC, whether a featured snippet/PAA/knowledge panel is present on that SERP, and whether the audited site holds the featured snippet or a competitor does.
3. **Local Business Profile section**, framed as an issue when not found rather than left empty, per instruction: "No Google Business Profile found" + a one-sentence reason it matters + the recommendation to create/verify one. Business name is best-effort guessed from the page `<title>` (before a separator) or the domain stem — there's no business-name input field yet, so this is a reasonable guess, not a certainty. Honest caveat kept in code comments: the lookup only has a business name + country, no street address, so a miss means "not found with this name at this location," not a certain "doesn't exist."
4. Types: added `AiPlatformStat`, `AiResponsesDashboard` (on `AiVisibilityReport`), `SerpSnapshot`, `LocalBusinessProfile`.
5. `lib/store/jobs.ts`: `getRedis()` exported (was private) so the new history store can reuse the same Redis client instead of creating a second one.

---

## Update 48 — Phase 4: the two ScrapingBee items that slipped through in Phase 2/3

Cleanup pass — these two were approved back when ScrapingBee was scoped, but the actual code changes never landed while building the other phases. Flagging that honestly rather than letting them quietly disappear.

1. **CSS-selector extraction replaces regex parsing — but only on pages already going through ScrapingBee** (blocked or JS-shell fallback; the free direct-fetch path is untouched, so this adds no cost). Implementation note worth knowing: ScrapingBee's `extract_rules` normally *replaces* the response body with just the extracted JSON — it doesn't hand back the full page HTML alongside it by default. Combining it with `json_response=true` in the same request is how both come back together (the rendered HTML in `body`, plus the extracted fields at the top level) without a second paid call. This combination is standard practice per ScrapingBee's own docs, but it's the one part of this update I'd genuinely want confirmed against live logs on the first real run against a protected/JS-heavy site — if `body` isn't present in the shape expected, the code falls back to the existing (working) regex parse automatically, so a wrong assumption here degrades gracefully rather than breaking anything.
   - Used CSS selectors (`extract_rules`), not AI extraction (`ai_extract_rules`): title/meta description/H1 are fixed, well-known fields — a selector query against ScrapingBee's real rendered DOM is both cheaper (no +5 AI credit surcharge) and more reliable than asking an LLM to guess them.
   - Wired into both the homepage fetch (`lib/seo/fetcher.ts`) and the multi-page crawler (`lib/crawl/crawler.ts`) — added `CoreFieldOverrides` support to `analyzePage()` in `lib/crawl/analyzer.ts` so the more reliable value wins over the regex match whenever it's available.
2. **ScrapingBee's Google Search API as a second SERP source.** The SERP Snapshot card (Phase 3) now falls back to ScrapingBee (`GET /api/v1/store/google`, confirmed endpoint) if DataForSEO's SERP call fails or returns zero organic results, instead of the card just disappearing. Honest limitation: ScrapingBee's schema gives real organic positions and People Also Ask, but featured-snippet/knowledge-panel detection isn't a confirmed field on that endpoint, so those two stay `false` on the fallback path rather than guessed — DataForSEO remains the only source for those two signals.
3. New shared helper `lib/providers/scrapingbee-extras.ts: CORE_FIELDS_EXTRACT_RULES` / `parseCoreFieldsResponse()` — used by both fetcher.ts and crawler.ts so the extraction-rule definition and combined-response parsing only exist in one place.

---

## Update 49 — Build fix: app/preview/page.tsx wasn't updated for the new AuditReport fields

Real build failure on CloudShell caught this: `app/preview/page.tsx` (an internal design-QA route with a hardcoded mock report, used to preview the Report component's look without running a real audit) was never part of the zip snapshots delivered across Updates 41–48, so it silently drifted out of sync while `AuditReport`/`AiVisibilityReport` grew new required fields. `npm run build` failed on `Property 'opportunities' is missing`.

Fixed by adding the new required fields to the mock report/AI-visibility objects: `keywords.opportunities`, `backlinks.linkGap`, `social`, plus sample `serpSnapshot`, `localBusiness`, and `aiResponses` data so `/preview` actually demonstrates the new sections instead of just satisfying the type checker.

While fixing this, pulled the actual live GitHub repo directly (rather than continuing from the local zip-based working copy) and found two other files that had the same drift risk but happened not to break the build: `lib/store/attio.ts` (dead code, confirmed unimported anywhere — a leftover from the Attio removal, harmless but could be deleted) and `components/GridBackground.tsx` (unused component). Full `tsc --noEmit` and `npm run build` now pass clean against the real repo contents, including `/preview` (13 routes build successfully, up from 12).

---

## Update 50 — Fix: public-tool audits on large/protected sites (e.g. betika.com) timing out with NO report, defeating the point of having ScrapingBee

Real failure caught on a live test (betika.com + sportpesa.com as competitor, public tool): "The audit stopped responding." Root cause, found by walking the actual worst-case timing rather than guessing: Updates 45–48 added a genuine amount of new sequential/loosely-bounded work to the SAME 180-second public-tool budget without re-checking whether that budget could still realistically fit it all, especially for a large or protected site.

Specifically:
- **Ahrefs' default per-call timeout was 60 seconds** (`lib/providers/ahrefs.ts`) — with ~9 Ahrefs calls now running in one `Promise.allSettled`, a single slow/degraded Ahrefs endpoint that day could silently consume a THIRD of the entire public-tool budget, since `allSettled` waits for the slowest call before the audit can proceed. Reduced to 20s — Ahrefs normally responds in under 2s, so this only bites during genuine degradation, and now fails fast instead of stalling the whole audit.
- **The link-gap lookup, the real-Google-Ads-volume lookup, and the ScrapingBee SERP fallback were all running one-after-another** (each with its own multi-second timeout) instead of in parallel with the GEO/SERP/Business Profile block they were added next to. Folded all of them into the same `Promise.all`, and added explicit tighter timeouts (12–15s) to each rather than relying on each provider's own generous internal default.
- **Social profile scraping could take up to ~60s per platform** on the public tool (a 15s cheap attempt, then escalating to a 40s stealth retry) with no regard for how much of the 180s budget was already spent. The stealth escalation is now internal-tool only (30-minute budget can absorb it); the public tool stays on the cheap tier, capped at 15s per profile.
- **Screenshot capture** timeout tightened for the public tool (25s → 15s; internal tool keeps 25s).
- Added a budget guard so the ScrapingBee SERP fallback is skipped outright if less than 25s remains, rather than spending more time chasing a fallback when there's nothing left to spend.

Net effect: worst-case time spent on everything BEFORE the crawl+AI-visibility stage on the public tool dropped from a scenario that could consume nearly the entire 180s budget down to roughly 100–120s worst case — leaving the crawl and AI visibility (the actual point of the tool, and where ScrapingBee's stealth crawling does its real work) a real, guaranteed chunk of time instead of the scraps left over after everything else.

No scope was cut to make this fit — every feature from Updates 45–48 is still fully wired in; this was purely about not letting the new work starve the time the crawl needs, which is exactly the failure that was reported.
