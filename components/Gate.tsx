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

import { createContext, useContext } from "react";

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

// Whether the current viewer is internal (unblurred) or external (gated).
export const GateContext = createContext<{ gated: boolean }>({ gated: true });
export function useGated(): boolean {
  return useContext(GateContext).gated;
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
  async function requestReport() {
    try {
      await fetch(apiPath("/api/report/request"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      // Placeholder UX until the real email+Attio flow lands.
      alert("Thanks! Your report is on its way to your email.");
    } catch {
      alert("Something went wrong — please try again shortly.");
    }
  }
  return (
    <button
      type="button"
      onClick={requestReport}
      className={
        "inline-block rounded-lg bg-wtgreen px-6 py-3 text-sm font-bold uppercase tracking-wide text-paper transition hover:bg-wtgreenDeep " +
        className
      }
    >
      {label}
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
