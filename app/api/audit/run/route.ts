// POST /api/audit/run  { jobId }
// Internal background worker. Invoked (fire-and-forget) by /api/audit/start.
// Protected by an internal secret so it can't be triggered externally.
import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/store/jobs";
import { runAudit } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel Hobby cap. Raise to 300 on Pro.

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-internal-secret");
  if (secret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { jobId } = await req.json();
  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  await runAudit(job); // run to completion within this invocation
  return NextResponse.json({ ok: true });
}
