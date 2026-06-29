// lib/providers/dataforseo-ai.ts
// DataForSEO AI Optimization API — LLM Mentions endpoints.
// This is used ONLY for AI Visibility (real Google AI Overview + ChatGPT
// mention/citation data). Keywords & backlinks come from Ahrefs instead.
//
// Requires the LLM Mentions subscription to be activated on your DataForSEO
// account ($100/month minimum top-up, spendable across any DataForSEO API).
// Auth: HTTP Basic with login:password.
// Docs: https://docs.dataforseo.com/v3/ai_optimization-llm_mentions-overview/
//
// Pricing: $0.1 per request + $0.001 per row (max 1000 rows/request).

const BASE = "https://api.dataforseo.com/v3";

export function dataForSeoConfigured(): boolean {
  return !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

function authHeader(): string {
  const login = process.env.DATAFORSEO_LOGIN!;
  const password = process.env.DATAFORSEO_PASSWORD!;
  return "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
}

async function post<T = any>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DataForSEO ${path} failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export interface LlmMentionRow {
  query: string;            // the user question / prompt
  answer: string;           // AI-generated snippet
  citedSources: string[];   // domains/urls cited (with link)
  mentionedSources: string[]; // brands/domains named without link
  aiSearchVolume: number | null;
  platform: string;         // "google" | "chat_gpt"
}

export interface CrossAggRow {
  target: string;           // brand/domain
  mentions: number;
  citations: number;
  aiSearchVolume: number | null;
}

const PLATFORM_MAP: Record<string, "google" | "chat_gpt"> = {
  google: "google",
  chatgpt: "chat_gpt",
  chat_gpt: "chat_gpt",
};

// ---------- SEARCH MENTIONS ----------
// Detailed mentions for a domain/keyword: full Q&A + cited & non-cited sources.
// POST /ai_optimization/llm_mentions/search/live
export async function searchMentions(
  target: string,
  locationCode: number,
  languageName: string,
  platform: "google" | "chatgpt" = "google",
  limit = 50
): Promise<LlmMentionRow[]> {
  const data = await post("/ai_optimization/llm_mentions/search/live", [
    {
      target: [{ domain: target, search_filter: "include" }],
      platform: PLATFORM_MAP[platform] ?? "google",
      location_code: locationCode,
      language_name: languageName,
      order_by: ["ai_search_volume,desc"],
      limit,
    },
  ]);
  const items = data?.tasks?.[0]?.result?.[0]?.items ?? [];
  return items.map((it: any) => ({
    query: it.keyword ?? it.question ?? "",
    answer: it.answer ?? it.snippet ?? "",
    citedSources: (it.cited_sources ?? it.references ?? [])
      .map((s: any) => (s.domain ?? s.url ?? "").toLowerCase())
      .filter(Boolean),
    mentionedSources: (it.mentions ?? it.non_cited_results ?? [])
      .map((s: any) => (s.domain ?? s.title ?? "").toLowerCase())
      .filter(Boolean),
    aiSearchVolume: it.ai_search_volume ?? null,
    platform: it.platform ?? "google",
  }));
}

// ---------- CROSS AGGREGATED METRICS ----------
// Benchmark several brands side-by-side (you + competitors).
// POST /ai_optimization/llm_mentions/cross_aggregated_metrics/live
export async function crossAggregatedMetrics(
  brands: string[],
  locationCode: number,
  languageName: string,
  platform: "google" | "chatgpt" = "google"
): Promise<CrossAggRow[]> {
  const data = await post("/ai_optimization/llm_mentions/cross_aggregated_metrics/live", [
    {
      targets: brands.map((b) => ({ domain: b })),
      platform: PLATFORM_MAP[platform] ?? "google",
      location_code: locationCode,
      language_name: languageName,
    },
  ]);
  const items = data?.tasks?.[0]?.result?.[0]?.items ?? [];
  return items.map((it: any) => ({
    target: it.target ?? it.domain ?? "",
    mentions: it.mentions_count ?? it.mentions ?? 0,
    citations: it.citations_count ?? it.citations ?? 0,
    aiSearchVolume: it.ai_search_volume ?? null,
  }));
}

// ---------- TOP DOMAINS ----------
// Which domains appear most for a keyword/topic — reveals real competitors.
// POST /ai_optimization/llm_mentions/top_domains/live
export async function topDomainsForKeyword(
  keyword: string,
  locationCode: number,
  languageName: string,
  platform: "google" | "chatgpt" = "google",
  limit = 10
): Promise<{ domain: string; mentions: number }[]> {
  try {
    const data = await post("/ai_optimization/llm_mentions/top_domains/live", [
      {
        target: [{ keyword, search_scope: ["answer"] }],
        platform: PLATFORM_MAP[platform] ?? "google",
        location_code: locationCode,
        language_name: languageName,
        limit,
      },
    ]);
    const items = data?.tasks?.[0]?.result?.[0]?.items ?? [];
    return items.map((it: any) => ({
      domain: it.domain ?? "",
      mentions: it.mentions_count ?? it.mentions ?? 0,
    }));
  } catch {
    return [];
  }
}
