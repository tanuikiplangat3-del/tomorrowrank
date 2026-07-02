// lib/crawl/issues.ts
// Turns crawled PageFacts[] into the clickable, prioritized issue list that the
// report renders. Each issue aligns to the Welcome Tomorrow rubric (Tech/Content
// tabs), records EVERY affected URL with first-hand evidence, and carries an
// action list (Fix / Add / Remove / Contact developer / SEO specialist review).
//
// Checks that cannot be verified from a crawl (GSC indexation/errors, field CWV,
// security, AI-Overview presence) are emitted with status "not_checked" and a
// clear reason — never faked as pass/fail.

import type { PageFacts } from "./analyzer";
import type { SiteIssue, AffectedUrl, IssueStatus } from "@/types/audit";

export type { SiteIssue, AffectedUrl, IssueStatus };
export type Priority = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; // 1=very high … 9=very low
export type ActionKind = "fix" | "add" | "remove" | "contact_dev" | "seo_specialist" | "content_specialist";

const P = { VERY_HIGH: 1 as Priority, HIGH: 3 as Priority, MEDIUM: 5 as Priority, LOW: 7 as Priority, VERY_LOW: 9 as Priority };

// only judge indexable, real, READABLE HTML pages for content checks
const indexable = (p: PageFacts) => p.ok && !p.blocked && !p.noindex;

export function buildSiteIssues(pages: PageFacts[]): SiteIssue[] {
  const issues: SiteIssue[] = [];
  const blocked = pages.filter((p) => p.blocked);
  const real = pages.filter((p) => p.ok && !p.blocked);
  const idx = pages.filter(indexable);
  const n = idx.length || 1;

  const push = (
    partial: Omit<SiteIssue, "affected" | "passedCount"> & { affected: AffectedUrl[]; total: number }
  ) => {
    const { total, ...rest } = partial;
    issues.push({ ...rest, passedCount: Math.max(0, total - partial.affected.length) });
  };

  // ---------- BLOCKED / UNREADABLE PAGES (honest, no fake findings) ----------
  if (blocked.length > 0) {
    issues.push({
      id: "blocked-pages", category: "Technical", subcategory: "Crawlability",
      title: "Pages could not be read (bot protection / 403 / JS challenge)",
      status: "checked", priority: 2,
      affected: blocked.map((p) => ({
        url: p.url,
        evidence: p.status === 403 ? "HTTP 403 — blocked by WAF/Cloudflare" : `Bot-challenge or protected page (status ${p.status || "?"})`,
      })),
      passedCount: real.length,
      recommendation:
        "The site (or these pages) blocked the crawler, so their content could not be analysed. " +
        "Allowlist the audit crawler, or note the site is JavaScript-rendered/Cloudflare-protected. " +
        "Findings below are based only on pages we could actually read.",
      actions: ["contact_dev", "seo_specialist"],
      reason: "No content-level findings are reported for these pages (we won't guess).",
    });
  }

  // ---------- CONTENT / ON-PAGE (crawl-measurable) ----------

  // Missing title
  push({
    id: "title-missing", category: "Content", subcategory: "Optimization",
    title: "Pages missing a <title> tag", status: "checked", priority: P.VERY_HIGH,
    affected: idx.filter((p) => !p.title).map((p) => ({ url: p.url, evidence: "No <title> found" })),
    total: n,
    recommendation: "Add a unique, descriptive <title> (30–60 chars) with the page's primary keyword near the front.",
    actions: ["add", "contact_dev"],
  });
  // Title length
  push({
    id: "title-length", category: "Content", subcategory: "Optimization",
    title: "Title length outside 30–60 characters", status: "checked", priority: P.MEDIUM,
    affected: idx.filter((p) => p.title && (p.titleLen < 30 || p.titleLen > 60))
      .map((p) => ({ url: p.url, evidence: `${p.titleLen} chars: "${p.title}"` })),
    total: n,
    recommendation: "Rewrite titles to 30–60 characters so they aren't truncated in search results.",
    actions: ["fix"],
  });
  // Duplicate titles
  issues.push(dupIssue(idx, "title", "title-duplicate", "Content", "Optimization",
    "Duplicate <title> across pages", P.HIGH,
    "Make each page's title unique so pages don't compete for the same query.", ["fix", "content_specialist"]));

  // Missing meta description
  push({
    id: "desc-missing", category: "Content", subcategory: "Optimization",
    title: "Pages missing a meta description", status: "checked", priority: P.HIGH,
    affected: idx.filter((p) => !p.metaDescription).map((p) => ({ url: p.url, evidence: "No meta description" })),
    total: n,
    recommendation: "Add a unique meta description (70–160 chars) that summarizes the page and earns the click.",
    actions: ["add", "content_specialist"],
  });
  // Description length
  push({
    id: "desc-length", category: "Content", subcategory: "Optimization",
    title: "Meta description outside 70–160 characters", status: "checked", priority: P.LOW,
    affected: idx.filter((p) => p.metaDescription && (p.descLen < 70 || p.descLen > 160))
      .map((p) => ({ url: p.url, evidence: `${p.descLen} chars` })),
    total: n,
    recommendation: "Tighten or expand meta descriptions to 70–160 characters.",
    actions: ["fix"],
  });
  // Duplicate descriptions
  issues.push(dupIssue(idx, "metaDescription", "desc-duplicate", "Content", "Optimization",
    "Duplicate meta descriptions", P.MEDIUM,
    "Write a unique meta description per page.", ["fix"]));

  // Missing H1
  push({
    id: "h1-missing", category: "Content", subcategory: "Optimization",
    title: "Pages missing an H1", status: "checked", priority: P.VERY_HIGH,
    affected: idx.filter((p) => p.h1s.length === 0).map((p) => ({ url: p.url, evidence: "No <h1> element" })),
    total: n,
    recommendation: "Add exactly one H1 that states what the page is about, using the primary keyword.",
    actions: ["add", "contact_dev"],
  });
  // Multiple H1
  push({
    id: "h1-multiple", category: "Content", subcategory: "Optimization",
    title: "Pages with multiple H1s", status: "checked", priority: P.MEDIUM,
    affected: idx.filter((p) => p.h1s.length > 1)
      .map((p) => ({ url: p.url, evidence: `${p.h1s.length} H1s: ${p.h1s.slice(0, 3).join(" | ")}` })),
    total: n,
    recommendation: "Keep a single H1 per page; demote the rest to H2/H3.",
    actions: ["fix", "contact_dev"],
  });
  // Duplicate H1
  issues.push(dupIssue(idx, "h1first", "h1-duplicate", "Content", "Optimization",
    "Duplicate H1 across pages", P.HIGH,
    "Give each page a unique H1 matching its specific topic.", ["fix", "content_specialist"],
    (p) => p.h1s[0] ?? ""));

  // Weak heading outline
  push({
    id: "outline-weak", category: "Content", subcategory: "Optimization",
    title: "Weak heading structure (no H2 subheadings)", status: "checked", priority: P.LOW,
    affected: idx.filter((p) => p.h1s.length >= 1 && p.h2s.length === 0)
      .map((p) => ({ url: p.url, evidence: "H1 present but no H2 subheadings" })),
    total: n,
    recommendation: "Break content into H2/H3 subheadings for readability and topical structure.",
    actions: ["fix", "content_specialist"],
  });
  // Thin content
  push({
    id: "thin-content", category: "Content", subcategory: "Quality",
    title: "Thin content (under 200 words)", status: "checked", priority: P.MEDIUM,
    affected: idx.filter((p) => p.thin).map((p) => ({ url: p.url, evidence: `${p.wordCount} words` })),
    total: n,
    recommendation: "Expand thin pages with genuinely useful, people-first content or consolidate them.",
    actions: ["add", "content_specialist"],
  });
  // Images missing alt
  push({
    id: "img-alt", category: "Content", subcategory: "Images",
    title: "Images missing alt text", status: "checked", priority: P.MEDIUM,
    affected: idx.filter((p) => p.images.missingAlt > 0)
      .map((p) => ({ url: p.url, evidence: `${p.images.missingAlt}/${p.images.total} images missing alt` })),
    total: n,
    recommendation: "Add descriptive alt text reflecting search intent to every meaningful image.",
    actions: ["add", "contact_dev"],
  });

  // ---------- TECHNICAL (crawl-measurable) ----------

  // Non-200 pages
  push({
    id: "status-errors", category: "Technical", subcategory: "Status codes",
    title: "Pages returning errors or redirects", status: "checked", priority: P.HIGH,
    affected: pages.filter((p) => !p.blocked && p.status && (p.status >= 400 || p.status === 0))
      .map((p) => ({ url: p.url, evidence: p.status === 0 ? "Fetch failed / timeout" : `HTTP ${p.status}` })),
    total: pages.length,
    recommendation: "Fix or redirect broken URLs; ensure important pages return HTTP 200.",
    actions: ["fix", "contact_dev"],
  });
  // Missing canonical
  push({
    id: "canonical-missing", category: "Technical", subcategory: "Indexation",
    title: "Pages missing a canonical tag", status: "checked", priority: P.MEDIUM,
    affected: idx.filter((p) => !p.canonical).map((p) => ({ url: p.url, evidence: "No rel=canonical" })),
    total: n,
    recommendation: "Add a self-referencing canonical to consolidate signals and avoid duplicate-content ambiguity.",
    actions: ["add", "contact_dev"],
  });
  // Accidental noindex
  push({
    id: "noindex", category: "Technical", subcategory: "Indexation",
    title: "Pages set to noindex", status: "checked", priority: P.VERY_HIGH,
    affected: real.filter((p) => p.noindex).map((p) => ({ url: p.url, evidence: `robots meta: ${p.robotsMeta}` })),
    total: pages.length,
    recommendation: "Confirm these pages should be excluded from search; remove noindex if they should rank.",
    actions: ["remove", "contact_dev"],
  });
  // Missing viewport (mobile)
  push({
    id: "viewport", category: "Technical", subcategory: "Mobile",
    title: "Pages missing a viewport meta tag", status: "checked", priority: P.MEDIUM,
    affected: idx.filter((p) => !p.hasViewport).map((p) => ({ url: p.url, evidence: "No viewport meta" })),
    total: n,
    recommendation: "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> for mobile rendering.",
    actions: ["add", "contact_dev"],
  });
  // Structured data coverage (SERP features)
  push({
    id: "schema-missing", category: "Technical", subcategory: "SERP-features",
    title: "Pages without any structured data (JSON-LD)", status: "checked", priority: P.LOW,
    affected: idx.filter((p) => p.schemaTypes.length === 0).map((p) => ({ url: p.url, evidence: "No JSON-LD schema" })),
    total: n,
    recommendation: "Add relevant schema (Organization, Breadcrumb, Product, FAQ, Article) where justified.",
    actions: ["add", "contact_dev"],
  });
  // Empty/JS anchors (internal linking quality)
  push({
    id: "empty-anchors", category: "Technical", subcategory: "Internal links",
    title: "Pages with empty or javascript-only links", status: "checked", priority: P.LOW,
    affected: idx.filter((p) => p.emptyAnchors > 2)
      .map((p) => ({ url: p.url, evidence: `${p.emptyAnchors} empty/JS anchors` })),
    total: n,
    recommendation: "Use real <a href> links so crawlers can follow them; avoid href=\"#\" / javascript: navigation.",
    actions: ["fix", "contact_dev"],
  });

  // ---------- AI / GEO (crawl-measurable part) ----------
  push({
    id: "faq-missing", category: "AI", subcategory: "Technical",
    title: "Key pages without FAQ content or FAQ schema", status: "checked", priority: P.MEDIUM,
    affected: idx.filter((p) => !p.faqDetected && !p.thin)
      .map((p) => ({ url: p.url, evidence: "No FAQ section or FAQPage schema detected" })),
    total: n,
    recommendation: "Add a genuine FAQ section (with FAQPage schema) answering real buyer questions — strong for AI answers.",
    actions: ["add", "content_specialist"],
  });

  // ---------- NOT CHECKABLE FROM A CRAWL (honest placeholders) ----------
  const notChecked = (id: string, category: SiteIssue["category"], sub: string, title: string, reason: string): SiteIssue => ({
    id, category, subcategory: sub, title, status: "not_checked", priority: P.MEDIUM,
    affected: [], passedCount: 0, recommendation: "", actions: [], reason,
  });
  issues.push(notChecked("gsc-indexation", "Technical", "Indexation", "Indexation status & coverage errors",
    "Requires Google Search Console access (connect GSC to verify)."));
  issues.push(notChecked("gsc-cwv-field", "Technical", "GSC check", "Field Core Web Vitals per URL",
    "Requires GSC / CrUX field data; only available for pages with enough real-user traffic."));
  issues.push(notChecked("gsc-security", "Technical", "Security", "Security issues & manual actions",
    "Requires Google Search Console access."));
  issues.push(notChecked("ai-overview-presence", "AI", "AI-Overview", "Presence in ChatGPT / Gemini / Perplexity answers",
    "Requires a SERP/LLM-answer data source (e.g. DataForSEO) for verified data."));

  return issues;
}

// Generic duplicate-value detector across pages for a given field.
function dupIssue(
  pages: PageFacts[],
  field: "title" | "metaDescription" | "h1first",
  id: string, category: SiteIssue["category"], sub: string, title: string, priority: Priority,
  recommendation: string, actions: ActionKind[],
  getter?: (p: PageFacts) => string
): SiteIssue {
  const valueOf = getter ?? ((p: PageFacts) => (p as any)[field] ?? "");
  const groups = new Map<string, PageFacts[]>();
  for (const p of pages) {
    const v = (valueOf(p) || "").trim().toLowerCase();
    if (!v) continue;
    (groups.get(v) ?? groups.set(v, []).get(v)!).push(p);
  }
  const affected: AffectedUrl[] = [];
  for (const [v, ps] of groups) {
    if (ps.length > 1) for (const p of ps) affected.push({ url: p.url, evidence: `Shared value: "${v.slice(0, 80)}"` });
  }
  return {
    id, category, subcategory: sub, title, status: "checked", priority,
    affected, passedCount: Math.max(0, pages.length - affected.length),
    recommendation, actions,
  };
}

// Roll issues into category scores + an overall grade based on weighted priority.
export function scoreFromIssues(issues: SiteIssue[]) {
  const checked = issues.filter((i) => i.status === "checked");
  const weight = (p: number) => (p <= 2 ? 5 : p <= 4 ? 3 : p <= 6 ? 2 : 1);
  let lost = 0, max = 0;
  for (const i of checked) {
    const total = i.affected.length + i.passedCount || 1;
    const w = weight(i.priority);
    max += w;
    lost += w * (i.affected.length / total);
  }
  const score = max ? Math.round(100 * (1 - lost / max)) : 100;
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 55 ? "D" : "F";
  return { score, grade, checkedCount: checked.length, notCheckedCount: issues.length - checked.length };
}
