// lib/providers/scrapingbee-extras.ts
// Two ScrapingBee features beyond the existing crawl fallback:
//  (A) captureScreenshot — a homepage screenshot for the top of the report.
//  (B) scrapeSocialProfile — best-effort live follower/engagement numbers for
//      a social profile URL, using ScrapingBee's AI extraction (ai_extract_rules).
//
// Cost-conscious by design: both try the CHEAP mode first (no stealth proxy)
// and only escalate to stealth (75-80 credits/request) if the cheap attempt
// is blocked or comes back empty — mirroring the same escalation pattern
// already used in lib/seo/fetcher.ts for the crawler.

export function scrapingBeeConfigured(): boolean {
  return !!process.env.SCRAPINGBEE_API_KEY;
}

const BASE = "https://app.scrapingbee.com/api/v1/";

// ---------------------------------------------------------------------------
// SHARED: CSS extraction rules for title/meta description/H1, used whenever a
// page is ALREADY going through ScrapingBee (blocked or JS-shell fallback —
// never on the free direct-fetch path, to keep this cost-neutral). Plain CSS
// selectors, not AI extraction: these are fixed, well-known fields, so a
// selector query against ScrapingBee's real rendered DOM is both cheaper and
// more reliable than an AI guess — regex against raw HTML text is what we're
// replacing, not something that needs an LLM.
//
// Requested together with json_response=true in the SAME call that fetches
// the page (no extra request, no extra cost): ScrapingBee's json_response
// wraps the normal response (the rendered `body` HTML) plus metadata, and the
// extract_rules fields are returned alongside it in that same JSON envelope.
// Defensive by design: if `body` isn't present in the response for any reason,
// callers fall back to treating the whole payload as unusable and keep the
// existing (working) regex-based parse — never a hard failure either way.
export const CORE_FIELDS_EXTRACT_RULES = JSON.stringify({
  title: "title",
  metaDescription: "meta[name='description']@content",
  h1: { selector: "h1", type: "list", output: "text" },
});

export interface CoreFieldsExtraction {
  html: string | null;
  title?: string | null;
  metaDescription?: string | null;
  h1s?: string[];
}

// Parses the combined json_response + extract_rules payload. Returns null if
// the shape isn't what we expect (caller then just keeps using the plain HTML
// fetch it already has — no regression, just no accuracy upgrade for that page).
export function parseCoreFieldsResponse(raw: any): CoreFieldsExtraction | null {
  if (!raw || typeof raw !== "object") return null;
  const html = typeof raw.body === "string" ? raw.body : null;
  if (!html) return null;
  const h1Raw = raw.h1;
  const h1s = Array.isArray(h1Raw) ? h1Raw.filter((s: any) => typeof s === "string" && s.trim()) : undefined;
  return {
    html,
    title: typeof raw.title === "string" ? raw.title.trim() || null : undefined,
    metaDescription: typeof raw.metaDescription === "string" ? raw.metaDescription.trim() || null : undefined,
    h1s,
  };
}

// ---------------------------------------------------------------------------
// (A) SCREENSHOT — a single fixed-viewport shot of the homepage, embedded as a
// base64 data URL (no external storage needed). Deliberately NOT full-page:
// full-page screenshots of long homepages can run several MB, which is both
// slow to fetch and too big to comfortably store in the job record. A fixed
// 1440x900 viewport gives a clean "above the fold" preview at a predictable,
// small file size.
// ---------------------------------------------------------------------------
export async function captureScreenshot(
  url: string,
  opts: { protected?: boolean; timeoutMs?: number; viewport?: "desktop" | "mobile" } = {}
): Promise<string | null> {
  const key = process.env.SCRAPINGBEE_API_KEY;
  if (!key) return null;
  const mobile = opts.viewport === "mobile";
  try {
    const params = new URLSearchParams({
      api_key: key,
      url,
      screenshot: "true",
      render_js: "true",
      window_width: mobile ? "390" : "1440",
      window_height: mobile ? "844" : "900",
      block_ads: "true",
    });
    if (mobile) params.set("device", "mobile");
    if (opts.protected) params.set("stealth_proxy", "true");
    const res = await fetch(`${BASE}?${params.toString()}`, {
      signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/png";
    if (!contentType.startsWith("image/")) return null; // an error page came back as HTML/JSON
    const buf = Buffer.from(await res.arrayBuffer());
    // Keep the stored report reasonably sized — skip (rather than truncate,
    // which would just produce a broken image) anything unexpectedly large.
    if (buf.byteLength > 3_000_000) return null;
    return `data:${contentType};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// (B) SOCIAL PROFILE SCRAPING — real follower/engagement numbers for a public
// social profile URL, via ScrapingBee's AI extraction. Best-effort: many
// platforms only show real numbers to logged-in users, so `available: false`
// with null fields is an expected, honest outcome for some profiles, not a bug.
// ---------------------------------------------------------------------------
export interface ScrapedSocialProfile {
  followers: number | null;
  engagement: number | null; // a representative recent post's likes/reactions, where visible
  handle: string | null;
  available: boolean;
}

const AI_RULES = JSON.stringify({
  followers: "The total follower or fan count for this profile, as a plain number (convert e.g. '12.4K' to 12400). Null if not visible without logging in.",
  engagement: "The likes or reactions count on the most recent visible post, as a plain number. Null if not visible.",
  handle: "The profile's @handle or page name as displayed.",
});

async function scrapeOnce(url: string, stealth: boolean, timeoutMs: number): Promise<any | null> {
  const key = process.env.SCRAPINGBEE_API_KEY;
  if (!key) return null;
  const params = new URLSearchParams({
    api_key: key,
    url,
    render_js: "true",
    block_resources: "false",
    ai_extract_rules: AI_RULES,
  });
  if (stealth) {
    params.set("stealth_proxy", "true");
    params.set("wait_browser", "networkidle2");
  }
  const res = await fetch(`${BASE}?${params.toString()}`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[,\s]/g, "");
    const m = cleaned.match(/^([\d.]+)\s*([kKmM]?)$/);
    if (m) {
      const n = parseFloat(m[1]);
      const mult = m[2].toLowerCase() === "k" ? 1_000 : m[2].toLowerCase() === "m" ? 1_000_000 : 1;
      return Math.round(n * mult);
    }
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export async function scrapeSocialProfile(url: string, opts: { allowStealth?: boolean } = {}): Promise<ScrapedSocialProfile> {
  const empty: ScrapedSocialProfile = { followers: null, engagement: null, handle: null, available: false };
  if (!scrapingBeeConfigured()) return empty;
  try {
    // Cheap attempt first (no stealth) — most public profile pages don't need it.
    let data = await scrapeOnce(url, false, 15_000).catch(() => null);
    // Escalate to stealth only if the cheap attempt failed outright or every
    // field came back empty (a common sign of a bot-challenge page) — AND
    // only when the caller has budget to spare for it. The public tool's
    // 3-minute total budget can't absorb a 40s stealth retry per social
    // profile on top of everything else it's doing, so it stays cheap-tier
    // only; the internal tool's 30-minute budget can afford the escalation.
    const looksEmpty = (d: any) =>
      !d || (toNumber(d.followers) == null && toNumber(d.engagement) == null && !d.handle);
    if (opts.allowStealth && looksEmpty(data)) {
      data = await scrapeOnce(url, true, 40_000).catch(() => null);
    }
    if (!data) return empty;
    const followers = toNumber(data.followers);
    const engagement = toNumber(data.engagement);
    const handle = typeof data.handle === "string" && data.handle.trim() ? data.handle.trim() : null;
    return { followers, engagement, handle, available: followers != null || engagement != null || !!handle };
  } catch {
    return empty;
  }
}

// ---------------------------------------------------------------------------
// GOOGLE SEARCH (SERP fallback) — a second source for the SERP Snapshot,
// used only when DataForSEO's SERP call fails or comes back empty. Confirmed
// endpoint: GET /api/v1/store/google. Honest limitation: ScrapingBee's schema
// gives real organic positions + People Also Ask, but featured-snippet and
// knowledge-panel detection aren't confirmed fields on this endpoint, so those
// two are left false here rather than guessed — DataForSEO (the primary path)
// is the reliable source for those two signals.
// ---------------------------------------------------------------------------
export interface ScrapingBeeSerpResult {
  yourPosition: number | null;
  hasPeopleAlsoAsk: boolean;
  topResults: { position: number; domain: string; title: string }[];
}

export async function scrapingBeeGoogleSearch(
  keyword: string,
  countryCode: string,
  targetDomain: string,
  languageCode = "en"
): Promise<ScrapingBeeSerpResult | null> {
  const key = process.env.SCRAPINGBEE_API_KEY;
  if (!key) return null;
  try {
    const params = new URLSearchParams({
      api_key: key,
      search: keyword,
      country_code: countryCode.toLowerCase(),
      language: languageCode,
    });
    const res = await fetch(`https://app.scrapingbee.com/api/v1/store/google?${params.toString()}`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const organic: any[] = data?.organic_results ?? [];
    const host = targetDomain.replace(/^www\./, "").toLowerCase();
    const topResults = organic.slice(0, 10).map((r) => ({
      position: r.position ?? 0,
      domain: String(r.domain ?? "").toLowerCase(),
      title: r.title ?? "",
    }));
    const yours = organic.find((r) => String(r.domain ?? "").toLowerCase().replace(/^www\./, "") === host);
    return {
      yourPosition: yours?.position ?? null,
      hasPeopleAlsoAsk: Array.isArray(data?.people_also_ask) && data.people_also_ask.length > 0,
      topResults,
    };
  } catch {
    return null;
  }
}
