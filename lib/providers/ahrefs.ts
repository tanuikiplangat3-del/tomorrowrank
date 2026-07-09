// lib/providers/ahrefs.ts
// Thin client over the Ahrefs API v3 (Site Explorer).
// Docs: https://docs.ahrefs.com/api/reference/introduction
//
// Auth:  Authorization: Bearer <AHREFS_API_KEY>   (GET requests)
// Notes:
//  - Every list endpoint REQUIRES a `select` param (comma-separated columns).
//  - Standard plan caps responses at 25 rows/request and 60 req/min — fine here
//    because the tool only displays top-N. Minimum 50 units per request.
//  - `where` takes a JSON filter expression (see filter-syntax docs).

const BASE = "https://api.ahrefs.com/v3";

function authHeaders() {
  const key = process.env.AHREFS_API_KEY;
  if (!key) throw new Error("AHREFS_API_KEY not configured");
  return { Authorization: `Bearer ${key}`, Accept: "application/json" };
}

async function get<T = any>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}${path}?${qs}`, {
    method: "GET",
    headers: authHeaders(),
    // Ahrefs normally responds in well under 2s. 20s (was 60s) is already a
    // generous margin for a slow day — the old 60s ceiling meant a single
    // degraded Ahrefs endpoint could silently eat a THIRD of the public
    // tool's entire 180s budget, since Promise.allSettled waits for the
    // slowest of the ~9 parallel Ahrefs calls before the audit can proceed.
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ahrefs ${path} failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

// today's date in YYYY-MM-DD, used by endpoints that need a `date`
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------- DOMAIN RATING (authority) ----------
// GET /site-explorer/domain-rating  → { domain_rating, ahrefs_rank }
export async function domainRating(target: string) {
  try {
    const data = await get("/site-explorer/domain-rating", {
      target,
      date: today(),
      protocol: "both",
      mode: "subdomains",
    });
    return {
      domainRating: data?.domain_rating?.domain_rating ?? data?.domain_rating ?? null,
      ahrefsRank: data?.domain_rating?.ahrefs_rank ?? data?.ahrefs_rank ?? null,
    };
  } catch {
    return { domainRating: null, ahrefsRank: null };
  }
}

// ---------- BACKLINKS OVERVIEW (summary stats) ----------
// GET /site-explorer/backlinks-stats → totals for backlinks & referring domains
export async function backlinksStats(target: string) {
  try {
    const data = await get("/site-explorer/backlinks-stats", {
      target,
      mode: "subdomains",
      date: today(),
    });
    const m = data?.metrics ?? data ?? {};
    return {
      totalBacklinks: m.live ?? m.backlinks ?? null,
      referringDomains: m.live_refdomains ?? m.refdomains ?? null,
    };
  } catch {
    return { totalBacklinks: null, referringDomains: null };
  }
}

// ---------- TOP BACKLINKS ----------
// GET /site-explorer/all-backlinks (select required)
export async function topBacklinks(target: string, limit = 25) {
  const data = await get("/site-explorer/all-backlinks", {
    target,
    mode: "subdomains",
    aggregation: "1_per_domain",
    select: "url_from,domain_rating_source,anchor,is_dofollow,first_seen,url_to",
    order_by: "domain_rating_source:desc",
    limit: String(limit),
    where: JSON.stringify({ field: "is_dofollow", is: ["eq", true] }),
  });
  return (data?.backlinks ?? data?.items ?? []) as any[];
}

// ---------- REFERRING DOMAINS (for geo + counts) ----------
// GET /site-explorer/refdomains (select required)
export async function referringDomains(target: string, limit = 25) {
  const data = await get("/site-explorer/refdomains", {
    target,
    mode: "subdomains",
    select: "refdomain,domain_rating,dofollow_links,first_seen",
    order_by: "domain_rating:desc",
    limit: String(limit),
  });
  return (data?.refdomains ?? data?.items ?? []) as any[];
}

// ---------- TOP PAGES BY BACKLINKS ----------
// GET /site-explorer/pages-by-backlinks (formerly best-by-external-links)
export async function topPagesByBacklinks(target: string, limit = 10) {
  const data = await get("/site-explorer/pages-by-backlinks", {
    target,
    mode: "subdomains",
    select: "url,backlinks,refdomains",
    order_by: "backlinks:desc",
    limit: String(limit),
  });
  return (data?.pages ?? data?.items ?? []) as any[];
}

// ---------- TOP ANCHORS ----------
// GET /site-explorer/anchors (select required)
export async function topAnchors(target: string, limit = 10) {
  try {
    const data = await get("/site-explorer/anchors", {
      target,
      mode: "subdomains",
      select: "anchor,backlinks,refdomains",
      order_by: "backlinks:desc",
      limit: String(limit),
    });
    return (data?.anchors ?? data?.items ?? []) as any[];
  } catch {
    return [];
  }
}

// ---------- ORGANIC KEYWORDS (rankings) ----------
// GET /site-explorer/organic-keywords (select required)
export async function organicKeywords(
  target: string,
  country: string, // ISO-2 lowercased, e.g. "ke"
  limit = 25
) {
  const data = await get("/site-explorer/organic-keywords", {
    target,
    mode: "subdomains",
    country: country.toUpperCase(),
    select: "keyword,best_position,volume,sum_traffic,best_position_url,keyword_difficulty,cpc",
    order_by: "sum_traffic:desc",
    limit: String(limit),
    date: today(),
  });
  return (data?.keywords ?? data?.items ?? []) as any[];
}

// ---------- ORGANIC COMPETITORS (optional, helps AI-visibility seed) ----------
export async function organicCompetitors(target: string, country: string, limit = 10) {
  try {
    const data = await get("/site-explorer/organic-competitors", {
      target,
      mode: "subdomains",
      country: country.toUpperCase(),
      select: "competitor_domain,common_keywords,domain_rating",
      order_by: "common_keywords:desc",
      limit: String(limit),
      date: today(),
    });
    return (data?.competitors ?? data?.items ?? []) as any[];
  } catch {
    return [];
  }
}

// ---------- KEYWORD OPPORTUNITIES ----------
// Keywords the domain already shows up for at positions 4-50 (page 1 bottom
// half through page 5) — visible to Google but not yet winning the click.
// These are genuine "close but not there yet" wins, distinct from the
// top-ranking keywords already surfaced by organicKeywords(). Reuses the same
// organic-keywords endpoint with a `where` filter, so no new Ahrefs product
// is needed — sorted by search volume so the highest-value gaps surface first.
export async function keywordOpportunities(target: string, country: string, limit = 20) {
  try {
    const data = await get("/site-explorer/organic-keywords", {
      target,
      mode: "subdomains",
      country: country.toUpperCase(),
      select: "keyword,best_position,volume,keyword_difficulty,best_position_url",
      where: JSON.stringify({
        or: [
          { field: "best_position_set", is: ["eq", "top_4_10"] },
          { field: "best_position_set", is: ["eq", "top_11_50"] },
        ],
      }),
      order_by: "volume:desc",
      limit: String(limit),
      date: today(),
    });
    let items = (data?.keywords ?? data?.items ?? []) as any[];
    // Fall back to a client-side filter if the `where` filter shape above
    // isn't accepted by this endpoint/plan — better a slightly-looser result
    // than an empty section.
    if (!items.length) {
      const all = await organicKeywords(target, country, 100);
      items = all.filter((it) => {
        const p = it?.best_position;
        return typeof p === "number" && p >= 4 && p <= 50;
      });
    }
    return items;
  } catch {
    return [];
  }
}
