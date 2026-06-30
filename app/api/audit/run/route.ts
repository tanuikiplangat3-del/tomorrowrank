// POST /api/audit/run  { jobId }
// Internal background worker. Invoked (fire-and-forget) by /api/audit/start.
// Protected by an internal secret so it can't be triggered externally.
import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { getJob, updateJob } from "@/lib/store/jobs";
import { runAudit } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel Hobby cap. Raise to 300 on Pro.

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get("x-internal-secret");
    if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { jobId } = await req.json();
    const job = await getJob(jobId);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    // Run the audit in the background and return immediately so the trigger
    // request from /start resolves fast. waitUntil keeps this invocation alive
    // until the audit finishes (up to maxDuration).
    waitUntil(
      runAudit(job).catch((e) =>
        updateJob(job.id, {
          status: "error",
          stage: "Failed",
          error: e?.message ?? "Audit crashed.",
        })
      )
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Worker failed." },
      { status: 500 }
    );
  }
}
