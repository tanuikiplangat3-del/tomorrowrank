// lib/email/resend.ts
// Sends the audit report (PDF attachment) via Resend from seo@welcometomorrow.io.

import { Resend } from "resend";

export function resendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

const FROM = process.env.REPORT_FROM_EMAIL || "Welcome Tomorrow <seo@welcometomorrow.io>";

export async function sendReportEmail(opts: {
  to: string;
  firstName: string;
  siteLabel: string;
  pdf: Uint8Array;
  filename: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!process.env.RESEND_API_KEY) return { ok: false, error: "RESEND_API_KEY not set" };
  const resend = new Resend(process.env.RESEND_API_KEY);

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#14201c;line-height:1.6">
      <p>Hi ${escapeHtml(opts.firstName) || "there"},</p>
      <p>Thanks for using the Welcome Tomorrow SEO &amp; AI Visibility tool. Your full report for
      <strong>${escapeHtml(opts.siteLabel)}</strong> is attached as a PDF.</p>
      <p>It covers your technical SEO health, content and on-page findings, backlink profile, and how
      your brand shows up in AI answers (ChatGPT &amp; Google AI Overviews) — with prioritised
      recommendations.</p>
      <p>If you'd like us to help act on any of it, just reply to this email or book a call and we'll
      take a look together.</p>
      <p>Best,<br/>The Welcome Tomorrow team<br/>
      <a href="https://welcometomorrow.io" style="color:#29b878">welcometomorrow.io</a></p>
    </div>`;

  try {
    const res = await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: `Your SEO & AI Visibility report — ${opts.siteLabel}`,
      html,
      attachments: [{ filename: opts.filename, content: Buffer.from(opts.pdf) }],
    });
    if ((res as any).error) return { ok: false, error: JSON.stringify((res as any).error) };
    return { ok: true, id: (res as any).data?.id };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
