import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/report/request
 *
 * Triggered by the "Click to receive report" CTA.
 *
 * FINAL INTENDED BEHAVIOUR (two pieces still to build):
 *   1. Email the full report to the lead's captured email.
 *      -> Implement with Resend once the account + from-address exist.
 *   2. Move the lead Captured -> Nurturing in Attio.
 *      -> Look up the Person by email, find their SEO-sourced Deal, and advance
 *         the stage ONLY if it is still "Captured" (never move backwards).
 *      -> Blocked on Attio API key + object/field IDs from Victor.
 *
 * For now this is a safe stub: it acknowledges the request so the UI works,
 * without pretending to send an email or update the CRM. Wire the two steps
 * below when their dependencies are ready — the frontend button won't change.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const source = typeof body?.source === "string" ? body.source : "unknown";

    // TODO(Resend): send the report email to the lead's captured address.
    // TODO(Attio): upsert Person by email, then move their SEO Deal
    //   Captured -> Nurturing (only if currently Captured).

    // Minimal trace so we can see the CTA is being used before the flow is live.
    console.log(`[report/request] received (source=${source})`);

    return NextResponse.json({
      ok: true,
      pending: true,
      message:
        "Report request received. Email + CRM update are not yet wired (awaiting Resend + Attio).",
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
