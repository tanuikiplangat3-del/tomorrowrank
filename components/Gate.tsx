"use client";
// components/Gate.tsx
// Shared commercial-gating helpers used across the report.
//
// External leads see summaries but the *detail* behind each expandable section
// is visually blurred with a "Book a call" CTA over it. Internal team members
// (who reached the tool via the secret /seo path) see everything unblurred.
//
// NOTE: this is a *visual* gate (Option A). The data is present in the DOM, so a
// technical user could remove the blur in dev tools. That is an accepted
// trade-off for a marketing tease; true server-side gating is a later option.

import { createContext, useContext, useState } from "react";

// Discovery-call booking goes to Ochuko's Cal page. The booking -> Attio stage
// move is handled by the existing n8n backend (matched on email), NOT by this app.
export const BOOKING_URL = "https://cal.wtlabs-n8n.com/ochuko-adeboye/30min";

// The app runs under a basePath (e.g. /ranktomorrow). Client-side fetch() is NOT
// auto-prefixed by Next.js, so API calls must go through this helper.
export const BASE_PATH = "/ranktomorrow";
export function apiPath(p: string): string {
  const path = p.startsWith("/") ? p : `/${p}`;
  return `${BASE_PATH}${path}`;
}

// Add a source tag so it's traceable as coming from RankTomorrow.
export function ctaHref(source: string): string {
  const sep = BOOKING_URL.includes("?") ? "&" : "?";
  return `${BOOKING_URL}${sep}utm_source=ranktomorrow&utm_medium=audit&utm_content=${encodeURIComponent(source)}`;
}

// Whether the current viewer is internal (unblurred) or external (gated), plus
// the ids needed to email the report (jobId = which audit, leadId = who).
export const GateContext = createContext<{ gated: boolean; jobId?: string; leadId?: string; email?: string }>({ gated: true });
export function useGated(): boolean {
  return useContext(GateContext).gated;
}
export function useGateInfo() {
  return useContext(GateContext);
}

/** Primary CTA button — always routes to the single booking URL with a source tag. */
export function CtaButton({
  label,
  source,
  className = "",
}: { label: string; source: string; className?: string }) {
  return (
    <a
      href={ctaHref(source)}
      target="_blank"
      rel="noopener noreferrer"
      className={
        "inline-block rounded-lg bg-wtgreen px-6 py-3 text-sm font-bold uppercase tracking-wide text-paper transition hover:bg-wtgreenDeep " +
        className
      }
    >
      {label}
    </a>
  );
}

/**
 * "Click to receive report" CTA.
 *
 * INTENDED FINAL BEHAVIOUR (not yet wired — depends on two unbuilt pieces):
 *   1. Email the full report to the lead's captured email  -> needs Resend
 *   2. Move the lead Captured -> Nurturing in Attio         -> needs Attio integration
 *
 * Until those exist, this posts to /api/report/request (a stub endpoint) which
 * currently just acknowledges. When Resend + Attio are ready, implement the
 * send + stage-move inside that route — the button here won't need to change.
 */
export function ReportButton({
  source,
  className = "",
  label = "Click to receive report",
}: { source: string; className?: string; label?: string }) {
  const { jobId, leadId, email } = useGateInfo();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function requestReport() {
    setState("sending");
    try {
      const res = await fetch(apiPath("/api/report/request"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, jobId, leadId, email }),
      });
      const data = await res.json().catch(() => ({}));
      setState(res.ok && data.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <p className={"text-sm font-semibold text-wtgreen " + className}>
        ✓ Sent! Check your inbox for the full report.
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={requestReport}
      disabled={state === "sending"}
      className={
        "inline-block rounded-lg bg-wtgreen px-6 py-3 text-sm font-bold uppercase tracking-wide text-paper transition hover:bg-wtgreenDeep disabled:opacity-60 " +
        className
      }
    >
      {state === "sending" ? "Sending…" : state === "error" ? "Try again" : label}
    </button>
  );
}

/**
 * Wraps detail content. Content is now shown unblurred for all viewers. For
 * external (gated) viewers, a "Click to receive report" CTA is appended below
 * the detail so they can request the full report by email.
 */
export function BlurGate({
  children,
  source,
}: {
  children: React.ReactNode;
  source: string;
  label?: string;
}) {
  const gated = useGated();
  if (!gated) return <>{children}</>;

  return (
    <div>
      {children}
      <div className="mt-4 flex flex-col items-center gap-2 rounded-lg bg-wtgreen/10 p-4 text-center">
        <p className="max-w-md text-sm font-semibold text-paper">
          Want the full findings and recommendations sent to you?
        </p>
        <ReportButton source={source} />
      </div>
    </div>
  );
}
