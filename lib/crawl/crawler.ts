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
  "Mozilla/5.0 (compatible; TomorrowRankBot/1.0; +https://welcometomorrow.io)";

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

async function fetchText(url: string, timeoutMs: number): Promise<{ status: number; body: string; finalUrl: string }> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
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
  const found = new Set<string>();
  const candidates = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];

  // robots.txt may list sitemaps
  try {
    const r = await fetchText(`${origin}/robots.txt`, Math.min(8000, timeoutMs));
    if (r.status < 400) {
      for (const m of r.body.matchAll(/^\s*sitemap:\s*(\S+)/gim)) candidates.push(m[1].trim());
    }
  } catch { /* no robots */ }

  for (const sm of [...new Set(candidates)].slice(0, 5)) {
    try {
      const r = await fetchText(sm, Math.min(10000, timeoutMs));
      if (r.status >= 400) continue;
      const locs = parseSitemapLocs(r.body);
      // sitemap index → fetch child sitemaps (cap to keep it bounded)
      const childSitemaps = locs.filter((l) => /\.xml($|\?)/i.test(l)).slice(0, 5);
      if (childSitemaps.length && /sitemapindex/i.test(r.body)) {
        for (const child of childSitemaps) {
          try {
            const cr = await fetchText(child, Math.min(10000, timeoutMs));
            if (cr.status < 400) parseSitemapLocs(cr.body).forEach((l) => found.add(l));
          } catch { /* skip child */ }
        }
      } else {
        locs.forEach((l) => found.add(l));
      }
    } catch { /* skip */ }
    if (found.size > 0) break;
  }
  return [...found];
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
  opts: { maxPages?: number; deadlineMs?: number; concurrency?: number } = {}
): Promise<CrawlResult> {
  const maxPages = opts.maxPages ?? (Number(process.env.CRAWL_MAX_PAGES) || 50);
  const deadline = Date.now() + (opts.deadlineMs ?? 180_000);
  const concurrency = opts.concurrency ?? 5;
  const remaining = () => Math.max(0, deadline - Date.now());

  const start = normalizeUrl(startUrl.startsWith("http") ? startUrl : `https://${startUrl}`) ?? `https://${startUrl}`;
  const origin = new URL(start).origin;

  // 1. Fetch homepage first (also gives us the real final URL + its links)
  let home: { status: number; body: string; finalUrl: string };
  try {
    home = await fetchText(start, 15_000);
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
    if (remaining() < batchTimeout + 3_000) { truncated = true; return; }
    try {
      const r = await fetchText(u, Math.min(batchTimeout, remaining() - 2000));
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
    url, status: 0, ok: false, title: null, titleLen: 0, metaDescription: null, descLen: 0,
    canonical: null, canonicalSelf: null, robotsMeta: null, noindex: false, lang: null,
    h1s: [], h2s: [], headingOutlineOk: false, wordCount: 0, thin: true, hasViewport: false,
    hasFavicon: false, ogCount: 0, twitterCount: 0, schemaTypes: [], hasFaqSchema: false,
    hasBreadcrumbSchema: false, hasArticleSchema: false, faqDetected: false,
    images: { total: 0, withAlt: 0, missingAlt: 0 }, internalLinks: [], externalLinks: [],
    emptyAnchors: 0, hreflangs: [],
  };
}
