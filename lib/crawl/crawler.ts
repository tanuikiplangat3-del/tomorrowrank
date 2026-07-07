// lib/crawl/crawler.ts
// Multi-page crawler. Discovers up to N pages starting from the homepage
// (sitemap.xml → robots.txt sitemaps → BFS of internal links), fetches them
// with limited concurrency, and analyzes each with analyzePage().
//
// Budget-aware: stops early when the wall-clock budget is exhausted so the
// audit always finishes. On Vercel Pro set CRAWL_MAX_PAGES=50 & maxDuration=300.

import { analyzePage, type PageFacts } from "./analyzer";

export interface CrawlResult {
  startUrl: string;
  finalUrl: string;
  pages: PageFacts[];
  discovered: number;   // how many URLs we found
  crawled: number;      // how many we actually fetched
  source: "sitemap" | "crawl" | "mixed";
  truncated: boolean;   // hit the page cap or budget
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// A page we couldn't genuinely read (bot challenge / WAF / 403). We must NOT
// emit content findings from these — better to report "blocked" than invent one.
export function looksBlocked(status: number, body: string): boolean {
  if (status === 403 || status === 429 || status === 503) return true;
  const b = body.slice(0, 4000).toLowerCase();
  return (
    b.includes("just a moment") ||
    b.includes("cf-browser-verification") ||
    b.includes("cf-challenge") ||
    b.includes("attention required") ||
    b.includes("enable javascript and cookies to continue") ||
    b.includes("checking your browser before")
  );
}

function normalizeUrl(u: string): string | null {
  try {
    const url = new URL(u);
    url.hash = "";
    // drop obvious non-HTML assets
    if (/\.(jpg|jpeg|png|gif|svg|webp|ico|css|js|pdf|zip|mp4|woff2?|ttf)$/i.test(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).hostname.replace(/^www\./, "") === new URL(b).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

type ProxyMode = "none" | "premium" | "stealth";

function beeUrl(url: string, mode: ProxyMode): string {
  const params = new URLSearchParams({
    api_key: process.env.SCRAPINGBEE_API_KEY!,
    url,
    render_js: "true",
  });
  if (mode === "premium") params.set("premium_proxy", "true");
  if (mode === "stealth") params.set("stealth_proxy", "true"); // strongest — defeats Cloudflare/WAF
  return `https://app.scrapingbee.com/api/v1/?${params.toString()}`;
}

async function fetchText(
  url: string,
  timeoutMs: number,
  proxy: ProxyMode = "none"
): Promise<{ status: number; body: string; finalUrl: string }> {
  // When a proxy mode is requested (protected site), go STRAIGHT through
  // ScrapingBee — no doomed direct hit first. This is what lets a Cloudflare/WAF
  // site be crawled like a normal site.
  if (proxy !== "none" && process.env.SCRAPINGBEE_API_KEY) {
    try {
      const r = await fetch(beeUrl(url, proxy), {
        signal: AbortSignal.timeout(Math.max(10_000, Math.min(timeoutMs, 30_000))),
      });
      const body = await r.text();
      if (r.ok) return { status: 200, body, finalUrl: url };
      return { status: r.status, body, finalUrl: url };
    } catch {
      return { status: 0, body: "", finalUrl: url };
    }
  }

  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Upgrade-Insecure-Requests": "1",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.text();
  return { status: res.status, body, finalUrl: (res as any).url || url };
}

// Parse <loc> entries from a sitemap or sitemap index (recurses one level).
export function parseSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
}

async function discoverFromSitemaps(origin: string, timeoutMs: number): Promise<string[]> {
  const pages = new Set<string>();
  const sitemapsToRead: string[] = [];
  const seenSitemaps = new Set<string>();

  // robots.txt is the authoritative place to find sitemaps
  try {
    const r = await fetchText(`${origin}/robots.txt`, Math.min(8000, timeoutMs));
    if (r.status < 400) {
      for (const m of r.body.matchAll(/^\s*sitemap:\s*(\S+)/gim)) sitemapsToRead.push(m[1].trim());
    }
  } catch { /* no robots */ }

  // Common fallbacks if robots didn't list one
  if (sitemapsToRead.length === 0) {
    sitemapsToRead.push(`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/sitemap-index.xml`);
  }

  // Breadth-first over sitemaps: an index yields child sitemaps; a urlset yields pages.
  // Bounded so it can't run away.
  let budgetSitemaps = 30;
  while (sitemapsToRead.length && budgetSitemaps-- > 0) {
    const sm = sitemapsToRead.shift()!;
    if (seenSitemaps.has(sm)) continue;
    seenSitemaps.add(sm);
    try {
      const r = await fetchText(sm, Math.min(12000, timeoutMs));
      if (r.status >= 400) continue;
      const isIndex = /<sitemapindex[\s>]/i.test(r.body);
      const locs = parseSitemapLocs(r.body);
      if (isIndex) {
        // children are more sitemaps
        for (const child of locs) if (!seenSitemaps.has(child)) sitemapsToRead.push(child);
      } else {
        // urlset → real page URLs
        for (const loc of locs) pages.add(loc);
      }
    } catch { /* skip this sitemap */ }
    if (pages.size >= 200) break; // plenty; caller caps to maxPages
  }
  return [...pages];
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(size, Math.max(1, items.length)) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function crawlSite(
  startUrl: string,
  opts: { maxPages?: number; deadlineMs?: number; concurrency?: number; proxy?: ProxyMode } = {}
): Promise<CrawlResult> {
  const maxPages = opts.maxPages ?? (Number(process.env.CRAWL_MAX_PAGES) || 50);
  const deadline = Date.now() + (opts.deadlineMs ?? 180_000);
  const concurrency = opts.concurrency ?? 5;
  const proxy: ProxyMode = opts.proxy ?? "none";
  const remaining = () => Math.max(0, deadline - Date.now());

  const start = normalizeUrl(startUrl.startsWith("http") ? startUrl : `https://${startUrl}`) ?? `https://${startUrl}`;
  const origin = new URL(start).origin;

  // 1. Fetch homepage first (also gives us the real final URL + its links)
  let home: { status: number; body: string; finalUrl: string };
  try {
    home = await fetchText(start, 15_000, proxy);
  } catch {
    return { startUrl: start, finalUrl: start, pages: [], discovered: 0, crawled: 0, source: "crawl", truncated: false };
  }
  const finalUrl = home.finalUrl;
  const homeFacts = analyzePage(finalUrl, home.status, home.body);

  // 2. Prefer sitemap for the URL set; else BFS from homepage links.
  let source: CrawlResult["source"] = "crawl";
  let queue: string[] = [];
  const sitemapUrls = (await discoverFromSitemaps(origin, remaining()))
    .map(normalizeUrl)
    .filter((u): u is string => !!u && sameHost(u, finalUrl));
  if (sitemapUrls.length > 0) {
    source = "sitemap";
    queue = sitemapUrls;
  } else {
    queue = homeFacts.internalLinks.map(normalizeUrl).filter((u): u is string => !!u);
  }

  // Always include the homepage first; dedupe; cap.
  const seen = new Set<string>([finalUrl]);
  const toFetch: string[] = [];
  for (const u of queue) {
    if (toFetch.length >= maxPages - 1) break;
    if (!seen.has(u) && sameHost(u, finalUrl)) { seen.add(u); toFetch.push(u); }
  }
  const discovered = seen.size;

  // 3. Fetch + analyze the rest with limited concurrency, respecting the budget.
  const pages: PageFacts[] = [homeFacts];
  let truncated = sitemapUrls.length > maxPages - 1 || queue.length > maxPages - 1;
  const batchTimeout = 12_000;

  const batchable = toFetch.filter(() => true);
  await pool(batchable, concurrency, async (u) => {
    // Proxied fetches are slower, so allow more time per page when proxying.
    const perPage = proxy === "none" ? batchTimeout : 18_000;
    if (remaining() < 4_000) { truncated = true; return; }
    try {
      const r = await fetchText(u, Math.min(perPage, remaining() - 2000), proxy);
      pages.push(analyzePage(r.finalUrl || u, r.status, r.body));
      // Enrich BFS: if we started from homepage links and still have room, add new internal links.
      if (source === "crawl" && pages.length < maxPages) {
        const facts = pages[pages.length - 1];
        for (const link of facts.internalLinks) {
          const n = normalizeUrl(link);
          if (n && !seen.has(n) && sameHost(n, finalUrl) && seen.size < maxPages) {
            seen.add(n);
            // best-effort second wave handled by re-running pool would over-complicate;
            // for BFS depth>1 we rely on sitemap in practice. Mark discovered count.
          }
        }
      }
    } catch {
      pages.push({ ...emptyFacts(u), status: 0, ok: false });
    }
  });

  return {
    startUrl: start,
    finalUrl,
    pages,
    discovered,
    crawled: pages.length,
    source,
    truncated,
  };
}

function emptyFacts(url: string): PageFacts {
  return {
    url, status: 0, ok: false, blocked: false, title: null, titleLen: 0, metaDescription: null, descLen: 0,
    canonical: null, canonicalSelf: null, robotsMeta: null, noindex: false, lang: null,
    h1s: [], h2s: [], headingOutlineOk: false, wordCount: 0, thin: true, hasViewport: false,
    hasFavicon: false, ogCount: 0, twitterCount: 0, schemaTypes: [], hasFaqSchema: false,
    hasBreadcrumbSchema: false, hasArticleSchema: false, faqDetected: false,
    images: { total: 0, withAlt: 0, missingAlt: 0 }, internalLinks: [], externalLinks: [],
    emptyAnchors: 0, hreflangs: [],
  };
}
