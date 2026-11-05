// POST /api/audit/run  { jobId }
// Internal background worker. Invoked (fire-and-forget) by /api/audit/start.
// Protected by an internal secret so it can't be triggered externally.
import { NextRequest, NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/store/jobs";
import { runAudit } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const maxDuration = 300; // long crawls; Render ignores, Vercel Pro honors

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get("x-internal-secret");
    if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { jobId } = await req.json();
    const job = await getJob(jobId);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    // AWAIT the audit, holding this request open until it finishes.
    //
    // Cloudflare Workers: ctx.waitUntil() only extends execution for 30s after
    // a response is sent, which is far short of a 1-3 minute audit. But the
    // docs are explicit that there is NO duration limit while the client stays
    // connected. So the browser fires this request and leaves it open; the
    // Worker keeps running for as long as it takes. Progress still reaches the
    // UI because runAudit writes each stage to Redis, which /status polls.
    //
    // Node: identical behaviour, just a long-lived request.
    await runAudit(job).catch((e) =>
      updateJob(job.id, {
        status: "error",
        stage: "Failed",
        error: e?.message ?? "Audit crashed.",
      })
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Worker failed." },
      { status: 500 }
    );
  }
}
