// POST /api/audit/run  { jobId }
//
// Executes an audit that /api/audit/start has already persisted. The BROWSER
// calls this and holds the connection open for the whole run, which is what
// allows a 1-3 minute audit on Cloudflare Workers (no duration limit while the
// client is connected; ctx.waitUntil() would only give 30s).
//
// Authorisation, since a browser cannot hold INTERNAL_SECRET:
//   - a server-to-server caller may still present x-internal-secret, OR
//   - the caller presents a jobId that exists and is still "queued".
// jobIds are random UUIDs, so they are unguessable, and the "queued" check
// makes this single-use: once an audit starts, the same id cannot re-trigger
// it. That closes the replay/amplification risk the secret was guarding.
import { NextRequest, NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/store/jobs";
import { runAudit } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const maxDuration = 300; // long crawls; Render ignores, Vercel Pro honors

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get("x-internal-secret");
    const hasSecret =
      !!process.env.INTERNAL_SECRET && secret === process.env.INTERNAL_SECRET;

    const { jobId } = await req.json();
    const job = await getJob(jobId);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    // Without the secret, only an untouched job may be started, and only once.
    if (!hasSecret && job.status !== "queued") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Claim it immediately so a duplicate call cannot start a second run.
    await updateJob(job.id, { status: "running", stage: "Starting" });

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
