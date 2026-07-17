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
import { fetchPageSignals, scrapingBeeConfigured } from "@/lib/seo/fetcher";
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
import { crawlSite } from "@/lib/crawl/crawler";
import { buildSiteIssues, scoreFromIssues } from "@/lib/crawl/issues";
import { findSiteAuditProject, ahrefsSiteAuditIssues } from "@/lib/providers/ahrefs-siteaudit";
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
  // Effective time budget. We HARD-CAP this so an audit can never run for many
  // minutes (which looks like "spinning"): internal audits get up to 3 min for a
  // thorough crawl, the public tool stays snappy at 90s. AUDIT_BUDGET_MS can only
  // lower these, not raise them past the cap.
  const BUDGET_MS = job.input.internal
    ? Math.min(Number(process.env.AUDIT_BUDGET_MS) || 180_000, 180_000)
    : Math.min(Number(process.env.AUDIT_BUDGET_MS) || 120_000, 120_000);
  const startedAt = Date.now();
  const remaining = () => Math.max(0, BUDGET_MS - (Date.now() - startedAt));

  const set = (stage: string, progress: number) =>
    updateJob(job.id, { status: "running", stage, progress });

  // Watchdog: guarantee the job ALWAYS reaches a terminal state, even if some
  // step hangs (e.g. a bot-protected site that stalls a fetch). Without this the
  // UI could spin forever. Fires HARD_CAP after start; cleared on normal finish.
  const HARD_CAP = BUDGET_MS + 15_000;
  let finished = false;
  const watchdog = setTimeout(() => {
    if (!finished) {
      updateJob(job.id, {
        status: "error",
        stage: "Timed out",
        error: "The audit took too long and was stopped. Please try again — some sites (e.g. bot-protected ones) can be slow to analyse.",
      }).catch(() => {});
    }
  }, HARD_CAP);

  try {
    // 1. Fetch + parse the page
    await set("Fetching and parsing your page", 8);
    const signals = await fetchPageSignals(url);
    console.log(`[audit] main page: url=${signals.finalUrl} status=${(signals as any).status ?? "?"} protected=${!!signals.protected} htmlLen=${signals.html?.length ?? 0} title="${(signals.title || "").slice(0, 60)}"`);
    if (!signals.html || signals.html.length < 500) {
      console.error(`[audit] MAIN PAGE NEARLY EMPTY (htmlLen=${signals.html?.length ?? 0}) — likely blocked/JS-shell. On-page checks + crawl will have little to work with.`);
    }

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

    // 5b. Kick off AI Visibility (DataForSEO) IN PARALLEL with the crawl. They are
    // independent, so running them together means AI visibility is never starved
    // by a slow crawl (the old bug where DataForSEO got skipped), and the audit
    // finishes in max(crawl, ai) time instead of the sum.
    const pageText = stripTags(signals.html).slice(0, 8000);
    const aiVisBudget = remaining() - 5_000;
    const aiPromise: Promise<any> =
      aiVisBudget > 8_000
        ? withTimeout(
            runAiVisibility(domain, country, pageText, (stage, p) =>
              updateJob(job.id, { stage, progress: 80 + Math.round(p * 0.2) })
            ),
            aiVisBudget
          ).catch(() => undefined)
        : Promise.resolve(undefined);

    // Multi-page crawl → clickable site issues (runs alongside AI visibility).
    let siteIssues: ReturnType<typeof buildSiteIssues> | undefined;
    let crawlMeta: any | undefined;
    let siteScore: { score: number; grade: string } | undefined;
    const crawlBudget = remaining() - 5_000; // AI runs in parallel; no reserve needed
    if (crawlBudget > 12_000) {
      await set("Crawling site & analysing pages", 66);
      try {
        // Hybrid: if this domain is a verified Ahrefs Site Audit project, use
        // Ahrefs' own crawl; otherwise crawl in-app.
        const project = await findSiteAuditProject(domain).catch(() => null);
        if (project) {
          const ahrefsIssues = await ahrefsSiteAuditIssues(project.projectId).catch(() => null);
          if (ahrefsIssues && ahrefsIssues.length) {
            siteIssues = ahrefsIssues;
            const sc = scoreFromIssues(siteIssues);
            siteScore = { score: sc.score, grade: sc.grade };
            crawlMeta = {
              source: "ahrefs-siteaudit", discovered: ahrefsIssues.length, crawled: 0,
              truncated: false, score: sc.score, grade: sc.grade,
              checkedCount: sc.checkedCount, notCheckedCount: sc.notCheckedCount,
            };
          }
        }
        if (!siteIssues) {
          // Decide how to crawl. ScrapingBee (stealth) can bypass Cloudflare/WAF
          // per page, but each page is a full browser render (~10-20s), so a big
          // protected site can't be fully crawled inside one request. When bypass
          // is enabled we therefore crawl a SMALL representative SAMPLE so the
          // audit always COMPLETES with real multi-page data instead of timing out.
          const proxyEnabled = process.env.CRAWL_VIA_SCRAPINGBEE === "true" && scrapingBeeConfigured();
          const useProxy = proxyEnabled && !!signals.protected;
          const proxyMode = (process.env.SCRAPINGBEE_PROXY_MODE as "premium" | "stealth") || "stealth";

          const baseMax = job.input.internal
            ? (Number(process.env.CRAWL_MAX_PAGES_INTERNAL) || 500)
            : (Number(process.env.CRAWL_MAX_PAGES) || 50);
          // When ScrapingBee may be used (any page could need slow stealth), cap
          // to a small sample so the run fits the time budget. Direct (unprotected)
          // sites keep the full page count.
          const sampleCap = job.input.internal
            ? (Number(process.env.PROXY_CRAWL_MAX_PAGES_INTERNAL) || 20)
            : (Number(process.env.PROXY_CRAWL_MAX_PAGES) || 10);
          const maxPages = proxyEnabled ? Math.min(baseMax, sampleCap) : baseMax;

          const crawl = await withTimeout(
            crawlSite(signals.finalUrl, {
              deadlineMs: crawlBudget,
              maxPages,
              proxy: useProxy ? proxyMode : "none",
              concurrency: useProxy ? 6 : 5,
            }),
            crawlBudget
          );
          siteIssues = buildSiteIssues(crawl.pages);
          const sc = scoreFromIssues(siteIssues);
          siteScore = { score: sc.score, grade: sc.grade };
          crawlMeta = {
            source: crawl.source, discovered: crawl.discovered, crawled: crawl.crawled,
            truncated: crawl.truncated, score: sc.score, grade: sc.grade,
            checkedCount: sc.checkedCount, notCheckedCount: sc.notCheckedCount,
          };
          console.log(`[audit] crawl done: proxy=${useProxy ? proxyMode : "none"} protected=${!!signals.protected} discovered=${crawl.discovered} crawled=${crawl.crawled} pages=${crawl.pages.length} issues=${siteIssues.length} score=${sc.score} checked=${sc.checkedCount} notChecked=${sc.notCheckedCount}`);
          if (crawl.pages.length === 0) {
            console.error(`[audit] CRAWL RETURNED 0 PAGES for ${signals.finalUrl} — no real issues will show. Likely blocked (Cloudflare/WAF) or all fetches failed. Check [scrapingbee]/[crawl] lines above.`);
          }
        }
      } catch (err: any) {
        // Was silently swallowed before — now surfaced so we can see WHY a crawl
        // produced no data (this is the usual cause of "no real results").
        console.error(`[audit] CRAWL FAILED for ${signals?.finalUrl}: ${err?.stack || err?.message || err}`);
      }
    } else {
      console.warn(`[audit] crawl SKIPPED — only ${crawlBudget}ms budget left (need >12000). AI/on-page still run.`);
    }

    // Reconcile the headline with the crawl. The on-page `overall` reflects only
    // the main page; if a site-wide crawl produced a score, blend it in so the
    // headline can't say "perfect" while the site issues list is full of problems.
    const gradeFor = (s: number) => (s >= 90 ? "A" : s >= 80 ? "B" : s >= 70 ? "C" : s >= 55 ? "D" : "F");
    const finalScore = siteScore
      ? Math.round(overall.score * 0.4 + siteScore.score * 0.6)
      : overall.score;
    const finalGrade = siteScore ? gradeFor(finalScore) : overall.grade;

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
        grade: finalGrade,
        score: finalScore,
        summary:
          finalScore >= 90 ? "Your site is in great shape"
          : finalScore >= 75 ? "Your site could be better"
          : "Your site needs attention",
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
      ...(siteIssues ? { siteIssues } : {}),
      ...(crawlMeta ? { crawlMeta } : {}),
    };

    await updateJob(job.id, { status: "running", stage: "Building AI Visibility report", progress: 80, report });

    // 6. Await the AI Visibility result that has been running in parallel with the crawl.
    const aiVisibility: any = await aiPromise;
    try {
      console.log(`[audit] ai-visibility: engine=${aiVisibility?.engine ?? "?"} present=${aiVisibility?.aiOverview?.present ?? "?"} prompts=${aiVisibility?.prompts?.length ?? aiVisibility?.answers?.length ?? 0} score=${aiVisibility?.score ?? "?"} brandMentions=${aiVisibility?.brandMentionCount ?? "?"}`);
    } catch { /* logging only */ }

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
  } finally {
    finished = true;
    clearTimeout(watchdog);
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
