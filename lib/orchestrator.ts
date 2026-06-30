// lib/orchestrator.ts
// Runs the full audit pipeline and writes progress to the job store.

import type {
  AuditJob,
  AuditReport,
  KeywordRanking,
  Backlink,
  BacklinkSummary,
} from "@/types/audit";
import { updateJob } from "@/lib/store/jobs";
import { fetchPageSignals } from "@/lib/seo/fetcher";
import { pageSpeed } from "@/lib/providers/pagespeed";
import {
  domainRating,
  backlinksStats,
  topBacklinks,
  topAnchors,
  topPagesByBacklinks,
  referringDomains,
  organicKeywords,
} from "@/lib/providers/ahrefs";
import { analyzeGeo } from "@/lib/geo/analyzer";
import {
  runChecks,
  scoreCategories,
  overallScore,
  buildRecommendations,
} from "@/lib/seo/scoring";
import { runAiVisibility } from "@/lib/ai-visibility/engine";
import { resolveLocation, resolveLanguage } from "@/lib/locations";

function domainOf(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function runAudit(job: AuditJob): Promise<void> {
  const { url, country, language, targetKeyword } = job.input;
  const loc = resolveLocation(country);
  const lang = resolveLanguage(language);
  const domain = domainOf(url);

  // Wall-clock budget so the job ALWAYS reaches a terminal state before Vercel
  // kills the function. Hobby = 60s (default 50s budget); on Pro set
  // AUDIT_BUDGET_MS=240000 and maxDuration=300 in the run route.
  const BUDGET_MS = Number(process.env.AUDIT_BUDGET_MS) || 50_000;
  const startedAt = Date.now();
  const remaining = () => Math.max(0, BUDGET_MS - (Date.now() - startedAt));

  const set = (stage: string, progress: number) =>
    updateJob(job.id, { status: "running", stage, progress });

  try {
    // 1. Fetch + parse the page
    await set("Fetching and parsing your page", 8);
    const signals = await fetchPageSignals(url);

    // 2. PageSpeed (mobile + desktop) in parallel — free API
    await set("Measuring Core Web Vitals & PageSpeed", 22);
    const psTimeout = Math.min(20_000, Math.max(6_000, remaining() - 25_000));
    const [mobile, desktop] = await Promise.all([
      pageSpeed(signals.finalUrl, "mobile", psTimeout).catch(() => emptyPSI("mobile")),
      pageSpeed(signals.finalUrl, "desktop", psTimeout).catch(() => emptyPSI("desktop")),
    ]);

    // 3. Ahrefs: keywords + backlinks + domain rating (parallel, resilient)
    await set("Pulling keyword rankings & backlinks", 42);
    const [kwRaw, drRaw, blStatsRaw, blTopRaw, anchorsRaw, pagesRaw, refDomainsRaw] =
      await Promise.allSettled([
        organicKeywords(domain, loc.countryCode),
        domainRating(domain),
        backlinksStats(domain),
        topBacklinks(domain),
        topAnchors(domain),
        topPagesByBacklinks(domain),
        referringDomains(domain),
      ]);

    const organic = mapKeywords(val(kwRaw, []));
    const paid: KeywordRanking[] = []; // paid keywords are a separate Ahrefs endpoint; omitted on Standard
    const dr = val(drRaw, { domainRating: null, ahrefsRank: null });
    const blStats = val(blStatsRaw, { totalBacklinks: null, referringDomains: null });
    const refDoms = val(refDomainsRaw, [] as any[]);
    const blSummary = mapBacklinkSummary(blStats, dr, refDoms);
    const topLinks = mapBacklinks(val(blTopRaw, []));

    // 4. GEO analysis (Claude + web-search citation probe)
    await set("Analysing Generative Engine Optimization (GEO)", 60);
    const probeQueries = organic.slice(0, 3).map((k) => k.keyword);
    if (probeQueries.length === 0 && targetKeyword) probeQueries.push(targetKeyword);
    if (probeQueries.length === 0) probeQueries.push(`best ${domain.split(".")[0]} services ${country}`);
    const geo = await analyzeGeo(signals, domain, probeQueries);

    // 5. Run checks + scoring
    await set("Scoring your site", 72);
    const checks = runChecks(signals, { mobile, desktop }, geo, targetKeyword);

    // append backlink-derived checks
    checks.push({
      id: "backlink-summary",
      label: "Backlink Summary",
      category: "Links",
      status: (blSummary.referringDomains ?? 0) > 10 ? "pass" : "warn",
      weight: 2,
      value: `${blSummary.totalBacklinks ?? 0} links · ${blSummary.referringDomains ?? 0} domains`,
      detail: `Domain Rating ${blSummary.domainAuthority ?? "?"}`,
      priority: (blSummary.referringDomains ?? 0) > 10 ? "pass" : "low",
      recommendation:
        (blSummary.referringDomains ?? 0) > 10
          ? undefined
          : "Build more high-quality backlinks from relevant referring domains.",
    });

    const categories = scoreCategories(checks);
    const overall = overallScore(categories);
    const recommendations = buildRecommendations(checks);

    const report: AuditReport = {
      meta: {
        url,
        finalUrl: signals.finalUrl,
        country,
        countryCode: loc.countryCode,
        language,
        languageCode: lang.languageCode,
        targetKeyword,
        fetchedAt: new Date().toISOString(),
      },
      overall: {
        grade: overall.grade,
        score: overall.score,
        summary:
          overall.score >= 90 ? "Your page is in great shape"
          : overall.score >= 75 ? "Your page could be better"
          : "Your page needs attention",
        recommendationCount: recommendations.length,
      },
      categories,
      checks,
      recommendations,
      keywords: {
        organic,
        paid,
        trafficFromSearch: estimateTraffic(organic),
      },
      backlinks: {
        summary: blSummary,
        top: topLinks,
        topPages: mapTopPages(val(pagesRaw, [])),
        topAnchors: mapAnchors(val(anchorsRaw, [])),
        geographies: deriveGeographies(refDoms),
      },
      performance: { mobile, desktop },
      geo,
    };

    await updateJob(job.id, { status: "running", stage: "Building AI Visibility report", progress: 80, report });

    // 6. AI Visibility (multi-LLM share of voice) — heaviest step, runs last.
    // Time-boxed against the remaining budget. If it can't finish in time, we
    // still complete the audit with the core report rather than hang forever.
    const pageText = stripTags(signals.html).slice(0, 8000);
    const aiBudget = remaining() - 4_000; // leave headroom to write the result
    let aiVisibility: any = undefined;
    if (aiBudget > 8_000) {
      aiVisibility = await withTimeout(
        runAiVisibility(domain, country, pageText, (stage, p) =>
          updateJob(job.id, { stage, progress: 80 + Math.round(p * 0.2) })
        ),
        aiBudget
      ).catch(() => undefined);
    }

    await updateJob(job.id, {
      status: "done",
      stage: "Complete",
      progress: 100,
      report,
      ...(aiVisibility ? { aiVisibility } : {}),
    });
  } catch (err: any) {
    await updateJob(job.id, {
      status: "error",
      stage: "Failed",
      error: err?.message ?? "Unknown error",
    });
  }
}

// ---------- mapping helpers ----------
// Resolve a promise, or reject after ms — used to time-box slow optional steps.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("step timed out")), ms)),
  ]);
}

function val<T>(r: PromiseSettledResult<T>, fallback: T): T {
  return r.status === "fulfilled" ? r.value : fallback;
}

function emptyPSI(strategy: "mobile" | "desktop") {
  return {
    strategy, performanceScore: null, lcp: null, cls: null, inp: null,
    fcp: null, ttfb: null, speedIndex: null, totalBytes: null, passesCoreWebVitals: null,
  };
}

function mapKeywords(items: any[]): KeywordRanking[] {
  // Ahrefs organic-keywords columns: keyword, best_position, volume,
  // sum_traffic, best_position_url, keyword_difficulty, cpc
  return items
    .slice(0, 20)
    .map((it) => ({
      keyword: it?.keyword ?? "",
      position: it?.best_position ?? 0,
      searchVolume: it?.volume ?? null,
      estimatedTraffic: it?.sum_traffic ?? null,
      url: it?.best_position_url ?? undefined,
      type: "organic" as const,
    }))
    .filter((k) => k.keyword);
}

function estimateTraffic(organic: KeywordRanking[]): number | null {
  const sum = organic.reduce((a, k) => a + (k.estimatedTraffic ?? 0), 0);
  return sum > 0 ? Math.round(sum) : null;
}

function mapBacklinkSummary(
  stats: { totalBacklinks: number | null; referringDomains: number | null },
  dr: { domainRating: number | null },
  refDoms: any[]
): BacklinkSummary {
  const dofollow = refDoms.reduce((a, d) => a + (d?.dofollow_links ?? 0), 0) || null;
  return {
    totalBacklinks: stats.totalBacklinks,
    referringDomains: stats.referringDomains,
    domainAuthority: dr.domainRating, // Ahrefs Domain Rating (0-100)
    dofollow,
    nofollow: null,
  };
}

function mapBacklinks(items: any[]): Backlink[] {
  // Ahrefs all-backlinks columns: url_from, domain_rating_source, anchor,
  // is_dofollow, first_seen, url_to
  return items.slice(0, 20).map((b) => {
    let sourceDomain = "";
    try { sourceDomain = new URL(b.url_from).hostname.replace(/^www\./, ""); } catch {}
    return {
      sourceUrl: b.url_from ?? "",
      sourceDomain,
      anchor: b.anchor ?? null,
      domainAuthority: b.domain_rating_source ?? null,
      dofollow: b.is_dofollow ?? false,
      firstSeen: b.first_seen,
    };
  });
}

function mapTopPages(items: any[]) {
  // Ahrefs pages-by-backlinks columns: url, backlinks, refdomains
  return items.slice(0, 10).map((p) => ({ url: p.url ?? "", backlinks: p.backlinks ?? 0 }));
}

// Derive a rough geography distribution from referring-domain ccTLDs.
function deriveGeographies(refDoms: any[]) {
  const ccTLD: Record<string, string> = {
    ke: "Kenya", uk: "United Kingdom", us: "United States", ng: "Nigeria",
    za: "South Africa", de: "Germany", fr: "France", in: "India",
    ca: "Canada", au: "Australia", ae: "UAE",
  };
  const byCountry: Record<string, number> = {};
  for (const d of refDoms) {
    const host: string = d?.refdomain ?? "";
    const tld = host.split(".").pop()?.toLowerCase() ?? "";
    const country = ccTLD[tld] ?? (tld === "com" || tld === "org" || tld === "net" ? "Global" : "Other");
    byCountry[country] = (byCountry[country] ?? 0) + 1;
  }
  return Object.entries(byCountry)
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}
function mapAnchors(items: any[]) {
  return items.slice(0, 10).map((a) => ({ anchor: a.anchor ?? "", backlinks: a.backlinks ?? 0 }));
}
