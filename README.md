# TomorrowRank — SEO & AI Visibility Audit Tool

A production-grade SEO + GEO (Generative Engine Optimization) audit tool for
**Welcome Tomorrow**, built with Next.js 14 and deployable on Vercel as
`audit.welcometomorrow.io`.

Enter a URL → get an A+→F graded report covering On-Page SEO, GEO, backlinks,
Core Web Vitals, social, local SEO, prioritised recommendations, and an
**AI Visibility** panel (Share of Voice + sentiment across AI engines).

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in your API keys
npm run dev                  # http://localhost:3000
```

**Full setup, deployment, and cost details are in
[`docs/IMPLEMENTATION_GUIDE.md`](docs/IMPLEMENTATION_GUIDE.md).**

## Data sources
- **Ahrefs API** (Site Explorer) — keyword rankings, backlinks, Domain Rating
- **DataForSEO LLM Mentions** (optional) — REAL AI Visibility: Google AI Overview + ChatGPT brand mentions & citations
- **Google PageSpeed Insights** — Core Web Vitals (free)
- **Anthropic Claude** — GEO analysis + AI Visibility sentiment/insights synthesis (also the fallback when DataForSEO is off)

## Stack
Next.js 14 (App Router) · TypeScript · Tailwind · Recharts · Upstash Redis

The audit runs as a background job (`/api/audit/start` → `/api/audit/run`) with
the UI polling `/api/audit/status`. See the guide for the why and the
production checklist (Upstash + Vercel Pro `maxDuration`).
