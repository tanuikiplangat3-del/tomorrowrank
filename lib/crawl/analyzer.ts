// lib/crawl/analyzer.ts
// Per-page analysis for the multi-page crawler. Extracts genuine, data-backed
// facts from a single page's HTML (no guessing) and derives the page-level
// checks from the Welcome Tomorrow audit rubric (Tech + Content tabs).
//
// Judgment checks that need an LLM (does the H1 match the product/service?
// content quality / E-E-A-T / FAQ intent) are NOT decided here — this module
// only reports the hard facts + deterministic issues. The LLM layer consumes
// these facts for a sampled subset of pages.

export interface PageFacts {
  url: string;
  status: number;
  ok: boolean;
  blocked: boolean; // 403 / bot-challenge / WAF — content could NOT be genuinely read
  title: string | null;
  titleLen: number;
  metaDescription: string | null;
  descLen: number;
  canonical: string | null;
  canonicalSelf: boolean | null;
  robotsMeta: string | null;
  noindex: boolean;
  lang: string | null;
  h1s: string[];
  h2s: string[];
  headingOutlineOk: boolean; // exactly one H1 and at least one H2 on content pages
  wordCount: number;
  thin: boolean;
  hasViewport: boolean;
  hasFavicon: boolean;
  ogCount: number;
  twitterCount: number;
  schemaTypes: string[];
  hasFaqSchema: boolean;
  hasBreadcrumbSchema: boolean;
  hasArticleSchema: boolean;
  faqDetected: boolean; // schema OR question-style headings with following text
  images: { total: number; withAlt: number; missingAlt: number };
  internalLinks: string[];
  externalLinks: string[];
  emptyAnchors: number; // href="#" or javascript: — poor internal linking
  hreflangs: string[];
}

const THIN_WORDS = 200;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&apos;|&#0*39;|&#x0*27;/gi, "'").replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n); } catch { return ""; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return ""; } })
    .replace(/\s+/g, " ").trim();
}
function parseAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) attrs[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? "";
  return attrs;
}
function tagsOf(html: string, name: string): Record<string, string>[] {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((m) => parseAttrs(m[0]));
}
function textBetweenAll(html: string, re: RegExp): string[] {
  return [...html.matchAll(re)].map((m) =>
    decodeEntities(m[1].replace(/<[^>]+>/g, " "))
  ).filter(Boolean);
}
function stripToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jsonLdTypes(html: string): string[] {
  const types: string[] = [];
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    try {
      const parsed = JSON.parse(b[1].trim());
      const collect = (node: any) => {
        if (!node) return;
        if (Array.isArray(node)) return node.forEach(collect);
        if (typeof node === "object") {
          const t = node["@type"];
          if (typeof t === "string") types.push(t);
          else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && types.push(x));
          if (node["@graph"]) collect(node["@graph"]);
        }
      };
      collect(parsed);
    } catch { /* malformed JSON-LD — ignore */ }
  }
  return [...new Set(types)];
}

// Heuristic FAQ detection without schema: several question-style headings.
function detectFaqByContent(h2s: string[], text: string): boolean {
  const qHeadings = h2s.filter((h) => /\?\s*$/.test(h) || /^(how|what|why|when|where|can|do|does|is|are|should)\b/i.test(h));
  if (qHeadings.length >= 3) return true;
  const qMarks = (text.match(/\?/g) || []).length;
  return qHeadings.length >= 2 && qMarks >= 4;
}

function sameHost(a: string, b: string): boolean {
  try { return new URL(a).hostname.replace(/^www\./, "") === new URL(b).hostname.replace(/^www\./, ""); }
  catch { return false; }
}

export function analyzePage(url: string, status: number, html: string): PageFacts {
  // Bot-challenge / WAF / 403 detection — do NOT trust content from these pages.
  const b = (html || "").slice(0, 4000).toLowerCase();
  const blocked =
    status === 403 || status === 429 || status === 503 ||
    b.includes("just a moment") || b.includes("cf-browser-verification") ||
    b.includes("cf-challenge") || b.includes("attention required") ||
    b.includes("enable javascript and cookies to continue") ||
    b.includes("checking your browser before");

  const metas = tagsOf(html, "meta");
  const links = tagsOf(html, "link");
  const metaBy = (id: string) => {
    for (const a of metas) {
      const k = (a.name ?? a.property ?? "").toLowerCase();
      if (k === id && a.content) { const v = decodeEntities(a.content); if (v) return v; }
    }
    return null;
  };

  const rawTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = rawTitle ? decodeEntities(rawTitle.replace(/<[^>]+>/g, " ")) || null : null;
  const metaDescription = metaBy("description");
  const canonical = links.find((a) => (a.rel ?? "").toLowerCase().split(/\s+/).includes("canonical"))?.href ?? null;
  const robotsMeta = metaBy("robots");
  const noindex = /noindex/i.test(robotsMeta ?? "");

  const h1s = textBetweenAll(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi);
  const h2s = textBetweenAll(html, /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi);
  const text = stripToText(html);
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => parseAttrs(m[0]));
  const withAlt = imgTags.filter((a) => (a.alt ?? "").trim().length > 0).length;

  const anchors = [...html.matchAll(/<a\b[^>]*>/gi)].map((m) => parseAttrs(m[0]));
  const internal: string[] = [];
  const external: string[] = [];
  let emptyAnchors = 0;
  for (const a of anchors) {
    const href = (a.href ?? "").trim();
    if (!href || href === "#" || href.startsWith("javascript:")) { emptyAnchors++; continue; }
    if (href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    let abs = href;
    try { abs = new URL(href, url).toString(); } catch { continue; }
    if (/^https?:/i.test(abs)) (sameHost(abs, url) ? internal : external).push(abs.split("#")[0]);
  }

  const schemaTypes = jsonLdTypes(html);
  const hasFaqSchema = schemaTypes.some((t) => /faqpage|qapage/i.test(t));
  const hasBreadcrumbSchema = schemaTypes.some((t) => /breadcrumblist/i.test(t));
  const hasArticleSchema = schemaTypes.some((t) => /article|blogposting|newsarticle/i.test(t));

  let canonicalSelf: boolean | null = null;
  if (canonical) {
    try { canonicalSelf = new URL(canonical).toString().replace(/\/$/, "") === new URL(url).toString().replace(/\/$/, ""); }
    catch { canonicalSelf = null; }
  }

  return {
    url,
    status,
    ok: status >= 200 && status < 400 && !blocked,
    blocked,
    title,
    titleLen: title?.length ?? 0,
    metaDescription,
    descLen: metaDescription?.length ?? 0,
    canonical,
    canonicalSelf,
    robotsMeta,
    // Never treat a challenge/403 page's meta as a real noindex.
    noindex: blocked ? false : noindex,
    lang: html.match(/<html[^>]*\blang=["']([^"']+)["']/i)?.[1] ?? null,
    h1s,
    h2s,
    headingOutlineOk: h1s.length === 1 && h2s.length >= 1,
    wordCount,
    thin: wordCount < THIN_WORDS,
    hasViewport: metas.some((a) => (a.name ?? "").toLowerCase() === "viewport"),
    hasFavicon: links.some((a) => /icon/i.test((a.rel ?? "").toLowerCase())),
    ogCount: metas.filter((a) => (a.property ?? "").toLowerCase().startsWith("og:")).length,
    twitterCount: metas.filter((a) => (a.name ?? "").toLowerCase().startsWith("twitter:")).length,
    schemaTypes,
    hasFaqSchema,
    hasBreadcrumbSchema,
    hasArticleSchema,
    faqDetected: hasFaqSchema || detectFaqByContent(h2s, text),
    images: { total: imgTags.length, withAlt, missingAlt: imgTags.length - withAlt },
    internalLinks: [...new Set(internal)],
    externalLinks: [...new Set(external)],
    emptyAnchors,
    hreflangs: links.filter((a) => a.hreflang).map((a) => a.hreflang),
  };
}
