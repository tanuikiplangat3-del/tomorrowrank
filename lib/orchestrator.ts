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
  GeoReport,
  ReadinessBreakdown,
  CompetitorComparison,
  ContentGapKeyword,
  TechnicalCrossCheck,
} from "@/types/audit";
import { updateJob } from "@/lib/store/jobs";
import { sheetsConfigured, pushAuditResultToSheet } from "@/lib/store/sheets";
import { fetchPageSignals, scrapingBeeConfigured, type PageSignals } from "@/lib/seo/fetcher";
import { claudeJSON, MODELS } from "@/lib/providers/llm";
import { captureScreenshot, scrapeSocialProfile, scrapingBeeGoogleSearch } from "@/lib/providers/scrapingbee-extras";
import {
  dataForSeoConfigured,
  googleOrganicSerp,
  googleAdsSearchVolume,
  googleBusinessProfile,
  bingOrganicSerp,
  yahooOrganicPosition,
  googleImagesPresence,
  googleMapsPresence,
  onPageInstantCheck,
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
import { analyzePage } from "@/lib/crawl/analyzer";
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

    const [mobile, desktop, screenshot, screenshotMobile, socialResults] = await Promise.all([
      pageSpeed(signals.finalUrl, "mobile", psTimeout).catch(() => emptyPSI("mobile")),
      pageSpeed(signals.finalUrl, "desktop", psTimeout).catch(() => emptyPSI("desktop")),
      captureScreenshot(signals.finalUrl, {
        protected: signals.protected,
        timeoutMs: job.input.internal ? 25_000 : 15_000,
        viewport: "desktop",
      }).catch(() => null),
      captureScreenshot(signals.finalUrl, {
        protected: signals.protected,
        timeoutMs: job.input.internal ? 25_000 : 15_000,
        viewport: "mobile",
      }).catch(() => null),
      Promise.allSettled(
        socialTargets.map(([, url]) => scrapeSocialProfile(url, { allowStealth: job.input.internal }))
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
    // organic competitor (by shared keywords). Kicked off here (not awaited
    // yet) so it runs IN PARALLEL with the GEO/SERP/business block below
    // instead of adding its own sequential delay first.
    const competitorDomain =
      manualCompetitorDomain ?? (autoCompetitors[0]?.competitor_domain as string | undefined) ?? null;
    const linkGapPromise = computeLinkGap(domain, competitorDomain, refDoms, job.input.internal);

    // Competitor comparison ("Your score" vs "Top competitor" vs "Industry
    // average" on the hero dashboard) — up to 2 REAL lite-audited domains
    // (manual competitor + top auto-detected, or top 2 auto-detected if none
    // was given), never a fabricated benchmark number. "Industry average"
    // only appears once 2+ real data points exist.
    const competitorDomainsToAudit = Array.from(
      new Set(
        [manualCompetitorDomain, autoCompetitors[0]?.competitor_domain, autoCompetitors[1]?.competitor_domain]
          .filter((d): d is string => !!d && d !== domain)
      )
    ).slice(0, 2);
    // These two are internal-tool only (see below): a competitor lite-audit
    // fetches a THIRD-PARTY domain we don't control the responsiveness of —
    // the single riskiest addition for the public tool's 3-minute budget,
    // since a slow/protected competitor site eats budget with no way to
    // predict it in advance. The public tool's hero simply won't show the
    // Industry Average / Top Competitor row; the internal tool (30-min
    // budget) can afford it.
    const competitorScoresPromise = job.input.internal
      ? Promise.all(competitorDomainsToAudit.map((d) => auditCompetitorLite(d, targetKeyword)))
      : Promise.resolve(competitorDomainsToAudit.map(() => null));

    // Content Gap: keywords the competitor ranks for that we don't rank for AT
    // ALL — distinct from Keyword Opportunities (our own near-misses) and
    // Link Gap (backlinks, not keywords). Reuses organicKeywords(), just
    // called against the competitor domain and diffed against our own set —
    // no new Ahrefs endpoint needed. Internal-only for the same budget reason
    // as above (one more parallel branch is cheap on its own, but Updates
    // 52-53 added several of these at once and their CUMULATIVE weight was
    // still too much for the public tool's budget on a real, heavy site).
    const contentGapPromise = job.input.internal && competitorDomain
      ? organicKeywords(competitorDomain, loc.countryCode, 50).catch(() => [])
      : Promise.resolve([] as any[]);

    // 4. GEO analysis (Claude + web-search citation probe) — run in parallel
    // with the SERP snapshot, real Google Ads volume, Business Profile
    // lookup, and the link gap above. All independent of each other.
    await set("Analysing Generative Engine Optimization (GEO)", 60);
    const probeQueries = organic.slice(0, 3).map((k) => k.keyword);
    if (probeQueries.length === 0 && targetKeyword) probeQueries.push(targetKeyword);
    if (probeQueries.length === 0) {
      probeQueries.push(await guessNicheQuery(signals, domain, country));
    }

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
    // Maps only makes sense as a signal when the site actually looks like a
    // local/physical business — reuse the same heuristic driving the Local
    // category checks rather than firing it for every SaaS/global brand.
    const looksLocal = !!signals.hasLocalBusinessSchema || (!!signals.hasAddress && !!signals.hasPhone);
    // Secondary SERP engines (Bing/Yahoo/Images/Maps) and the On-Page
    // cross-check are internal-tool only. Each one is individually
    // timeout-bounded, but Updates 52-53 added several of these plus the
    // competitor lite-audit and content gap all onto the SAME public-tool
    // budget, and the cumulative weight was still too much on a real,
    // protected e-commerce site (confirmed by a repeat "stopped responding"
    // failure after the individual per-call bounds were already in place).
    // Public tool: fast and reliable, core signals only. Internal tool: full
    // depth, 30-minute budget can afford all of it.
    const extrasEnabled = job.input.internal;

    const [
      geo, serpRawDfs, businessRaw, adsVolume, linkGap, competitorScoresRaw,
      contentGapRaw, bingRaw, yahooPosition, imagesPresence, mapsPresence, onPageRaw,
    ] = await Promise.all([
      analyzeGeo(signals, domain, probeQueries),
      dfsReady
        ? withTimeout(googleOrganicSerp(serpKeyword, loc.locationCode!, lang.languageCode, domain), 15_000).catch(() => null)
        : Promise.resolve(null),
      dfsReady
        ? withTimeout(googleBusinessProfile(businessNameGuess, loc.locationCode!, lang.languageCode), 15_000).catch(() => null)
        : Promise.resolve(null),
      dfsReady
        ? withTimeout(googleAdsSearchVolume([serpKeyword], loc.locationCode!), 12_000).catch(() => [])
        : Promise.resolve([]),
      withTimeout(linkGapPromise, 15_000).catch(() => ({ competitor: competitorDomain, domains: [] })),
      withTimeout(competitorScoresPromise, 22_000).catch(() => competitorDomainsToAudit.map(() => null)),
      withTimeout(contentGapPromise, 15_000).catch(() => []),
      dfsReady && extrasEnabled
        ? withTimeout(bingOrganicSerp(serpKeyword, loc.locationCode!, lang.languageCode, domain), 15_000).catch(() => null)
        : Promise.resolve(null),
      dfsReady && extrasEnabled
        ? withTimeout(yahooOrganicPosition(serpKeyword, loc.locationCode!, lang.languageCode, domain), 15_000).catch(() => null)
        : Promise.resolve(null),
      dfsReady && extrasEnabled
        ? withTimeout(googleImagesPresence(domain.split(".")[0], loc.locationCode!, lang.languageCode, domain), 15_000).catch(() => undefined)
        : Promise.resolve(undefined),
      dfsReady && extrasEnabled && looksLocal
        ? withTimeout(googleMapsPresence(businessNameGuess, loc.locationCode!, lang.languageCode, businessNameGuess), 15_000).catch(() => undefined)
        : Promise.resolve(undefined),
      dataForSeoConfigured() && extrasEnabled
        ? withTimeout(onPageInstantCheck(signals.finalUrl), 20_000).catch(() => null)
        : Promise.resolve(null),
    ]);

    // Fallback: if DataForSEO's SERP call failed or found nothing at all
    // (no organic results — not just "you're not ranking"), try ScrapingBee's
    // Google Search API before giving up on the SERP Snapshot entirely. Real
    // position + PAA either way; featured-snippet/knowledge-panel detection
    // stays DataForSEO-only (not a confirmed field on ScrapingBee's schema —
    // see lib/providers/scrapingbee-extras.ts).
    let serpRaw = serpRawDfs;
    if ((!serpRaw || serpRaw.topResults.length === 0) && remaining() > 25_000) {
      const sbSerp = await withTimeout(
        scrapingBeeGoogleSearch(serpKeyword, loc.countryCode, domain, lang.languageCode),
        15_000
      ).catch(() => null);
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

    // When DataForSEO's real Ads volume isn't available (disabled, or the
    // call failed), fall back to Ahrefs' own volume figure for this keyword
    // if we happen to have it (already fetched for organic/opportunities) —
    // a modelled estimate rather than literal Ads data, but real and
    // relevant rather than just showing nothing.
    const ahrefsVolumeForKeyword =
      organic.find((k) => k.keyword.toLowerCase() === serpKeyword.toLowerCase())?.searchVolume ??
      opportunities.find((k) => k.keyword.toLowerCase() === serpKeyword.toLowerCase())?.searchVolume ??
      null;

    const serpSnapshot: SerpSnapshot | undefined = serpRaw
      ? {
          keyword: serpKeyword,
          searchVolume: adsVolume[0]?.searchVolume ?? ahrefsVolumeForKeyword,
          cpc: adsVolume[0]?.cpc ?? null,
          yourPosition: serpRaw.yourPosition,
          hasFeaturedSnippet: serpRaw.hasFeaturedSnippet,
          featuredSnippetIsYours: serpRaw.featuredSnippetIsYours,
          hasPeopleAlsoAsk: serpRaw.hasPeopleAlsoAsk,
          hasKnowledgePanel: serpRaw.hasKnowledgePanel,
          topResults: serpRaw.topResults,
          bingPosition: bingRaw?.yourPosition ?? null,
          yahooPosition: yahooPosition ?? null,
          imagesPresence,
          mapsPresence,
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

    // Content Gap: keywords the competitor ranks for that WE don't rank for at
    // all. Diffed client-side against our own organic-keywords set — no new
    // Ahrefs endpoint, just a second call to organicKeywords() for the
    // competitor domain (already fetched above, in parallel with everything else).
    const ourKeywordSet = new Set(organic.map((k) => k.keyword.toLowerCase()));
    const contentGap: ContentGapKeyword[] = competitorDomain
      ? (contentGapRaw as any[])
          .filter((it) => it?.keyword && !ourKeywordSet.has(String(it.keyword).toLowerCase()))
          .sort((a, b) => (b?.volume ?? 0) - (a?.volume ?? 0))
          .slice(0, 15)
          .map((it) => ({
            keyword: it.keyword,
            searchVolume: it.volume ?? null,
            competitorPosition: it.best_position ?? 0,
            competitorDomain,
          }))
      : [];

    // Technical cross-check: compare our own crawler's homepage read against
    // DataForSEO On-Page API's independent read of the same page. Any
    // disagreement is surfaced, not silently resolved — see Update 51.
    const technicalCrossCheck: TechnicalCrossCheck | undefined = onPageRaw
      ? {
          checked: true,
          fields: [
            {
              field: "title",
              ours: signals.title ?? "(none)",
              dataForSeo: onPageRaw.title ?? "(none)",
              agrees: (signals.title ?? "").trim() === (onPageRaw.title ?? "").trim(),
            },
            {
              field: "metaDescription",
              ours: signals.metaDescription ?? "(none)",
              dataForSeo: onPageRaw.metaDescription ?? "(none)",
              agrees: (signals.metaDescription ?? "").trim() === (onPageRaw.metaDescription ?? "").trim(),
            },
            {
              field: "canonical",
              ours: signals.canonical ?? "(none)",
              dataForSeo: onPageRaw.canonical ?? "(none)",
              agrees: (signals.canonical ?? "").trim() === (onPageRaw.canonical ?? "").trim(),
            },
            {
              field: "h1Count",
              ours: String(signals.h1?.length ?? 0),
              dataForSeo: String(onPageRaw.h1Count),
              agrees: (signals.h1?.length ?? 0) === onPageRaw.h1Count,
            },
          ],
        }
      : { checked: false, fields: [] };

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
    const readiness = computeReadiness(categories);

    const competitorScores: CompetitorComparison["topCompetitor"][] = competitorDomainsToAudit.map((d, i) => {
      const score = competitorScoresRaw[i];
      return score != null ? { domain: d, overall: score } : null;
    });
    const realCompetitorScores = competitorScores.filter((c): c is { domain: string; overall: number } => !!c);
    const competitorComparison: CompetitorComparison | undefined = realCompetitorScores.length
      ? {
          yourScore: overall.score,
          topCompetitor: realCompetitorScores.reduce((a, b) => (b.overall > a.overall ? b : a)),
          industryAverage:
            realCompetitorScores.length >= 2
              ? Math.round(realCompetitorScores.reduce((s, c) => s + c.overall, 0) / realCompetitorScores.length)
              : null,
        }
      : undefined;

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

    // GUARANTEE: the Technical SEO Audit / drill-down section must never
    // silently disappear just because the full multi-page crawl was skipped
    // (budget too tight) or failed (network/proxy error) — both are caught
    // above and previously left `siteIssues` undefined with no fallback,
    // which meant the crawl-based section could vanish even while the
    // single-page "Issues Found" checks above it still showed failures.
    // Falling back to a single-page analysis of the homepage (data we already
    // have in hand — `signals` — no extra fetch) means there's always at
    // least one real, verifiable page in the drill-down.
    if (!siteIssues) {
      try {
        const homePage = analyzePage(signals.finalUrl, 200, signals.html);
        siteIssues = buildSiteIssues([homePage]);
        const sc = scoreFromIssues(siteIssues);
        siteScore = { score: sc.score, grade: sc.grade };
        crawlMeta = {
          source: "homepage-only", discovered: 1, crawled: 1,
          truncated: true, score: sc.score, grade: sc.grade,
          checkedCount: sc.checkedCount, notCheckedCount: sc.notCheckedCount,
        };
      } catch { /* even this failed — genuinely nothing to show, leave undefined */ }
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
        pageTitle: signals.title ?? undefined,
        country,
        countryCode: loc.countryCode,
        language,
        languageCode: lang.languageCode,
        targetKeyword,
        competitorUrl: competitorUrl?.trim() || undefined,
        screenshotDesktop: screenshot ?? undefined,
        screenshotMobile: screenshotMobile ?? undefined,
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
        contentGap,
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
      technicalCrossCheck,
      readiness,
      competitorComparison,
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

    // Log the score to the "Audit Results" sheet — ONLY for audits tied to an
    // actual captured lead (never abandoned/anonymous runs), and only the
    // score fields, nothing else. Best-effort: a Sheets failure never affects
    // the audit itself, which has already completed and been saved above.
    if (job.input.leadId && sheetsConfigured()) {
      pushAuditResultToSheet({
        leadId: job.input.leadId,
        domain,
        overall: readiness.overall,
        technical: readiness.technical,
        content: readiness.content,
        aiVisibility: readiness.aiVisibility,
        auditedAt: new Date().toISOString(),
      }).catch(() => { /* best-effort — already logged inside pushAuditResultToSheet */ });
    }
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

// When a domain has no Ahrefs keyword history at all (new domain, or was
// hitting the date bug fixed in Update 54) AND no target keyword was given,
// the old fallback was a generic, unnatural template
// ("best {domain-stem} services {country}") that real buyers never actually
// search — e.g. "best kuda services Nigeria" instead of "best banking app in
// Nigeria". This asks Claude to infer the actual category from the homepage
// and produce ONE natural query real buyers would type. Best-effort: any
// failure falls back to the old template rather than blocking the audit.
async function guessNicheQuery(signals: PageSignals, domain: string, country: string): Promise<string> {
  const fallback = `best ${domain.split(".")[0]} services ${country}`;
  try {
    const text = signals.html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 3000);
    const result = await claudeJSON<{ query: string }>({
      model: MODELS.fast,
      system: "You identify what category of business a website is, then write ONE short, natural Google search query a real person in that market would type to find the best option in that category — not a template with the brand name jammed in.",
      prompt: `Domain: ${domain}\nCountry: ${country}\nHomepage text: """${text}"""\n\nReturn JSON: {"query": "<a short, natural query like 'best banking app in Nigeria' or 'top project management software', appropriate to this business's actual category and country>"}`,
      maxTokens: 150,
      timeoutMs: 10_000,
    });
    return result.query?.trim() || fallback;
  } catch {
    return fallback;
  }
}

function computeReadiness(categories: { category: string; score: number }[]): ReadinessBreakdown {
  const avg = (names: string[]) => {
    const scores = categories.filter((c) => names.includes(c.category)).map((c) => c.score);
    return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  };
  const technical = avg(["Usability", "Performance", "Other"]);
  const content = avg(["On-Page SEO", "Social", "Local"]);
  const aiVisibility = avg(["GEO", "Links"]);
  const overall = Math.round((technical + content + aiVisibility) / 3);

  const grade = (n: number) => (n >= 85 ? "excellent" : n >= 70 ? "good" : n >= 50 ? "fair" : "weak");
  const weakest = [
    { label: "technical foundations", score: technical },
    { label: "on-page content", score: content },
    { label: "AI visibility", score: aiVisibility },
  ].sort((a, b) => a.score - b.score)[0];
  const summary =
    `Averaging ${grade(overall)} technical, content, and AI-visibility readiness. ` +
    `${weakest.label} is the biggest opportunity right now, at ${weakest.score}/100.`;

  return { technical, content, aiVisibility, overall, summary };
}

// Fast, single-page comparison score for a competitor domain — no crawl, no
// independent PageSpeed/GEO calls (would double the cost/time of every audit
// that has a competitor). Real on-page/technical checks only, so the score is
// genuinely computed, not fabricated — just a lighter-weight comparison than
// the full audit given to the primary domain.
async function auditCompetitorLite(url: string, targetKeyword?: string): Promise<number | null> {
  try {
    const signals = await withTimeout(fetchPageSignals(url), 20_000);
    if (!signals) return null;
    const stubPerf = { mobile: emptyPSI("mobile"), desktop: emptyPSI("desktop") };
    const stubGeo: GeoReport = {
      llmReadableScore: 50, renderedContentRatio: 50, hasLlmsTxt: false,
      hasIdentitySchema: false, hasOrganizationSchema: false, authoritySignals: [],
      aiOverviewCitations: [], googleAiSearchPresence: false,
    };
    const checks = runChecks(signals, stubPerf, stubGeo, targetKeyword);
    const categories = scoreCategories(checks);
    return overallScore(categories).score;
  } catch {
    return null;
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
