// POST /api/audit/start  { url, country, language, targetKeyword? }
// Creates a job, triggers the background runner, returns { jobId } immediately.
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { waitUntil } from "@vercel/functions";
import type { AuditJob } from "@/types/audit";
import { saveJob, isRedisConfigured } from "@/lib/store/jobs";

export const runtime = "nodejs";

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
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveJob(job); // throws a clear message if Redis creds are wrong

    // Trigger the background worker. waitUntil keeps the function alive long
    // enough to actually deliver the request on Vercel serverless.
    const trigger = fetch(`${baseUrl(req)}/api/audit/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_SECRET || "",
      },
      body: JSON.stringify({ jobId: job.id }),
    }).catch(() => {});
    waitUntil(trigger);

    return NextResponse.json({ jobId: job.id });
  } catch (err: any) {
    // Always return JSON so the client never sees "Unexpected end of JSON input".
    return NextResponse.json(
      { error: err?.message ?? "Failed to start audit." },
      { status: 500 }
    );
  }
}
