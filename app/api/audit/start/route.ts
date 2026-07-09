// POST /api/audit/start  { url, country, language, targetKeyword?, competitorUrl? }
// Creates a job, triggers the background runner, returns { jobId } immediately.
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import type { AuditJob } from "@/types/audit";
import { saveJob, updateJob, isRedisConfigured } from "@/lib/store/jobs";

export const runtime = "nodejs";

// On a long-lived server (Render, a VPS, `next start`) we run the audit in the
// same process — no fragile self-HTTP call, which is what caused jobs to sit at
// "Queued" and made cold starts feel stuck. Render sets RENDER=true; you can
// also force it with RUN_AUDIT_INLINE=true.
function shouldRunInline(): boolean {
  return !!process.env.RENDER || process.env.RUN_AUDIT_INLINE === "true";
}

function baseUrl(req: NextRequest): string {
  // Prefer an explicit public URL; fall back to request origin.
  const explicit = process.env.NEXT_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  return `${req.nextUrl.protocol}//${req.headers.get("host")}`;
}

export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const url = (body.url ?? "").trim();
    if (!url || !/\./.test(url)) {
      return NextResponse.json({ error: "Please enter a valid URL." }, { status: 400 });
    }

    // Deployed audits need shared storage across serverless invocations.
    if (!isRedisConfigured()) {
      return NextResponse.json(
        {
          error:
            "Storage is not configured. Set UPSTASH_REDIS_REST_URL and " +
            "UPSTASH_REDIS_REST_TOKEN in your Vercel environment variables, then redeploy.",
        },
        { status: 500 }
      );
    }

    // Hard deadline stored ON the job. Even if the container restarts mid-audit
    // (heavy sites can be memory-intensive) and the in-process watchdog dies, the
    // status endpoint uses this to report the job as timed-out instead of letting
    // the UI spin forever. Internal ~30.5 min (full crawl + all providers),
    // external ~3.5 min (matches the orchestrator's budget cap + buffer).
    const hardCapMs = (body.internal === true ? 1_800_000 : 180_000) + 30_000;

    const job: AuditJob = {
      id: randomUUID(),
      status: "queued",
      stage: "Queued",
      progress: 0,
      input: {
        url,
        country: body.country || "Kenya",
        language: body.language || "English",
        targetKeyword: body.targetKeyword?.trim() || undefined,
        competitorUrl: body.competitorUrl?.trim() || undefined,
        internal: body.internal === true,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deadlineAt: Date.now() + hardCapMs,
    };

    await saveJob(job); // throws a clear message if Redis creds are wrong

    if (shouldRunInline()) {
      // Long-lived server: run in-process (background). The process stays alive,
      // so the promise keeps running after we return the jobId.
      const { runAudit } = await import("@/lib/orchestrator");
      void runAudit(job).catch((e) =>
        updateJob(job.id, {
          status: "error",
          stage: "Failed",
          error: e?.message ?? "Audit crashed.",
        })
      );
    } else {
      // Serverless fallback: trigger the background worker over HTTP (not awaited).
      void fetch(`${baseUrl(req)}/api/audit/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": process.env.INTERNAL_SECRET || "",
        },
        body: JSON.stringify({ jobId: job.id }),
      }).catch(() => {});
    }

    return NextResponse.json({ jobId: job.id });
  } catch (err: any) {
    // Always return JSON so the client never sees "Unexpected end of JSON input".
    return NextResponse.json(
      { error: err?.message ?? "Failed to start audit." },
      { status: 500 }
    );
  }
}
