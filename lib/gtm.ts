// lib/gtm.ts
// Push a custom event into GTM's dataLayer. Configure a matching Trigger in GTM
// (Custom Event = the `event` name) to fire GA4 / conversion tags.
export function gtmEvent(event: string, params: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { dataLayer?: Record<string, unknown>[] };
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push({ event, ...params });
}
