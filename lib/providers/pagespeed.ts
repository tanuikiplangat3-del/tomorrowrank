// lib/providers/pagespeed.ts
// Google PageSpeed Insights API (free). Returns Lighthouse + CrUX field data.
// Get a key at https://developers.google.com/speed/docs/insights/v5/get-started
// Free quota: 25,000 requests/day, 400/100s. No cost.

import type { PageSpeedReport } from "@/types/audit";

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export async function pageSpeed(
  url: string,
  strategy: "mobile" | "desktop",
  timeoutMs = 20_000
): Promise<PageSpeedReport> {
  const key = process.env.PAGESPEED_API_KEY;
  const params = new URLSearchParams({ url, strategy });
  // request all categories so we can also reuse accessibility/seo signals if needed
  ["performance", "accessibility", "best-practices", "seo"].forEach((c) =>
    params.append("category", c)
  );
  if (key) params.set("key", key);

  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PageSpeed ${strategy} failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = await res.json();

  const lh = data?.lighthouseResult;
  const audits = lh?.audits ?? {};
  const perf = lh?.categories?.performance?.score;
  const crux = data?.loadingExperience?.metrics ?? {};

  const num = (v: any): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  const lcp = num(audits["largest-contentful-paint"]?.numericValue);
  const cls = num(audits["cumulative-layout-shift"]?.numericValue);
  const inp =
    num(crux["INTERACTION_TO_NEXT_PAINT"]?.percentile) ??
    num(audits["interactive"]?.numericValue);
  const fcp = num(audits["first-contentful-paint"]?.numericValue);
  const ttfb = num(audits["server-response-time"]?.numericValue);
  const si = num(audits["speed-index"]?.numericValue);
  const totalBytes = num(audits["total-byte-weight"]?.numericValue);

  const cwvCategory = data?.loadingExperience?.overall_category;
  const passesCWV =
    cwvCategory === "FAST"
      ? true
      : cwvCategory === "AVERAGE" || cwvCategory === "SLOW"
      ? false
      : null;

  return {
    strategy,
    performanceScore: perf == null ? null : Math.round(perf * 100),
    lcp: lcp == null ? null : +(lcp / 1000).toFixed(2),
    cls: cls == null ? null : +cls.toFixed(3),
    inp,
    fcp: fcp == null ? null : +(fcp / 1000).toFixed(2),
    ttfb,
    speedIndex: si == null ? null : +(si / 1000).toFixed(2),
    totalBytes,
    passesCoreWebVitals: passesCWV,
  };
}
