// GET /api/audit/status?id=...  -> current job state (+ report when done)
import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/store/jobs";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json(job);
}
