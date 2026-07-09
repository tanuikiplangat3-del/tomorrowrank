"use client";
// components/LeadGate.tsx
// Non-dismissable gate shown when the user clicks Audit. The audit only starts
// after a valid submission (enforced server-side too). No close/X, no
// outside-click dismiss, no ESC — it resolves only on success. Any COMPANY email
// is accepted (free inboxes like Gmail/Yahoo are rejected); the email no longer
// has to match the audited domain.

import { useEffect, useState } from "react";
import { apiPath } from "./Gate";
import { siteHost } from "@/lib/leadmatch";
import { gtmEvent } from "@/lib/gtm";

// Obvious free/public inboxes — quick client-side feedback (server is authoritative).
const FREE = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "ymail.com", "hotmail.com",
  "outlook.com", "live.com", "msn.com", "icloud.com", "me.com", "aol.com", "proton.me",
  "protonmail.com", "gmx.com", "mail.com", "zoho.com", "yandex.com",
]);

export function LeadGate({
  url,
  onVerified,
}: {
  url: string;
  onVerified: (leadId: string, email: string) => void;
}) {
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [newsletter, setNewsletter] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Lock background scroll while the gate is open — the screen stays put.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  async function submit() {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) { setError("Please enter your first and last name."); return; }
    if (!email.trim()) { setError("Please enter your company email."); return; }
    if (!agreed) { setError("Please tick the box to receive your audit by email."); return; }
    const domain = email.split("@")[1]?.toLowerCase().trim();
    if (!domain || !domain.includes(".")) { setError("Please enter a valid company email."); return; }
    if (FREE.has(domain)) {
      setError("Please use your company email — free inboxes (Gmail, Yahoo, Outlook, etc.) aren't accepted.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(apiPath("/api/lead"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, position, agreed, newsletter, url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Could not verify your details."); setSubmitting(false); return; }
      gtmEvent("generate_lead", { site: siteHost(url), newsletter });
      onVerified(data.leadId, email);
    } catch {
      setError("Network error — please try again.");
      setSubmitting(false);
    }
  }

  const field =
    "w-full rounded-lg border border-glassBorder bg-white/[0.04] px-3 py-2.5 text-sm text-paper placeholder:text-muted outline-none focus:border-wtgreen";

  return (
    // Fixed full-screen overlay; blocks everything behind it (background scroll locked).
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
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
          <input className={field} type="email" placeholder="Company email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className={field} placeholder="Position" value={position} onChange={(e) => setPosition(e.target.value)} />

          <label className="flex cursor-pointer items-start gap-2.5 pt-1">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-wtgreen" />
            <span className="text-xs leading-relaxed text-muted">
              I agree to receive my SEO audit by email from Welcome Tomorrow, with the option to be
              contacted about a customised report.
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2.5">
            <input type="checkbox" checked={newsletter} onChange={(e) => setNewsletter(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-wtgreen" />
            <span className="text-xs leading-relaxed text-muted">
              I&apos;d like to receive Welcome Tomorrow&apos;s free bi-weekly newsletter.
            </span>
          </label>

          {error && <p className="text-sm font-medium text-bad">{error}</p>}

          <button
            onClick={submit}
            disabled={submitting}
            className="mt-1 w-full rounded-lg bg-wtgreen px-6 py-3 text-base font-bold uppercase tracking-wide text-paper transition hover:bg-wtgreenDeep disabled:opacity-60"
          >
            {submitting ? "Verifying…" : "Run my audit →"}
          </button>

          <p className="text-center text-[11px] text-muted">Powered by Welcome Tomorrow</p>
        </div>
      </div>
    </div>
  );
}

function prettyHost(url: string): string {
  try { return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, ""); }
  catch { return url || "your site"; }
}
