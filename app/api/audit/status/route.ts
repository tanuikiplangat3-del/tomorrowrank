// GET /api/audit/status?id=...  -> current job state (+ report when done)
import { NextRequest, NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/store/jobs";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Safety net: if a job is still "queued"/"running" but past its hard deadline,
  // the process that ran it almost certainly died (e.g. a heavy site restarted the
  // container). Report it as failed so the UI stops spinning — and persist that so
  // it stays terminal. This guarantees an audit can never spin forever.
  if ((job.status === "running" || job.status === "queued") && job.deadlineAt && Date.now() > job.deadlineAt) {
    const timedOut = {
      ...job,
      status: "error" as const,
      stage: "Timed out",
      error: "The audit stopped responding (the site may be very large or heavily protected). Please try again.",
    };
    updateJob(id, { status: "error", stage: "Timed out", error: timedOut.error }).catch(() => {});
    return NextResponse.json(timedOut);
  }

  return NextResponse.json(job);
}
