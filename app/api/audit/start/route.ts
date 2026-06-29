// POST /api/audit/start  { url, country, language, targetKeyword? }
// Creates a job, triggers the background runner, returns { jobId } immediately.
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import type { AuditJob } from "@/types/audit";
import { saveJob } from "@/lib/store/jobs";

export const runtime = "nodejs";

function baseUrl(req: NextRequest): string {
  // Prefer an explicit public URL; fall back to request origin.
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    `${req.nextUrl.protocol}//${req.headers.get("host")}`
  );
}

export async function POST(req: NextRequest) {
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
  await saveJob(job);

  // Trigger the background worker without awaiting its completion.
  fetch(`${baseUrl(req)}/api/audit/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": process.env.INTERNAL_SECRET || "",
    },
    body: JSON.stringify({ jobId: job.id }),
  }).catch(() => {});

  return NextResponse.json({ jobId: job.id });
}
