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

// Single outbound destination for every CTA, so the CRM can attribute the lead
// to this tool. Swap BOOKING_URL when the real CRM/booking link is provided.
export const BOOKING_URL = "https://welcometomorrow.typeform.com/to/CeIvTBF5";

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
 * Wraps detail content. For external viewers it blurs the children and overlays
 * a "Book a call" CTA. For internal viewers it renders children as-is.
 */
export function BlurGate({
  children,
  source,
  label = "Book a quick call with our expert to receive a customized detailed report",
}: {
  children: React.ReactNode;
  source: string;
  label?: string;
}) {
  const gated = useGated();
  if (!gated) return <>{children}</>;

  return (
    <div className="relative">
      {/* Real content, blurred and non-interactive */}
      <div className="pointer-events-none select-none blur-[6px]" aria-hidden="true">
        {children}
      </div>
      {/* Overlay CTA */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-ink/40 p-6 text-center backdrop-blur-[2px]">
        <p className="max-w-md text-sm font-semibold text-paper">
          The detailed findings are ready. Book a quick call with our expert to receive your
          customized, detailed report.
        </p>
        <CtaButton label="Book a call with our expert" source={source} />
      </div>
    </div>
  );
}
