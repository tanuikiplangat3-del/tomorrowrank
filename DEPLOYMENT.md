# TomorrowRank — Deployment & Troubleshooting

## Required environment variables (Vercel → Settings → Environment Variables)

Set these for the **Production** (and **Preview**) environments, then **redeploy**
(env changes do not apply to existing deployments).

| Variable | Required | Notes |
|---|---|---|
| `AHREFS_API_KEY` | Yes | Ahrefs API bearer token (keyword/backlink/DR data). |
| `UPSTASH_REDIS_REST_URL` | Yes | From Upstash → your DB → **Connect → REST**. e.g. `https://informed-cod-155228.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | The **full** (not read-only) REST token. Reveal with the eye icon and copy. |
| `INTERNAL_SECRET` | Yes | Any long random string. Generate: `openssl rand -hex 32` |
| `NEXT_PUBLIC_BASE_URL` | Yes (prod) | Your deployed URL, no trailing slash. e.g. `https://tomorrowrank.vercel.app` |
| `ANTHROPIC_API_KEY` | Optional | Enables Claude-powered AI Visibility insights. |
| `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` | Optional | Real AI-mention data; otherwise falls back to Claude-only. |
| `PAGESPEED_API_KEY` | Optional | Higher PageSpeed quota; works without it at lower limits. |

### Pasting tip (most common mistake)
When you copy values from Upstash they arrive as `KEY="value"`. In Vercel's form,
paste **only the value** — no `KEY=` prefix, no surrounding quotes, no trailing
space. A stray quote is the #1 cause of "storage write failed" errors.

## Verify the deployment (before testing an audit)

Open: `https://YOUR-APP.vercel.app/api/audit/health`

You want:
```json
{ "ok": true, "store": { "ok": true, "backend": "redis" }, "env": { ... } }
```
- `store.backend: "redis"` and `store.ok: true` → Upstash is connected. 
- `store.backend: "memory"` → Upstash env vars are missing; deployed audits will NOT work.
- `store.ok: false` with an `error` → vars are set but wrong (bad token/url). Fix and redeploy.
- Any `env.*: false` for a required var → that var is missing for this environment.

## Run an audit
After `health` shows `ok: true`, run an audit. The Upstash dashboard **COMMANDS**
counter should tick up from 0 — proof the app is reading/writing Redis.

## Troubleshooting

- **"Unexpected end of JSON input"** — was a server crash returning an empty body.
  The routes now always return JSON, so you'll instead see the real cause (usually
  the storage message above). Check `/api/audit/health`.
- **Audit stuck at "Queued"** — the background worker (`/api/audit/run`) didn't run.
  Confirm `INTERNAL_SECRET` is set and `NEXT_PUBLIC_BASE_URL` is your exact prod URL
  (no trailing slash). The worker is now triggered via Vercel `waitUntil` for reliability.
- **Audit shows "Failed: ..."** — the pipeline ran but a provider errored (often a bad
  `AHREFS_API_KEY` or quota). The message names the cause.
- **maxDuration** — `/api/audit/run` is capped at 60s (Vercel Hobby). On Pro you can
  raise `export const maxDuration` in `app/api/audit/run/route.ts` up to 300.
