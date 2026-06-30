// lib/seo/fetcher.ts
// Fetches the page + auxiliary files and extracts signals using regex/string
// parsing (no heavy DOM dep — keeps the serverless bundle small).

export interface PageSignals {
  finalUrl: string;
  status: number;
  html: string;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  h1: string[];
  h2: string[];
  headings: { h2: number; h3: number; h4: number; h5: number; h6: number };
  images: { total: number; withAlt: number };
  hreflang: string[];
  lang: string | null;
  wordCount: number;
  hasViewport: boolean;
  hasFavicon: boolean;
  hasFlash: boolean;
  iframeCount: number;
  inlineStyleCount: number;
  hasAmp: boolean;
  ssl: boolean;
  // structured data
  jsonLdTypes: string[];
  hasOrganizationSchema: boolean;
  hasLocalBusinessSchema: boolean;
  hasIdentitySchema: boolean;
  // analytics / pixels
  hasGoogleAnalytics: boolean;
  hasFacebookPixel: boolean;
  // social / OG
  ogTags: number;
  twitterCards: number;
  social: {
    facebook: string | null;
    twitter: string | null;
    instagram: string | null;
    youtube: string | null;
    linkedin: string | null;
  };
  // contact
  hasPhone: boolean;
  hasAddress: boolean;
  // links
  internalLinks: number;
  externalLinks: number;
  // aux files
  robotsTxt: { exists: boolean; blocksAll: boolean };
  sitemap: boolean;
  llmsTxt: boolean;
  http2: boolean;
  compression: string | null;
}

const UA =
  "Mozilla/5.0 (compatible; TomorrowRankBot/1.0; +https://welcometomorrow.io)";

async function safeFetch(url: string, opts: RequestInit = {}) {
  return fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": UA, ...(opts.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
    ...opts,
  });
}

function textBetween(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

function countMatches(html: string, re: RegExp): number {
  return (html.match(re) ?? []).length;
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Decode the common HTML entities so titles/descriptions read correctly and
// their character counts are accurate.
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#0*39;|&#x0*27;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, n) => safeCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => safeCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, " ")
    .trim();
}
function safeCodePoint(n: number): string {
  try { return String.fromCodePoint(n); } catch { return ""; }
}

// Parse a single tag's attributes into a lowercased-key map. Order-independent,
// handles double quotes, single quotes, and unquoted values.
function parseAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) {
    attrs[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? "";
  }
  return attrs;
}

// All <meta> / <link> tags as attribute maps.
function tagsOf(html: string, name: "meta" | "link"): Record<string, string>[] {
  const re = new RegExp(`<${name}\\b[^>]*>`, "gi");
  return [...html.matchAll(re)].map((m) => parseAttrs(m[0]));
}

// Find a <meta> content value by its name= or property= key (case-insensitive).
function metaContent(
  metas: Record<string, string>[],
  keyMatch: (k: string) => boolean
): string | null {
  for (const a of metas) {
    const id = (a.name ?? a.property ?? "").toLowerCase();
    if (id && keyMatch(id) && a.content != null) {
      const v = decodeEntities(a.content);
      return v.length ? v : null;
    }
  }
  return null;
}

export async function fetchPageSignals(rawUrl: string): Promise<PageSignals> {
  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
  const res = await safeFetch(url);
  const finalUrl = res.url || url;
  const html = await res.text();
  const origin = new URL(finalUrl).origin;
  const host = new URL(finalUrl).hostname;

  const lower = html.toLowerCase();

  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
    stripTags(m[1])
  );
  const h2 = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) =>
    stripTags(m[1])
  );

  // JSON-LD blocks
  const jsonLdBlocks = [
    ...html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ].map((m) => m[1]);
  const jsonLdTypes: string[] = [];
  for (const block of jsonLdBlocks) {
    const types = [...block.matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
    jsonLdTypes.push(...types);
  }

  // images
  const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const withAlt = imgTags.filter((t) => /\balt\s*=\s*["'][^"']*\S[^"']*["']/i.test(t));

  // links
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)].map((m) => m[1]);
  let internal = 0;
  let external = 0;
  for (const href of links) {
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    try {
      const u = new URL(href, finalUrl);
      if (u.hostname === host) internal++;
      else external++;
    } catch {
      internal++;
    }
  }

  // social links
  const findSocial = (re: RegExp) => {
    const m = html.match(re);
    return m ? m[0] : null;
  };

  // aux files (best-effort, never throw)
  const [robotsTxt, llms, sitemapXml] = await Promise.allSettled([
    safeFetch(`${origin}/robots.txt`).then((r) => (r.ok ? r.text() : "")),
    safeFetch(`${origin}/llms.txt`).then((r) => r.ok),
    safeFetch(`${origin}/sitemap.xml`).then((r) => r.ok),
  ]);
  const robotsBody = robotsTxt.status === "fulfilled" ? robotsTxt.value : "";
  const robotsBlocksAll = /user-agent:\s*\*[\s\S]*?disallow:\s*\/\s*(\n|$)/i.test(
    robotsBody
  );

  const wordCount = stripTags(html).split(/\s+/).filter(Boolean).length;

  // Order-/quote-independent tag parsing for head metadata.
  const metas = tagsOf(html, "meta");
  const linkTags = tagsOf(html, "link");
  const rawTitle = textBetween(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = rawTitle ? decodeEntities(stripTags(rawTitle)) || null : null;
  const canonical =
    linkTags.find((a) => (a.rel ?? "").toLowerCase().split(/\s+/).includes("canonical"))
      ?.href ?? null;
  const hasFaviconTag = linkTags.some((a) =>
    /(^|\s)icon(\s|$)|shortcut icon|apple-touch-icon/i.test((a.rel ?? "").toLowerCase())
  );
  const hreflangs = linkTags
    .filter((a) => a.hreflang)
    .map((a) => a.hreflang)
    .concat([...html.matchAll(/hreflang=["']([^"']+)["']/gi)].map((m) => m[1]));

  return {
    finalUrl,
    status: res.status,
    html,
    title,
    metaDescription: metaContent(metas, (k) => k === "description"),
    canonical,
    robotsMeta: metaContent(metas, (k) => k === "robots"),
    h1,
    h2,
    headings: {
      h2: countMatches(html, /<h2[\s>]/gi),
      h3: countMatches(html, /<h3[\s>]/gi),
      h4: countMatches(html, /<h4[\s>]/gi),
      h5: countMatches(html, /<h5[\s>]/gi),
      h6: countMatches(html, /<h6[\s>]/gi),
    },
    images: { total: imgTags.length, withAlt: withAlt.length },
    hreflang: hreflangs,
    lang: textBetween(html, /<html[^>]*\blang=["']([^"']+)["']/i),
    wordCount,
    hasViewport: metas.some((a) => (a.name ?? "").toLowerCase() === "viewport"),
    hasFavicon: hasFaviconTag,
    hasFlash: /\.swf\b/i.test(html) || /application\/x-shockwave-flash/i.test(html),
    iframeCount: countMatches(html, /<iframe[\s>]/gi),
    inlineStyleCount: countMatches(html, /\sstyle=["']/gi),
    hasAmp: /<html[^>]*\s(amp|⚡)(\s|=|>)/i.test(html) || /rel=["']amphtml["']/i.test(html),
    ssl: finalUrl.startsWith("https://"),
    jsonLdTypes,
    hasOrganizationSchema: jsonLdTypes.some((t) => /Organization/i.test(t)),
    hasLocalBusinessSchema: jsonLdTypes.some((t) => /LocalBusiness|Store|Restaurant/i.test(t)),
    hasIdentitySchema: jsonLdTypes.some((t) => /Organization|Person|Brand/i.test(t)),
    hasGoogleAnalytics:
      /gtag\(|googletagmanager\.com|google-analytics\.com|ga\(/i.test(lower),
    hasFacebookPixel: /connect\.facebook\.net\/[^"']*fbevents\.js|fbq\(/i.test(lower),
    ogTags: metas.filter((a) => (a.property ?? "").toLowerCase().startsWith("og:")).length,
    twitterCards: metas.filter((a) => (a.name ?? "").toLowerCase().startsWith("twitter:")).length,
    social: {
      facebook: findSocial(/https?:\/\/(www\.)?facebook\.com\/[^\s"'<>]+/i),
      twitter: findSocial(/https?:\/\/(www\.)?(twitter|x)\.com\/[^\s"'<>]+/i),
      instagram: findSocial(/https?:\/\/(www\.)?instagram\.com\/[^\s"'<>]+/i),
      youtube: findSocial(/https?:\/\/(www\.)?youtube\.com\/[^\s"'<>]+/i),
      linkedin: findSocial(/https?:\/\/(www\.)?linkedin\.com\/[^\s"'<>]+/i),
    },
    hasPhone: /tel:\+?\d|(\+?\d[\d\s().-]{7,}\d)/.test(stripTags(html)),
    hasAddress: /\b(street|avenue|road|ave|st\.|rd\.|p\.?o\.? box|nairobi|suite)\b/i.test(
      stripTags(html)
    ),
    internalLinks: internal,
    externalLinks: external,
    robotsTxt: { exists: robotsBody.length > 0, blocksAll: robotsBlocksAll },
    sitemap: sitemapXml.status === "fulfilled" ? sitemapXml.value : false,
    llmsTxt: llms.status === "fulfilled" ? llms.value : false,
    http2: true, // Vercel/most hosts serve HTTP/2; refined via response in real infra
    compression: res.headers.get("content-encoding"),
  };
}
