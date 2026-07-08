import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/store/jobs";
import { getLead } from "@/lib/store/leads";
import { buildReportNarrative } from "@/lib/report/narrative";
import { buildReportPdf } from "@/lib/report/pdf";
import { sendReportEmail, resendConfigured } from "@/lib/email/resend";

export const maxDuration = 60;

/**
 * POST /api/report/request  — "Click to receive report"
 * Body: { jobId, leadId?, email?, source? }
 *
 * 1. Load the finished audit (report + aiVisibility) by jobId.
 * 2. Resolve the recipient email (leadId -> lead.email, or body.email).
 * 3. Claude writes a precise narrative from the REAL data.
 * 4. Render a branded PDF (pdf-lib) and email it via Resend from seo@welcometomorrow.io.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const jobId = typeof body?.jobId === "string" ? body.jobId : "";
    const leadId = typeof body?.leadId === "string" ? body.leadId : "";
    let email = typeof body?.email === "string" ? body.email : "";

    if (!jobId) {
      return NextResponse.json({ ok: false, error: "Missing audit reference." }, { status: 400 });
    }

    const job = await getJob(jobId);
    if (!job?.report) {
      return NextResponse.json({ ok: false, error: "Report not found or not ready yet." }, { status: 404 });
    }

    // Resolve recipient
    let firstName = "there";
    if (leadId) {
      const lead = await getLead(leadId);
      if (lead) { email = email || lead.email; firstName = lead.firstName || firstName; }
    }
    if (!email) {
      return NextResponse.json({ ok: false, error: "No email on file for this report." }, { status: 400 });
    }

    if (!resendConfigured()) {
      return NextResponse.json({ ok: false, error: "Email sending is not configured yet." }, { status: 503 });
    }

    const siteLabel = job.report?.meta?.finalUrl
      ? new URL(job.report.meta.finalUrl).hostname.replace(/^www\./, "")
      : (job.input?.url || "your site");

    // Claude narrative from real data -> PDF
    let content, pdf;
    try {
      content = await buildReportNarrative({ siteLabel, report: job.report, ai: job.aiVisibility });
    } catch (e: any) {
      console.error("[report/request] narrative failed:", e?.message ?? e);
      return NextResponse.json({ ok: false, error: "Could not build the report content." }, { status: 500 });
    }
    try {
      pdf = await buildReportPdf(content);
    } catch (e: any) {
      console.error("[report/request] pdf failed:", e?.message ?? e);
      return NextResponse.json({ ok: false, error: "Could not render the PDF." }, { status: 500 });
    }

    const result = await sendReportEmail({
      to: email,
      firstName,
      siteLabel,
      pdf,
      filename: `SEO-AI-Report-${siteLabel}.pdf`,
    });

    if (!result.ok) {
      console.error("[report/request] RESEND failed:", result.error);
      return NextResponse.json({ ok: false, error: "Could not send the email. Please try again." }, { status: 502 });
    }
    console.log(`[report/request] sent to ${email} (id=${result.id})`);

    return NextResponse.json({ ok: true, sentTo: email });
  } catch (err: any) {
    console.error("[report/request] error:", err?.message ?? err);
    return NextResponse.json({ ok: false, error: "Something went wrong generating the report." }, { status: 500 });
  }
}
