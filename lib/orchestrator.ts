// lib/orchestrator.ts
// Runs the full audit pipeline and writes progress to the job store.

import type {
  AuditJob,
  AuditReport,
  KeywordRanking,
  Backlink,
  BacklinkSummary,
  KeywordOpportunity,
  LinkGapDomain,
  SocialProfile,
  SerpSnapshot,
  LocalBusinessProfile,
} from "@/types/audit";
import { updateJob } from "@/lib/store/jobs";
import { fetchPageSignals, scrapingBeeConfigured } from "@/lib/seo/fetcher";
import { captureScreenshot, scrapeSocialProfile, scrapingBeeGoogleSearch } from "@/lib/providers/scrapingbee-extras";
import {
  dataForSeoConfigured,
  googleOrganicSerp,
  googleAdsSearchVolume,
  googleBusinessProfile,
} from "@/lib/providers/dataforseo-ai";
import { pageSpeed } from "@/lib/providers/pagespeed";
import {
  domainRating,
  backlinksStats,
  topBacklinks,
  topAnchors,
  topPagesByBacklinks,
  referringDomains,
  organicKeywords,
  keywordOpportunities,
  organicCompetitors,
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
  const { url, country, language, targetKeyword, competitorUrl } = job.input;
  const loc = resolveLocation(country);
  const lang = resolveLanguage(language);
  const domain = domainOf(url);
  const manualCompetitorDomain = competitorUrl?.trim() ? domainOf(competitorUrl.trim()) : null;

  // Wall-clock budget so the job ALWAYS reaches a terminal state. Internal
  // audits (full crawl up to 500+ pages, Ahrefs Site Audit/Top Pages, keyword
  // opportunities, link gap, DataForSEO AI visibility) get up to 30 minutes —
  // slow but thorough is the goal there. The public tool stays snappy and is
  // hard-capped at 3 minutes. AUDIT_BUDGET_MS can only lower these, not raise
  // them past the cap.
  const BUDGET_MS = job.input.internal
    ? Math.min(Number(process.env.AUDIT_BUDGET_MS) || 1_800_000, 1_800_000)
    : Math.min(Number(process.env.AUDIT_BUDGET_MS) || 180_000, 180_000);
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

    // 2. PageSpeed (mobile + desktop) in parallel — free API. Screenshot +
    // social profile scraping (ScrapingBee) run alongside — all independent of
    // each other and of the Ahrefs calls that follow.
    await set("Measuring Core Web Vitals & PageSpeed", 22);
    const psTimeout = Math.min(20_000, Math.max(6_000, remaining() - 25_000));
    const socialTargets = Object.entries({
      Facebook: signals.social.facebook,
      "X (Twitter)": signals.social.twitter,
      Instagram: signals.social.instagram,
      LinkedIn: signals.social.linkedin,
      YouTube: signals.social.youtube,
    }).filter(([, u]) => !!u) as [SocialProfile["platform"], string][];

    const [mobile, desktop, screenshot, socialResults] = await Promise.all([
      pageSpeed(signals.finalUrl, "mobile", psTimeout).catch(() => emptyPSI("mobile")),
      pageSpeed(signals.finalUrl, "desktop", psTimeout).catch(() => emptyPSI("desktop")),
      captureScreenshot(signals.finalUrl, { protected: signals.protected }).catch(() => null),
      Promise.allSettled(
        socialTargets.map(([, url]) => scrapeSocialProfile(url))
      ),
    ]);

    const social: SocialProfile[] = socialTargets.map(([platform, url], i) => {
      const r = socialResults[i];
      const scraped = r.status === "fulfilled" ? r.value : { followers: null, engagement: null, handle: null, available: false };
      return { platform, url, ...scraped };
    });

    // 3. Ahrefs: keywords + backlinks + domain rating (parallel, resilient)
    await set("Pulling keyword rankings & backlinks", 42);
    const [kwRaw, drRaw, blStatsRaw, blTopRaw, anchorsRaw, pagesRaw, refDomainsRaw, kwOppRaw, competitorsRaw] =
      await Promise.allSettled([
        organicKeywords(domain, loc.countryCode),
        domainRating(domain),
        backlinksStats(domain),
        topBacklinks(domain),
        topAnchors(domain),
        topPagesByBacklinks(domain, job.input.internal ? 50 : 10),
        referringDomains(domain, job.input.internal ? 200 : 50),
        keywordOpportunities(domain, loc.countryCode),
        organicCompetitors(domain, loc.countryCode, 5),
      ]);

    const organic = mapKeywords(val(kwRaw, []));
    const paid: KeywordRanking[] = []; // paid keywords are a separate Ahrefs endpoint; omitted on Standard
    const dr = val(drRaw, { domainRating: null, ahrefsRank: null });
    const blStats = val(blStatsRaw, { totalBacklinks: null, referringDomains: null });
    const refDoms = val(refDomainsRaw, [] as any[]);
    const blSummary = mapBacklinkSummary(blStats, dr, refDoms);
    const topLinks = mapBacklinks(val(blTopRaw, []));
    const topPagesRaw = val(pagesRaw, [] as any[]);
    const opportunities = mapKeywordOpportunities(val(kwOppRaw, []));
    const autoCompetitors = val(competitorsRaw, [] as any[]);

    // 3b. Link gap: sites linking to a competitor but not to us. Prefer a
    // user-supplied competitor URL; otherwise use the strongest auto-detected
    // organic competitor (by shared keywords). Best-effort — an audit never
    // fails because this couldn't be computed.
    await set("Comparing your backlinks against a competitor", 48);
    const competitorDomain =
      manualCompetitorDomain ?? (autoCompetitors[0]?.competitor_domain as string | undefined) ?? null;
    const linkGap = await computeLinkGap(domain, competitorDomain, refDoms, job.input.internal);

    // 4. GEO analysis (Claude + web-search citation probe) — run in parallel
    // with the SERP snapshot and Business Profile lookup (both DataForSEO,
    // both independent of GEO/Claude).
    await set("Analysing Generative Engine Optimization (GEO)", 60);
    const probeQueries = organic.slice(0, 3).map((k) => k.keyword);
    if (probeQueries.length === 0 && targetKeyword) probeQueries.push(targetKeyword);
    if (probeQueries.length === 0) probeQueries.push(`best ${domain.split(".")[0]} services ${country}`);

    // Pick the keyword for the real Google SERP snapshot: the user's target
    // keyword first, else the top keyword opportunity, else the top organic
    // keyword, else the same generic fallback GEO uses.
    const serpKeyword =
      targetKeyword?.trim() ||
      opportunities[0]?.keyword ||
      organic[0]?.keyword ||
      probeQueries[0];

    // Best-effort business-name guess for the Google Business Profile lookup:
    // the part of the page <title> before a separator, else the domain stem.
    const businessNameGuess = (() => {
      const t = (signals.title ?? "").split(/[|\-–·]/)[0]?.trim();
      return t && t.length > 1 ? t : domain.split(".")[0];
    })();

    const dfsReady = dataForSeoConfigured() && !!loc.locationCode;

    const [geo, serpRawDfs, businessRaw] = await Promise.all([
      analyzeGeo(signals, domain, probeQueries),
      dfsReady
        ? withTimeout(googleOrganicSerp(serpKeyword, loc.locationCode!, lang.languageCode, domain), 20_000).catch(() => null)
        : Promise.resolve(null),
      dfsReady
        ? withTimeout(googleBusinessProfile(businessNameGuess, loc.locationCode!, lang.languageCode), 20_000).catch(() => null)
        : Promise.resolve(null),
    ]);

    // Fallback: if DataForSEO's SERP call failed or found nothing at all
    // (no organic results — not just "you're not ranking"), try ScrapingBee's
    // Google Search API before giving up on the SERP Snapshot entirely. Real
    // position + PAA either way; featured-snippet/knowledge-panel detection
    // stays DataForSEO-only (not a confirmed field on ScrapingBee's schema —
    // see lib/providers/scrapingbee-extras.ts).
    let serpRaw = serpRawDfs;
    if (!serpRaw || serpRaw.topResults.length === 0) {
      const sbSerp = await scrapingBeeGoogleSearch(serpKeyword, loc.countryCode, domain, lang.languageCode).catch(() => null);
      if (sbSerp && sbSerp.topResults.length > 0) {
        serpRaw = {
          yourPosition: sbSerp.yourPosition,
          hasFeaturedSnippet: false,
          featuredSnippetIsYours: false,
          hasPeopleAlsoAsk: sbSerp.hasPeopleAlsoAsk,
          hasKnowledgePanel: false,
          topResults: sbSerp.topResults,
        };
      }
    }

    // Real Google Ads search volume for that same keyword (separate endpoint;
    // fine to run right after since it's a single small call).
    const adsVolume = dfsReady
      ? await googleAdsSearchVolume([serpKeyword], loc.locationCode!).catch(() => [])
      : [];

    const serpSnapshot: SerpSnapshot | undefined = serpRaw
      ? {
          keyword: serpKeyword,
          searchVolume: adsVolume[0]?.searchVolume ?? null,
          cpc: adsVolume[0]?.cpc ?? null,
          yourPosition: serpRaw.yourPosition,
          hasFeaturedSnippet: serpRaw.hasFeaturedSnippet,
          featuredSnippetIsYours: serpRaw.featuredSnippetIsYours,
          hasPeopleAlsoAsk: serpRaw.hasPeopleAlsoAsk,
          hasKnowledgePanel: serpRaw.hasKnowledgePanel,
          topResults: serpRaw.topResults,
        }
      : undefined;

    // Local Business Profile — framed as an ISSUE when not found (not just an
    // empty section), per instruction. A miss here means "not found with this
    // business name at this location", not a certain "does not exist" — the
    // lookup has no street address to disambiguate, only a name + country.
    const localBusiness: LocalBusinessProfile = businessRaw
      ? businessRaw.found
        ? {
            checked: true, found: true,
            name: businessRaw.name, rating: businessRaw.rating,
            reviewCount: businessRaw.reviewCount, category: businessRaw.category,
          }
        : {
            checked: true, found: false,
            issue: {
              title: "No Google Business Profile found",
              recommendation: `Create or verify a Google Business Profile for ${businessNameGuess}.`,
              reason:
                "A Business Profile is often the single highest-leverage local SEO signal — it directly powers your presence in Google Maps and the local pack, and helps AI answer engines confirm you're a real, active local business.",
            },
          }
      : { checked: false, found: false };

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
          // per page, but each page is a full browser render (~10-20s). The
          // external tool's 3-minute budget only fits a small sample, so we
          // seed it with Ahrefs' top-pages-by-backlinks (fetched above) rather
          // than a blind sample — budget goes to the pages that actually carry
          // link equity/traffic first. The internal tool's 30-minute budget can
          // realistically fit a near-full 500-page stealth crawl, so its sample
          // cap is raised right up to the page ceiling instead of a small slice.
          const proxyEnabled = process.env.CRAWL_VIA_SCRAPINGBEE === "true" && scrapingBeeConfigured();
          const useProxy = proxyEnabled && !!signals.protected;
          const proxyMode = (process.env.SCRAPINGBEE_PROXY_MODE as "premium" | "stealth") || "stealth";

          const baseMax = job.input.internal
            ? (Number(process.env.CRAWL_MAX_PAGES_INTERNAL) || 500)
            : (Number(process.env.CRAWL_MAX_PAGES) || 50);
          const sampleCap = job.input.internal
            ? (Number(process.env.PROXY_CRAWL_MAX_PAGES_INTERNAL) || 500) // 30 min budget: aim for the full crawl
            : (Number(process.env.PROXY_CRAWL_MAX_PAGES) || 10);          // 3 min budget: small, seeded sample
          const maxPages = proxyEnabled ? Math.min(baseMax, sampleCap) : baseMax;
          const seedUrls = topPagesRaw.map((p: any) => p?.url).filter((u: any): u is string => !!u);

          const crawl = await withTimeout(
            crawlSite(signals.finalUrl, {
              deadlineMs: crawlBudget,
              maxPages,
              proxy: useProxy ? proxyMode : "none",
              concurrency: useProxy ? (job.input.internal ? 8 : 6) : 5,
              seedUrls,
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
        }
      } catch { /* crawl skipped; core report still completes */ }
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
        competitorUrl: competitorUrl?.trim() || undefined,
        screenshotDesktop: screenshot ?? undefined,
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
        opportunities,
      },
      backlinks: {
        summary: blSummary,
        top: topLinks,
        topPages: mapTopPages(topPagesRaw),
        topAnchors: mapAnchors(val(anchorsRaw, [])),
        geographies: deriveGeographies(refDoms),
        linkGap,
      },
      performance: { mobile, desktop },
      geo,
      social,
      serpSnapshot,
      localBusiness,
      ...(siteIssues ? { siteIssues } : {}),
      ...(crawlMeta ? { crawlMeta } : {}),
    };

    await updateJob(job.id, { status: "running", stage: "Building AI Visibility report", progress: 80, report });

    // 6. Await the AI Visibility result that has been running in parallel with the crawl.
    const aiVisibility: any = await aiPromise;

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

function mapKeywordOpportunities(items: any[]): KeywordOpportunity[] {
  return items
    .slice(0, 20)
    .map((it) => ({
      keyword: it?.keyword ?? "",
      position: it?.best_position ?? 0,
      searchVolume: it?.volume ?? null,
      difficulty: it?.keyword_difficulty ?? null,
      url: it?.best_position_url ?? undefined,
    }))
    .filter((k) => k.keyword);
}

// Sites linking to a competitor domain but not to the audited domain — a
// concrete outreach list, not just "you have fewer backlinks". Best-effort:
// any failure (no competitor found, Ahrefs call fails) returns an empty list
// rather than breaking the audit.
async function computeLinkGap(
  domain: string,
  competitorDomain: string | null,
  ourRefDomains: any[],
  internal?: boolean
): Promise<{ competitor: string | null; domains: LinkGapDomain[] }> {
  if (!competitorDomain || competitorDomain === domain) {
    return { competitor: competitorDomain, domains: [] };
  }
  try {
    const competitorRefDomains = await referringDomains(competitorDomain, internal ? 200 : 50);
    const ours = new Set(
      ourRefDomains.map((d: any) => String(d?.refdomain ?? "").toLowerCase()).filter(Boolean)
    );
    const gap = (competitorRefDomains as any[])
      .filter((d) => {
        const host = String(d?.refdomain ?? "").toLowerCase();
        return host && !ours.has(host);
      })
      .sort((a, b) => (b?.domain_rating ?? 0) - (a?.domain_rating ?? 0))
      .slice(0, 5)
      .map((d) => ({
        domain: String(d?.refdomain ?? ""),
        domainRating: d?.domain_rating ?? null,
        linksToCompetitor: competitorDomain,
      }));
    return { competitor: competitorDomain, domains: gap };
  } catch {
    return { competitor: competitorDomain, domains: [] };
  }
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
