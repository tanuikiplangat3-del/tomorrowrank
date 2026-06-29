# TomorrowRank — Implementation Guide

From the zip to a live tool at **`audit.welcometomorrow.io`**, using your **Ahrefs Standard** plan + **Claude pay-as-you-go** + **free Vercel**.

---

## ⭐ Start here — your exact next steps (GitHub + Vercel already created)

You've made the GitHub repo and the Vercel project. Do these in order:

**1. Get the code into your repo (5 min).** From the unzipped folder:
```bash
cd tomorrowrank
npm install                      # sanity check it installs
git init
git add .
git commit -m "TomorrowRank initial"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

**2. Get two keys (10 min).** You only strictly need these two to go live:
- **Ahrefs API key** — Ahrefs dashboard -> your account -> **API keys** (your Standard plan includes API access). Copy the Bearer token.
- **Anthropic key** — https://console.anthropic.com/settings/keys -> create key.

(Optional but recommended, both free: a **Google PageSpeed** key and an **Upstash Redis** database — see section 3. You can launch without PageSpeed; you should add Upstash before real traffic.)

**3. Add env vars in Vercel (5 min).** Vercel -> your project -> **Settings -> Environment Variables**. Add:
```
AHREFS_API_KEY        = <your ahrefs token>
ANTHROPIC_API_KEY     = sk-ant-...
INTERNAL_SECRET       = <run: openssl rand -hex 32>
NEXT_PUBLIC_BASE_URL  = https://<your-project>.vercel.app   (update to the subdomain in section 7)
FAST_MODE             = true
PAGESPEED_API_KEY     = <optional, free>
UPSTASH_REDIS_REST_URL   = <optional now, required before real traffic>
UPSTASH_REDIS_REST_TOKEN = <optional now, required before real traffic>
# Optional — REAL AI Visibility (Google AI Overview + ChatGPT mentions).
# Leave blank to use Claude-only AI visibility. Requires LLM Mentions sub (see section 2).
DATAFORSEO_LOGIN      = <optional>
DATAFORSEO_PASSWORD   = <optional>
```

**4. Deploy.** Vercel -> **Deployments -> Redeploy** (or it auto-deploys from the push). Open the `*.vercel.app` URL -> enter a URL -> **Audit**. Done.

> WARNING: On **free Vercel**, keep `FAST_MODE=true` (it's the default). It runs the audit Claude-only with 3 probe prompts in parallel so it finishes inside Hobby's 60-second limit. Everything below explains the rest.

---

## 1. What it does

A visitor enters a URL, picks country + language, and gets a graded report: On-Page SEO, GEO (AI readability), Backlinks, Usability, Performance, Social, Local — plus an **AI Visibility** section (Share of Voice + Sentiment across AI engines).

Data comes from:
1. A live **HTML fetch + parse** (title, meta, headings, schema, social, robots, llms.txt...).
2. **Google PageSpeed Insights** for Core Web Vitals (mobile + desktop).
3. **Ahrefs API** for keyword rankings, backlinks, referring domains and Domain Rating.
4. **Claude** for GEO judgement and live multi-LLM Share-of-Voice.

---

## 2. Accounts and costs

| Service | Needed? | Used for | Cost |
|---|---|---|---|
| **Ahrefs API** | Required | Keywords, backlinks, Domain Rating | **Included in your Standard plan** — 150,000 units/mo (~100 audits/mo) |
| **Anthropic Claude** | Required | GEO + AI Visibility synthesis | Pay-as-you-go, ~$0.05-0.20/audit |
| **DataForSEO LLM Mentions** | Optional | **Real** AI Visibility (Google AI Overview + ChatGPT mentions/citations) | $100/mo min top-up (stays as spendable balance) + ~cents/audit |
| **Google PageSpeed** | Recommended | Core Web Vitals | **Free** (25k/day) |
| **Upstash Redis** | For production | Job state across serverless calls | **Free tier is enough** |
| **Vercel** | Required | Hosting | **Free Hobby is fine** with `FAST_MODE=true` |
| OpenAI / Gemini | Optional | Extra engines in Claude-only fallback | Pay-as-you-go |

### How AI Visibility works (the Ahrefs + DataForSEO split)

You asked for the cleanest possible split, and that's exactly how it's wired:

- **Ahrefs** does keywords + backlinks + Domain Rating. (It can't see inside AI answers.)
- **DataForSEO LLM Mentions** does the AI Visibility section — it returns **real** brand mentions and citations from **Google AI Overview** (all locations, so Kenya works) and **ChatGPT** (US-scoped). This is the measured data Ahrefs Standard cannot produce.
- **Claude** turns that raw mention data into the dashboard: sentiment scoring, the Share-of-Voice narrative, and the strategy insights (screenshots 6 & 7).

If `DATAFORSEO_LOGIN`/`PASSWORD` are set **and** the LLM Mentions subscription is active, the tool uses the real DataForSEO data. If they're blank (or the subscription lapses that month), AI Visibility **automatically falls back** to Claude-only polling (a simulated share of voice) so the audit never breaks. Flip `USE_DATAFORSEO_AI=false` to force the fallback.

**To enable real AI Visibility data:** register at https://app.dataforseo.com/register, deposit the $50 minimum, then on the **Access Subscriptions** page activate **LLM Mentions** (the $100/month top-up stays in your balance and is spendable on any DataForSEO API). Then set `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` (your API credentials from the dashboard).

---

## 3. Get your keys

**Ahrefs (required).** Dashboard -> account menu -> **API keys** -> create a key. Your Standard plan's API allowance (150,000 units/month, 25 rows/request, 60 requests/minute) is plenty: a full audit uses ~1,500 units, so ~100 audits/month from the allowance you already pay for.
```
AHREFS_API_KEY=your-ahrefs-token
```

**Anthropic Claude (required).** https://console.anthropic.com/settings/keys
```
ANTHROPIC_API_KEY=sk-ant-...
```

**Google PageSpeed (recommended, free).** https://developers.google.com/speed/docs/insights/v5/get-started -> **Get a Key**.
```
PAGESPEED_API_KEY=AIza...
```
Works without a key but is rate-limited; with a key you get 25,000 req/day free.

**Upstash Redis (required for production, free).** https://console.upstash.com -> create a **Redis** database -> copy the **REST** URL + token.
```
UPSTASH_REDIS_REST_URL=https://xxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AY...
```
Locally you can skip Redis — the app falls back to in-memory storage for `npm run dev`. **Production needs it** because each serverless invocation is a separate process and must share job state.

**Internal secret + base URL (required).**
```
INTERNAL_SECRET=<openssl rand -hex 32>
NEXT_PUBLIC_BASE_URL=https://audit.welcometomorrow.io   # or your *.vercel.app while testing
```

---

## 4. Run locally (optional but useful)

```bash
npm install
cp .env.example .env.local      # fill in AHREFS_API_KEY, ANTHROPIC_API_KEY, INTERNAL_SECRET
# Redis can stay blank locally. Set NEXT_PUBLIC_BASE_URL=http://localhost:3000
npm run dev
```
- Tool: http://localhost:3000
- Results UI with mock data (no API spend): http://localhost:3000/preview

---

## 5. Push to GitHub

If you didn't already in the quickstart:
```bash
git init && git add . && git commit -m "TomorrowRank"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```
`.gitignore` excludes `.env*.local`, `node_modules`, `.next` — no secrets are committed.

---

## 6. Deploy on Vercel (free Hobby)

1. Vercel -> **New Project** -> import the repo (or it's already imported).
2. Framework auto-detects **Next.js** — leave defaults.
3. **Settings -> Environment Variables** -> add everything from section 3 (set `NEXT_PUBLIC_BASE_URL` to your `*.vercel.app` for now; change it to the subdomain in section 7).
4. **Deploy**, then test the `*.vercel.app` URL.

### Free-tier note (important)
- Hobby caps serverless functions at **60 seconds**. This build is configured for that: `maxDuration = 60` and **`FAST_MODE=true`** (Claude-only AI Visibility, 3 prompts, run in parallel). Audits comfortably finish in the window.
- When you later move to **Vercel Pro** ($20/mo), you can raise `maxDuration` to `300` in `app/api/audit/run/route.ts` and set `FAST_MODE=false` to poll more prompts and add OpenAI/Gemini for richer multi-engine Share of Voice.

---

## 7. Point audit.welcometomorrow.io at Vercel

1. Vercel -> **Project -> Settings -> Domains -> Add** `audit.welcometomorrow.io`.
2. At your DNS provider for `welcometomorrow.io`, add the record Vercel shows — typically:
   ```
   Type: CNAME   Name: audit   Value: cname.vercel-dns.com
   ```
3. Wait for DNS (minutes, up to ~1 hr). Vercel issues SSL automatically.
4. Update `NEXT_PUBLIC_BASE_URL` to `https://audit.welcometomorrow.io` and redeploy.

---

## 8. Post-launch

- Run one real audit and confirm the report + AI Visibility populate.
- Add **Upstash** before sharing the link publicly (job state won't persist without it).
- Consider basic rate-limiting / a captcha on `/api/audit/start` so the public can't burn your Ahrefs units / Claude budget.
- Optional: delete `app/preview/` if you don't want the mock page exposed.

---

## 9. Cost per audit

| Item | Calls | Cost |
|---|---|---|
| Ahrefs (keywords, DR, backlink stats, top backlinks, anchors, top pages, ref domains) | 7 | ~1,500 Ahrefs units |
| PageSpeed (mobile + desktop) | 2 | free |
| Claude (GEO + AI-visibility context, polling, judging, insights) | ~6-10 | ~$0.05-0.20 |

**Net:** ~1,500 of your 150,000 monthly Ahrefs units + a few cents of Claude. No DataForSEO, no $50 deposit, no $100/mo backlinks commitment.

---

## 10. Project structure

```
app/
  api/audit/start    POST  -> create job, trigger worker, return jobId
  api/audit/run      POST  -> background pipeline (secret-protected, maxDuration 60)
  api/audit/status   GET   -> poll job state
  page.tsx                 -> landing + audit entry
  preview/page.tsx         -> mock-data results (no API spend)
components/                -> Report, AiVisibility, AuditApp, Primitives
lib/
  orchestrator.ts          -> full audit pipeline
  providers/ahrefs.ts      -> Ahrefs Site Explorer client  (was dataforseo.ts)
  providers/pagespeed.ts   -> PageSpeed Insights
  providers/llm.ts         -> Claude (+ optional OpenAI/Gemini)
  seo/fetcher.ts           -> HTML parser
  seo/scoring.ts           -> checks + grading + recommendations
  geo/analyzer.ts          -> GEO analysis
  ai-visibility/engine.ts  -> multi-LLM share of voice (FAST_MODE aware)
  store/jobs.ts            -> Upstash Redis (in-memory fallback)
  locations.ts             -> country/language codes
types/audit.ts             -> shared data model
```

---

## 11. Customising

- **Countries/languages:** `lib/locations.ts`.
- **Scoring weights / checks:** `lib/seo/scoring.ts`.
- **Brand colours/fonts:** `tailwind.config.ts`, `app/globals.css`.
- **Richer AI visibility (Pro):** set `FAST_MODE=false`, raise `maxDuration`, add `OPENAI_API_KEY` / `GEMINI_API_KEY`.

---

## 12. Troubleshooting

| Symptom | Fix |
|---|---|
| Audit stuck at "Queued" | `INTERNAL_SECRET` mismatch or wrong `NEXT_PUBLIC_BASE_URL` (worker can't be called). Check both in Vercel. |
| Progress resets / status 404 in production | Upstash not set. Add `UPSTASH_REDIS_REST_URL/TOKEN`, redeploy. |
| Audit times out ~60s | You're on Hobby with `FAST_MODE=false`. Set `FAST_MODE=true`, or upgrade to Pro and raise `maxDuration`. |
| Ahrefs 401/403 | Wrong/expired API key, or your plan's API units are exhausted for the month. |
| Backlink fields all "—" | New Ahrefs API key still propagating, or the target genuinely has no backlinks. |
| 403 from /api/audit/run | Expected if called directly — it requires the internal secret header. |

---

Built for Welcome Tomorrow - welcometomorrow.io
