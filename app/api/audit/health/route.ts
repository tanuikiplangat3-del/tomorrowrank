// GET /api/audit/health
// Diagnostic endpoint: reports which environment variables are present (booleans
// only — never the values) and whether the app can actually reach Upstash Redis.
// Open https://YOUR-APP.vercel.app/api/audit/health after deploying.
import { NextResponse } from "next/server";
import { pingStore } from "@/lib/store/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const present = (v?: string) => Boolean(v && v.trim());

  const env = {
    AHREFS_API_KEY: present(process.env.AHREFS_API_KEY),
    UPSTASH_REDIS_REST_URL: present(process.env.UPSTASH_REDIS_REST_URL),
    UPSTASH_REDIS_REST_TOKEN: present(process.env.UPSTASH_REDIS_REST_TOKEN),
    INTERNAL_SECRET: present(process.env.INTERNAL_SECRET),
    NEXT_PUBLIC_BASE_URL: present(process.env.NEXT_PUBLIC_BASE_URL),
    // Optional providers
    ANTHROPIC_API_KEY: present(process.env.ANTHROPIC_API_KEY),
    DATAFORSEO_LOGIN: present(process.env.DATAFORSEO_LOGIN),
    DATAFORSEO_PASSWORD: present(process.env.DATAFORSEO_PASSWORD),
    SCRAPINGBEE_API_KEY: present(process.env.SCRAPINGBEE_API_KEY),
    SHEETS_WEBHOOK_URL: present(process.env.SHEETS_WEBHOOK_URL),
    RESEND_API_KEY: present(process.env.RESEND_API_KEY),
    PAGESPEED_API_KEY: present(process.env.PAGESPEED_API_KEY),
  };

  const store = await pingStore();

  // The audit needs these to run end-to-end on Vercel.
  const requiredOk =
    env.AHREFS_API_KEY &&
    env.UPSTASH_REDIS_REST_URL &&
    env.UPSTASH_REDIS_REST_TOKEN &&
    env.INTERNAL_SECRET &&
    store.ok;

  return NextResponse.json(
    {
      ok: requiredOk,
      store, // { ok, backend: "redis"|"memory", error? }
      env,   // booleans only
      note:
        "ok=true means required env vars are set and Redis is reachable. " +
        "If store.backend is 'memory', Upstash is not configured and deployed audits will not work.",
      checkedAt: new Date().toISOString(),
    },
    { status: requiredOk ? 200 : 503 }
  );
}
