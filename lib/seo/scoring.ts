// lib/seo/scoring.ts
import type {
  CheckResult,
  Category,
  CategoryScore,
  Grade,
  Recommendation,
  Priority,
  PageSpeedReport,
} from "@/types/audit";
import type { PageSignals } from "./fetcher";
import type { GeoReport } from "@/types/audit";

// ---- grade helpers ----
export function scoreToGrade(score: number): Grade {
  if (score >= 97) return "A+";
  if (score >= 93) return "A";
  if (score >= 90) return "A-";
  if (score >= 87) return "B+";
  if (score >= 83) return "B";
  if (score >= 80) return "B-";
  if (score >= 77) return "C+";
  if (score >= 73) return "C";
  if (score >= 70) return "C-";
  if (score >= 67) return "D+";
  if (score >= 63) return "D";
  if (score >= 60) return "D-";
  return "F";
}

function statusScore(s: CheckResult["status"]): number {
  switch (s) {
    case "pass": return 1;
    case "warn": return 0.5;
    case "info": return 1; // informational, not penalised
    case "fail": return 0;
  }
}

// Build a check helper
function mk(
  id: string,
  label: string,
  category: Category,
  status: CheckResult["status"],
  opts: Partial<CheckResult> = {}
): CheckResult {
  return { id, label, category, status, weight: opts.weight ?? 1, ...opts };
}

// Map check status -> recommendation priority
function priorityFor(status: CheckResult["status"], weight: number): Priority {
  if (status === "pass" || status === "info") return "pass";
  if (status === "fail" && weight >= 3) return "high";
  if (status === "fail") return "medium";
  return "low"; // warn
}

/**
 * Run the full check battery. `geo` and `perf` are passed in because they come
 * from async providers; everything else derives from the parsed PageSignals.
 */
export function runChecks(
  s: PageSignals,
  perf: { mobile: PageSpeedReport; desktop: PageSpeedReport },
  geo: GeoReport,
  targetKeyword?: string
): CheckResult[] {
  const checks: CheckResult[] = [];
  const kw = targetKeyword?.toLowerCase().trim();
  const inText = (t: string | null | undefined) =>
    !!kw && !!t && t.toLowerCase().includes(kw);

  // ---------- ON-PAGE SEO ----------
  const titleLen = s.title?.length ?? 0;
  checks.push(
    mk("title-tag", "Title Tag", "On-Page SEO",
      s.title ? (titleLen >= 30 && titleLen <= 60 ? "pass" : "warn") : "fail",
      {
        weight: 3, value: s.title ?? "missing",
        detail: s.title ? `${titleLen} characters` : "No <title> found",
        recommendation: !s.title
          ? "Add a descriptive <title> tag (30–60 characters)."
          : titleLen < 30 ? "Increase length of title tag toward 50–60 characters."
          : titleLen > 60 ? "Shorten the title tag to under 60 characters to avoid truncation." : undefined,
      })
  );
  if (kw)
    checks.push(
      mk("kw-title", "Target Keyword in Title Tag", "On-Page SEO",
        inText(s.title) ? "pass" : "fail",
        { weight: 2, recommendation: inText(s.title) ? undefined : `Include "${targetKeyword}" in the title tag.` })
    );

  const descLen = s.metaDescription?.length ?? 0;
  checks.push(
    mk("meta-description", "Meta Description Tag", "On-Page SEO",
      s.metaDescription ? (descLen >= 70 && descLen <= 160 ? "pass" : "warn") : "fail",
      {
        weight: 2, value: s.metaDescription ?? "missing",
        detail: s.metaDescription ? `${descLen} characters` : "No meta description",
        recommendation: !s.metaDescription
          ? "Add a meta description (70–160 characters)."
          : descLen > 160 ? "Trim the meta description to under 160 characters." : undefined,
      })
  );
  if (kw)
    checks.push(
      mk("kw-meta", "Target Keyword in Meta Description", "On-Page SEO",
        inText(s.metaDescription) ? "pass" : "warn",
        { weight: 1, recommendation: inText(s.metaDescription) ? undefined : `Add "${targetKeyword}" to the meta description.` })
    );

  // H1
  checks.push(
    mk("h1", "H1 Header Tag Usage", "On-Page SEO",
      s.h1.length === 1 ? "pass" : s.h1.length === 0 ? "fail" : "warn",
      {
        weight: 3, value: s.h1.length,
        detail: `${s.h1.length} H1 tag(s)`,
        recommendation: s.h1.length === 0 ? "Add a single H1 describing the page."
          : s.h1.length > 1 ? "Use exactly one H1 per page." : undefined,
      })
  );
  if (kw)
    checks.push(
      mk("kw-h1", "Target Keyword in H1", "On-Page SEO",
        s.h1.some((h) => h.toLowerCase().includes(kw)) ? "pass" : "warn",
        { weight: 1, recommendation: s.h1.some((h) => h.toLowerCase().includes(kw)) ? undefined : `Include "${targetKeyword}" in the H1.` })
    );

  const subHeads = s.headings.h2 + s.headings.h3 + s.headings.h4;
  checks.push(
    mk("subheadings", "H2–H6 Header Tag Usage", "On-Page SEO",
      subHeads >= 2 ? "pass" : "warn",
      { weight: 1, value: subHeads, detail: `${s.headings.h2} H2, ${s.headings.h3} H3`,
        recommendation: subHeads >= 2 ? undefined : "Use subheadings (H2–H3) to structure content." })
  );

  checks.push(
    mk("content-amount", "Amount of Content", "On-Page SEO",
      s.wordCount >= 600 ? "pass" : s.wordCount >= 250 ? "warn" : "fail",
      { weight: 2, value: s.wordCount, detail: `${s.wordCount} words`,
        recommendation: s.wordCount < 600 ? "Increase page text content to better cover the topic." : undefined })
  );

  const altRatio = s.images.total ? s.images.withAlt / s.images.total : 1;
  checks.push(
    mk("image-alt", "Image Alt Attributes", "On-Page SEO",
      s.images.total === 0 ? "info" : altRatio >= 0.9 ? "pass" : altRatio >= 0.5 ? "warn" : "fail",
      { weight: 1, value: `${s.images.withAlt}/${s.images.total}`,
        detail: `${Math.round(altRatio * 100)}% of images have alt text`,
        recommendation: altRatio < 0.9 ? "Add alt attributes to all images." : undefined })
  );

  checks.push(
    mk("canonical", "Canonical Tag", "On-Page SEO",
      s.canonical ? "pass" : "warn",
      { weight: 1, value: s.canonical ?? "missing",
        recommendation: s.canonical ? undefined : "Add a canonical tag to prevent duplicate-content issues." })
  );

  const noindex = /noindex/i.test(s.robotsMeta ?? "");
  checks.push(
    mk("noindex", "Noindex Tag Test", "On-Page SEO",
      noindex ? "fail" : "pass",
      { weight: 3, value: noindex ? "noindex present" : "indexable",
        recommendation: noindex ? "Remove the noindex directive so the page can rank." : undefined })
  );

  checks.push(
    mk("keyword-consistency", "Keyword Consistency", "On-Page SEO",
      kw ? (inText(s.title) && s.h1.some((h) => h.toLowerCase().includes(kw)) ? "pass" : "warn") : "info",
      { weight: 1, detail: kw ? "Checks keyword across title, H1 and body" : "No target keyword supplied",
        recommendation: kw && !(inText(s.title) && s.h1.some((h) => h.toLowerCase().includes(kw)))
          ? "Use your main keywords across the important HTML tags." : undefined })
  );

  // ---------- USABILITY ----------
  checks.push(mk("ssl", "SSL Enabled", "Usability", s.ssl ? "pass" : "fail",
    { weight: 3, recommendation: s.ssl ? undefined : "Enable HTTPS/SSL on the site." }));
  checks.push(mk("https-redirect", "HTTPS Redirect", "Usability", s.ssl ? "pass" : "fail",
    { weight: 2, recommendation: s.ssl ? undefined : "Force-redirect HTTP traffic to HTTPS." }));
  checks.push(mk("viewport", "Use of Mobile Viewports", "Usability", s.hasViewport ? "pass" : "fail",
    { weight: 2, recommendation: s.hasViewport ? undefined : "Add a responsive viewport meta tag." }));
  checks.push(mk("favicon", "Favicon", "Usability", s.hasFavicon ? "pass" : "warn",
    { weight: 1, recommendation: s.hasFavicon ? undefined : "Add a favicon." }));
  checks.push(mk("flash", "Flash Used?", "Usability", s.hasFlash ? "fail" : "pass",
    { weight: 1, recommendation: s.hasFlash ? "Remove deprecated Flash content." : undefined }));
  checks.push(mk("iframes", "iFrames Used?", "Usability", s.iframeCount > 3 ? "warn" : "pass",
    { weight: 1, value: s.iframeCount, recommendation: s.iframeCount > 3 ? "Reduce reliance on iframes." : undefined }));

  // Core Web Vitals + PageSpeed
  const cwv = perf.mobile.passesCoreWebVitals;
  checks.push(mk("core-web-vitals", "Google's Core Web Vitals", "Usability",
    cwv === true ? "pass" : cwv === false ? "fail" : "info",
    { weight: 3, detail: `LCP ${perf.mobile.lcp ?? "?"}s · CLS ${perf.mobile.cls ?? "?"} · INP ${perf.mobile.inp ?? "?"}ms`,
      recommendation: cwv === false ? "Optimize for Core Web Vitals (LCP, CLS, INP)." : undefined }));
  checks.push(mk("psi-mobile", "PageSpeed Insights — Mobile", "Usability",
    (perf.mobile.performanceScore ?? 0) >= 90 ? "pass" : (perf.mobile.performanceScore ?? 0) >= 50 ? "warn" : "fail",
    { weight: 2, value: perf.mobile.performanceScore,
      recommendation: (perf.mobile.performanceScore ?? 0) < 90 ? "Optimize for Mobile PageSpeed Insights." : undefined }));
  checks.push(mk("psi-desktop", "PageSpeed Insights — Desktop", "Usability",
    (perf.desktop.performanceScore ?? 0) >= 90 ? "pass" : (perf.desktop.performanceScore ?? 0) >= 50 ? "warn" : "fail",
    { weight: 1, value: perf.desktop.performanceScore,
      recommendation: (perf.desktop.performanceScore ?? 0) < 90 ? "Optimize for Desktop PageSpeed Insights." : undefined }));

  // ---------- PERFORMANCE ----------
  const bytes = perf.mobile.totalBytes ?? 0;
  checks.push(mk("download-size", "Website Download Size", "Performance",
    bytes === 0 ? "info" : bytes < 2_000_000 ? "pass" : bytes < 4_000_000 ? "warn" : "fail",
    { weight: 2, value: bytes ? `${(bytes / 1_000_000).toFixed(1)} MB` : "n/a",
      recommendation: bytes >= 2_000_000 ? "Reduce total page download size." : undefined }));
  checks.push(mk("load-speed", "Website Load Speed", "Performance",
    (perf.mobile.lcp ?? 99) <= 2.5 ? "pass" : (perf.mobile.lcp ?? 99) <= 4 ? "warn" : "fail",
    { weight: 2, value: perf.mobile.lcp ? `${perf.mobile.lcp}s LCP` : "n/a",
      recommendation: (perf.mobile.lcp ?? 99) > 2.5 ? "Improve load speed (target LCP ≤ 2.5s)." : undefined }));
  checks.push(mk("compression", "Compression Usage (Gzip/Brotli)", "Performance",
    s.compression ? "pass" : "warn",
    { weight: 1, value: s.compression ?? "none",
      recommendation: s.compression ? undefined : "Enable Gzip/Brotli compression." }));
  checks.push(mk("inline-styles", "Inline Styles", "Performance",
    s.inlineStyleCount > 20 ? "warn" : "pass",
    { weight: 1, value: s.inlineStyleCount,
      recommendation: s.inlineStyleCount > 20 ? "Remove inline styles; move CSS to stylesheets." : undefined }));
  checks.push(mk("http2", "HTTP/2 Usage", "Performance", s.http2 ? "pass" : "warn",
    { weight: 1, recommendation: s.http2 ? undefined : "Serve resources over HTTP/2 or HTTP/3." }));
  checks.push(mk("amp", "Accelerated Mobile Pages (AMP)", "Performance", "info",
    { weight: 0, value: s.hasAmp ? "present" : "not used", detail: "AMP is optional and largely deprecated." }));

  // ---------- GEO ----------
  checks.push(mk("rendered-content", "Rendered Content (LLM Readability)", "GEO",
    (geo.renderedContentRatio ?? 0) >= 70 ? "pass" : (geo.renderedContentRatio ?? 0) >= 40 ? "warn" : "fail",
    { weight: 3, value: geo.renderedContentRatio != null ? `${geo.renderedContentRatio}%` : "n/a",
      detail: "Share of content available without JavaScript",
      recommendation: (geo.renderedContentRatio ?? 0) < 70 ? "Server-render key content so LLMs can read it (reduce JS-only rendering)." : undefined }));
  checks.push(mk("llms-txt", "Llms.txt", "GEO", geo.hasLlmsTxt ? "pass" : "warn",
    { weight: 1, recommendation: geo.hasLlmsTxt ? undefined : "Add an llms.txt file to guide AI crawlers." }));
  checks.push(mk("identity-schema", "Identity Schema", "GEO", geo.hasIdentitySchema ? "pass" : "warn",
    { weight: 2, recommendation: geo.hasIdentitySchema ? undefined : "Add Organization/Brand schema to establish identity for LLMs." }));
  checks.push(mk("structured-data", "Schema.org Structured Data", "GEO",
    s.jsonLdTypes.length > 0 ? "pass" : "warn",
    { weight: 2, value: s.jsonLdTypes.join(", ") || "none",
      recommendation: s.jsonLdTypes.length ? undefined : "Add Schema.org structured data." }));
  checks.push(mk("ai-citations", "Top AI Overview Citations", "GEO",
    geo.aiOverviewCitations.some((c) => c.cited) ? "pass" : "warn",
    { weight: 2, detail: `${geo.aiOverviewCitations.filter((c) => c.cited).length} of ${geo.aiOverviewCitations.length} probed queries cite you`,
      recommendation: geo.aiOverviewCitations.some((c) => c.cited) ? undefined : "Earn citations in Google AI Overviews by creating authoritative, well-structured content." }));
  checks.push(mk("ai-search-presence", "Google AI Search Presence", "GEO",
    geo.googleAiSearchPresence ? "pass" : "warn",
    { weight: 1, recommendation: geo.googleAiSearchPresence ? undefined : "Build presence in Google's AI Search results." }));

  // ---------- LINKS / OFF-PAGE ----------
  checks.push(mk("on-page-links", "On-Page Links", "Links",
    s.internalLinks + s.externalLinks > 0 ? "pass" : "warn",
    { weight: 1, value: `${s.internalLinks} internal · ${s.externalLinks} external` }));
  checks.push(mk("friendly-links", "Friendly Links", "Links",
    /[?&=]{2,}/.test(s.finalUrl) ? "warn" : "pass",
    { weight: 1, recommendation: /[?&=]{2,}/.test(s.finalUrl) ? "Use clean, readable URLs." : undefined }));
  // Backlink-derived checks are appended later in the runner (need API data).

  // ---------- ANALYTICS / OTHER ----------
  checks.push(mk("analytics", "Analytics", "Other", s.hasGoogleAnalytics ? "pass" : "warn",
    { weight: 1, recommendation: s.hasGoogleAnalytics ? undefined : "Install web analytics (e.g. GA4)." }));
  checks.push(mk("robots-txt", "Robots.txt", "Other", s.robotsTxt.exists ? "pass" : "warn",
    { weight: 1, recommendation: s.robotsTxt.exists ? undefined : "Add a robots.txt file." }));
  checks.push(mk("blocked-robots", "Blocked by Robots.txt", "Other", s.robotsTxt.blocksAll ? "fail" : "pass",
    { weight: 3, recommendation: s.robotsTxt.blocksAll ? "Your robots.txt blocks all crawlers — remove the global Disallow." : undefined }));
  checks.push(mk("sitemap", "XML Sitemap", "Other", s.sitemap ? "pass" : "warn",
    { weight: 1, recommendation: s.sitemap ? undefined : "Publish an XML sitemap." }));
  checks.push(mk("hreflang", "Hreflang Usage", "Other", s.hreflang.length ? "pass" : "info",
    { weight: 0, value: s.hreflang.join(", ") || "none" }));
  checks.push(mk("language", "Language", "Other", s.lang ? "pass" : "warn",
    { weight: 1, value: s.lang ?? "not set", recommendation: s.lang ? undefined : "Set the <html lang> attribute." }));

  // ---------- SOCIAL ----------
  checks.push(mk("facebook", "Facebook Page Linked", "Social", s.social.facebook ? "pass" : "low" as any,
    { weight: 1, status: s.social.facebook ? "pass" : "warn", recommendation: s.social.facebook ? undefined : "Link your Facebook page." }));
  checks.push(mk("og-tags", "Facebook Open Graph Tags", "Social", s.ogTags > 0 ? "pass" : "warn",
    { weight: 1, value: s.ogTags, recommendation: s.ogTags ? undefined : "Add Open Graph tags for rich social previews." }));
  checks.push(mk("fb-pixel", "Facebook Pixel", "Social", s.hasFacebookPixel ? "pass" : "warn",
    { weight: 1, recommendation: s.hasFacebookPixel ? undefined : "Install a Facebook Pixel for remarketing." }));
  checks.push(mk("twitter", "X (Twitter) Account Linked", "Social", s.social.twitter ? "pass" : "warn",
    { weight: 1, recommendation: s.social.twitter ? undefined : "Create and link your X profile." }));
  checks.push(mk("twitter-cards", "X Cards", "Social", s.twitterCards > 0 ? "pass" : "warn",
    { weight: 1, recommendation: s.twitterCards ? undefined : "Add Twitter Card meta tags." }));
  checks.push(mk("instagram", "Instagram Linked", "Social", s.social.instagram ? "pass" : "warn",
    { weight: 1, recommendation: s.social.instagram ? undefined : "Link your Instagram profile." }));
  checks.push(mk("youtube", "YouTube Channel Linked", "Social", s.social.youtube ? "pass" : "warn",
    { weight: 1, recommendation: s.social.youtube ? undefined : "Create and link an associated YouTube channel." }));
  checks.push(mk("linkedin", "LinkedIn Page Linked", "Social", s.social.linkedin ? "pass" : "warn",
    { weight: 1, recommendation: s.social.linkedin ? undefined : "Link your LinkedIn page." }));

  // ---------- LOCAL ----------
  checks.push(mk("address-phone", "Address & Phone Shown on Website", "Local",
    s.hasPhone && s.hasAddress ? "pass" : "warn",
    { weight: 1, recommendation: s.hasPhone && s.hasAddress ? undefined : "Add business address and phone number to the site." }));
  checks.push(mk("local-schema", "Local Business Schema", "Local", s.hasLocalBusinessSchema ? "pass" : "warn",
    { weight: 1, recommendation: s.hasLocalBusinessSchema ? undefined : "Add LocalBusiness schema." }));

  // assign priorities
  for (const c of checks) {
    if (!c.priority) c.priority = priorityFor(c.status, c.weight);
  }
  return checks;
}

export function scoreCategories(checks: CheckResult[]): CategoryScore[] {
  const cats: Category[] = [
    "On-Page SEO", "GEO", "Links", "Usability", "Performance", "Social", "Local", "Other",
  ];
  return cats
    .map((category) => {
      const cc = checks.filter((c) => c.category === category && c.weight > 0);
      if (cc.length === 0) return null;
      const max = cc.reduce((a, c) => a + c.weight, 0);
      const got = cc.reduce((a, c) => a + c.weight * statusScore(c.status), 0);
      const score = max ? Math.round((got / max) * 100) : 100;
      const passed = cc.filter((c) => c.status === "pass" || c.status === "info").length;
      return { category, grade: scoreToGrade(score), score, passed, total: cc.length };
    })
    .filter(Boolean) as CategoryScore[];
}

export function overallScore(categories: CategoryScore[]): { grade: Grade; score: number } {
  // weight the headline categories more (matches screenshot 4 radar)
  const weights: Partial<Record<Category, number>> = {
    "On-Page SEO": 3, GEO: 2, Links: 2, Usability: 2, Performance: 2, Social: 1, Local: 1, Other: 1,
  };
  let num = 0, den = 0;
  for (const c of categories) {
    const w = weights[c.category] ?? 1;
    num += c.score * w;
    den += w;
  }
  const score = den ? Math.round(num / den) : 0;
  return { grade: scoreToGrade(score), score };
}

export function buildRecommendations(checks: CheckResult[]): Recommendation[] {
  const order: Record<Priority, number> = { high: 0, medium: 1, low: 2, pass: 3 };
  return checks
    .filter((c) => c.priority && c.priority !== "pass" && c.recommendation)
    .map((c) => ({
      id: c.id,
      title: c.recommendation!,
      category: c.category,
      priority: c.priority as Priority,
      detail: c.detail,
    }))
    .sort((a, b) => order[a.priority] - order[b.priority]);
}
