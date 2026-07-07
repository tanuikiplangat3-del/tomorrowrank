"use client";
// components/LeadGate.tsx
// Non-dismissable gate shown when the user clicks Audit. The audit only starts
// after a valid submission (enforced server-side too). No close/X, no
// outside-click dismiss, no ESC — it resolves only on success.

import { useState } from "react";
import { apiPath } from "./Gate";
import { emailMatchesSite, siteHost } from "@/lib/leadmatch";

export function LeadGate({
  url,
  onVerified,
}: {
  url: string;
  onVerified: (leadId: string) => void;
}) {
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [newsletter, setNewsletter] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setMismatch(false);
    if (!firstName.trim() || !lastName.trim()) { setError("Please enter your first and last name."); return; }
    if (!email.trim()) { setError("Please enter your company email."); return; }
    if (!agreed) { setError("Please tick the box to receive your audit by email."); return; }
    // The company email must belong to the domain being audited. If it doesn't,
    // we don't error — we invite them to contact Welcome Tomorrow to verify.
    if (!emailMatchesSite(email, url)) { setMismatch(true); return; }
    setSubmitting(true);
    try {
      const res = await fetch(apiPath("/api/lead"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, position, agreed, newsletter, url }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 422 || data.error === "MISMATCH") { setMismatch(true); setSubmitting(false); return; }
      if (!res.ok) { setError(data.error || "Could not verify your details."); setSubmitting(false); return; }
      onVerified(data.leadId);
    } catch {
      setError("Network error — please try again.");
      setSubmitting(false);
    }
  }

  const contactHref =
    `mailto:seo@welcometomorrow.io?subject=${encodeURIComponent(`Audit verification for ${siteHost(url) ?? url}`)}` +
    `&body=${encodeURIComponent(`Hi Welcome Tomorrow team,\n\nI'd like to run an SEO & AI-visibility audit for ${siteHost(url) ?? url}, but my email domain doesn't match the site. Could you help verify me?\n\nName: ${firstName} ${lastName}\nEmail: ${email}\nSite: ${url}\n\nThanks!`)}`;

  const field =
    "w-full rounded-lg border border-glassBorder bg-white/[0.04] px-3 py-2.5 text-sm text-paper placeholder:text-muted outline-none focus:border-wtgreen";

  return (
    // Fixed full-screen overlay; blocks everything behind it.
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-glassBorder bg-[#0c0f0d] p-6 shadow-2xl sm:p-8">
        <h2 className="font-display text-2xl font-extrabold text-paper">Get your free SEO &amp; AI visibility audit</h2>
        <p className="mt-2 text-sm text-muted">
          Tell us where to send your report for{" "}
          <span className="font-semibold text-paper">{prettyHost(url)}</span>. We&apos;ll email your full audit.
        </p>

        <div className="mt-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input className={field} placeholder="First name" value={firstName} onChange={(e) => setFirst(e.target.value)} />
            <input className={field} placeholder="Last name" value={lastName} onChange={(e) => setLast(e.target.value)} />
          </div>
          <input className={field} type="email" placeholder="Company email (no Gmail/Yahoo)" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className={field} placeholder="Position" value={position} onChange={(e) => setPosition(e.target.value)} />

          <label className="flex cursor-pointer items-start gap-2.5 pt-1">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-wtgreen" />
            <span className="text-xs leading-relaxed text-muted">
              I agree to receive the SEO audit on my email from Welcome Tomorrow, and possible reach-out if I&apos;d
              like a customized report.
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2.5">
            <input type="checkbox" checked={newsletter} onChange={(e) => setNewsletter(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-wtgreen" />
            <span className="text-xs leading-relaxed text-muted">
              Subscribe me to the Welcome Tomorrow newsletter for SEO &amp; AI-visibility insights.
            </span>
          </label>

          {error && <p className="text-sm font-medium text-bad">{error}</p>}

          {mismatch ? (
            <div className="mt-1 space-y-2.5 rounded-lg border border-wtgreen/40 bg-wtgreen/10 p-3.5">
              <p className="text-sm font-semibold text-paper">
                That email doesn&apos;t match {siteHost(url) ?? "the site"}.
              </p>
              <p className="text-xs leading-relaxed text-muted">
                We send reports to a company email on the same domain as the site being audited. If you
                work with {siteHost(url) ?? "this site"} but use a different email, contact us to verify.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <a
                  href={contactHref}
                  className="flex-1 rounded-md bg-wtgreen px-4 py-2 text-center text-sm font-semibold text-paper transition hover:bg-wtgreenDeep"
                >
                  Contact to verify →
                </a>
                <button
                  onClick={() => { setMismatch(false); setEmail(""); }}
                  className="flex-1 rounded-md border border-glassBorder px-4 py-2 text-center text-sm font-semibold text-paper transition hover:border-wtgreen"
                >
                  Edit email
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={submit}
              disabled={submitting}
              className="mt-1 w-full rounded-lg bg-wtgreen px-6 py-3 text-base font-bold uppercase tracking-wide text-paper transition hover:bg-wtgreenDeep disabled:opacity-60"
            >
              {submitting ? "Verifying…" : "Run my audit →"}
            </button>
          )}
          <p className="text-center text-[11px] text-muted">Powered by Welcome Tomorrow · welcometomorrow.io</p>
        </div>
      </div>
    </div>
  );
}

function prettyHost(url: string): string {
  try { return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, ""); }
  catch { return url || "your site"; }
}
