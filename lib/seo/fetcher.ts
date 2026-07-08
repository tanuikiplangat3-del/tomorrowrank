// lib/seo/fetcher.ts
// Fetches the page + auxiliary files and extracts signals using regex/string
// parsing (no heavy DOM dep — keeps the serverless bundle small).

export interface PageSignals {
  finalUrl: string;
  status: number;
  protected?: boolean; // true if the site blocked the bot and we needed a proxy
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

// ScrapingBee fallback for JS-rendered or bot-protected (e.g. Cloudflare) sites.
// Only used when a direct fetch is blocked or returns near-empty HTML, to keep
// credit usage down. Basic JS render by default; premium proxy on retry.
export function scrapingBeeConfigured(): boolean {
  return !!process.env.SCRAPINGBEE_API_KEY;
}

async function scrapingBeeFetch(url: string, mode: "basic" | "premium" | "stealth" = "basic", timeoutMs = 15_000): Promise<{ status: number; html: string; finalUrl: string } | null> {
  const key = process.env.SCRAPINGBEE_API_KEY;
  if (!key) return null;
  const params = new URLSearchParams({
    api_key: key,
    url,
    render_js: "true",
  });
  if (mode === "premium") params.set("premium_proxy", "true");
  if (mode === "stealth") params.set("stealth_proxy", "true"); // strongest: defeats Cloudflare/WAF
  try {
    const res = await fetch(`https://app.scrapingbee.com/api/v1/?${params.toString()}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    const html = await res.text();
    if (!res.ok) return null;
    return { status: 200, html, finalUrl: url };
  } catch {
    return null;
  }
}

// A response is genuinely BLOCKED only when the server refused the bot or served
// an anti-bot challenge. We deliberately do NOT treat merely-short HTML as blocked
// — many valid pages are short, and rendering every short page via ScrapingBee
// blows the audit's time budget (the bug that made reports come back thin).
function looksBlocked(status: number, html: string): boolean {
  if (status === 403 || status === 429 || status === 503) return true;
  if (/just a moment|checking your browser|cf-browser-verification|attention required|cf-chl/i.test(html)) return true;
  return false;
}

// A 200 page that is really a client-rendered SHELL: almost no visible text, no
// real H1, but clear signs of a JS framework that injects content at runtime.
// We render these so meta/H1/content checks reflect the real page, not the shell.
function looksLikeJsShell(status: number, html: string): boolean {
  if (status !== 200 || !html) return false;
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const hasH1 = /<h1\b/i.test(html);
  const frameworkMarkers = /__NEXT_DATA__|id=["']root["']|id=["']__next["']|data-reactroot|ng-version|__NUXT__|window\.__/i.test(html);
  // Very little rendered text AND (no H1 or framework shell markers present).
  return text.length < 400 && (!hasH1 || frameworkMarkers);
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

  let finalUrl = url;
  let status = 0;
  let html = "";
  let renderedVia = "direct";
  let respHeaders: Headers | null = null;

  // 1. Try a normal, cheap direct fetch first.
  try {
    const res = await safeFetch(url);
    finalUrl = res.url || url;
    status = res.status;
    html = await res.text();
    respHeaders = res.headers;
  } catch {
    status = 0;
    html = "";
  }

  // 2. If the site genuinely BLOCKED the bot, retry via ScrapingBee. One cheap
  //    basic render first (handles plain JS sites); if still blocked, go STRAIGHT
  //    to the strongest mode (stealth) — skipping the slow premium middle step so
  //    the homepage fetch stays fast (~30s worst case, not ~70s).
  let wasProtected = false;
  if (scrapingBeeConfigured() && looksBlocked(status, html)) {
    wasProtected = true;
    const mode = (process.env.SCRAPINGBEE_PROXY_MODE as "premium" | "stealth") || "stealth";
    const basic = await scrapingBeeFetch(url, "basic", 12_000);
    if (basic && !looksBlocked(basic.status, basic.html)) {
      ({ status, html, finalUrl } = basic);
      renderedVia = "scrapingbee";
    } else {
      const strong = await scrapingBeeFetch(url, mode, 22_000);
      if (strong && !looksBlocked(strong.status, strong.html)) {
        ({ status, html, finalUrl } = strong);
        renderedVia = `scrapingbee-${mode}`;
      }
    }
  }

  // 3. If the page loaded (200) but looks like a JavaScript SHELL — content is
  //    injected client-side, so the raw HTML has almost no text and no real H1/
  //    meta — render it with ScrapingBee (basic render_js, ~cheap) so we analyse
  //    the ACTUAL rendered page. Without this, JS-rendered sites falsely report
  //    "missing title/meta/H1".
  if (scrapingBeeConfigured() && !wasProtected && looksLikeJsShell(status, html)) {
    const rendered = await scrapingBeeFetch(url, "basic", 15_000);
    if (rendered && !looksLikeJsShell(rendered.status, rendered.html)) {
      ({ status, html, finalUrl } = rendered);
      renderedVia = "scrapingbee-render";
    }
  }

  const res = { url: finalUrl, status } as { url: string; status: number };
  void renderedVia; // reserved for future reporting of render method
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
    protected: wasProtected,
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
    compression: respHeaders?.get("content-encoding") ?? null,
  };
}
