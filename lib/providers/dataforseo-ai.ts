// lib/providers/dataforseo-ai.ts
// DataForSEO integration. Endpoints used (all confirmed against DataForSEO's
// v3 docs):
//   (A) Google AI Mode / AI Overview — serp/google/ai_mode/live/advanced
//   (B) ChatGPT LLM response  — ai_optimization/chat_gpt/llm_responses/live
//   (C) Gemini LLM response   — ai_optimization/gemini/llm_responses/live
//   (D) Perplexity LLM response — ai_optimization/perplexity/llm_responses/live
//   (E) Google Organic SERP (broader snapshot: PAA, featured snippet, knowledge
//       panel, real position) — serp/google/organic/live/advanced
//   (F) Real Google Ads search volume — keywords_data/google_ads/search_volume/live
//   (G) Google Business Profile lookup — business_data/google/my_business_info/live
//
// NOTE: Copilot and Grok are NOT available through DataForSEO (or any other API
// wired into this project) as of this writing — there is no confirmed endpoint
// for either. Rather than fabricate numbers, the AI Responses dashboard marks
// both as unavailable. See lib/ai-visibility/engine.ts.
//
// Auth: HTTP Basic with login:password.

const BASE = "https://api.dataforseo.com/v3";

export function dataForSeoConfigured(): boolean {
  return !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

function authHeader(): string {
  const login = process.env.DATAFORSEO_LOGIN!;
  const password = process.env.DATAFORSEO_PASSWORD!;
  return "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
}

async function post<T = any>(path: string, body: unknown, timeoutMs = 35_000): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DataForSEO ${path} failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// (A) GOOGLE AI OVERVIEW — does Google show an AI answer for this keyword, and
//     which domains does it cite?
// ---------------------------------------------------------------------------
export interface AiOverviewResult {
  present: boolean;
  citedDomains: string[];               // unique domains cited
  references: { domain: string; url: string; title: string }[];
}

export async function googleAiOverview(
  keyword: string,
  locationCode: number,
  languageCode = "en"
): Promise<AiOverviewResult> {
  const data = await post("/serp/google/ai_mode/live/advanced", [
    { keyword, location_code: locationCode, language_code: languageCode, device: "desktop" },
  ]);
  const result = data?.tasks?.[0]?.result?.[0];
  const items = result?.items ?? [];
  const aiOverview = items.find((it: any) => it.type === "ai_overview");
  if (!aiOverview) return { present: false, citedDomains: [], references: [] };

  // References live both at the top level and nested inside elements.
  const refs: { domain: string; url: string; title: string }[] = [];
  const collect = (arr: any[]) => {
    for (const r of arr ?? []) {
      if (r?.domain || r?.url) {
        refs.push({ domain: (r.domain ?? "").toLowerCase(), url: r.url ?? "", title: r.title ?? "" });
      }
    }
  };
  collect(aiOverview.references);
  for (const el of aiOverview.items ?? []) collect(el.references);

  const citedDomains = Array.from(new Set(refs.map((r) => r.domain).filter(Boolean)));
  return { present: true, citedDomains, references: refs };
}

// ---------------------------------------------------------------------------
// (B) CHATGPT ANSWER — what does ChatGPT say when asked this prompt? Returns the
//     answer text so we can detect whether a brand/competitors are mentioned.
// ---------------------------------------------------------------------------
export interface ChatGptAnswer {
  prompt: string;
  answer: string;
}

export async function chatGptAnswer(
  prompt: string,
  opts: { model?: string; countryIso?: string; city?: string } = {}
): Promise<ChatGptAnswer> {
  const { model = "gpt-4o-mini", countryIso, city } = opts;
  const task: Record<string, unknown> = {
    user_prompt: prompt,
    model_name: model,
    max_output_tokens: 1024,
    system_message: countryIso
      ? `You are a helpful assistant answering for a user located in ${countryIso}. Give accurate, up-to-date information relevant to that market.`
      : "You are a helpful assistant that provides accurate information.",
    web_search: true,
  };
  // Focus the model's web search on the AUDITED country so ChatGPT answers for
  // that market (e.g. Kenya), not the US default. Supported by ChatGPT models.
  if (countryIso) {
    task.web_search_country_iso_code = countryIso.toUpperCase();
    task.force_web_search = true;
    if (city) task.web_search_city = city;
  }
  const data = await post("/ai_optimization/chat_gpt/llm_responses/live", [task]);
  const items = data?.tasks?.[0]?.result?.[0]?.items ?? [];
  // The answer is in the "message" item's text section(s).
  let answer = "";
  for (const it of items) {
    if (it.type === "message") {
      for (const sec of it.sections ?? []) {
        if (sec.type === "text" && sec.text) answer += sec.text + "\n";
      }
    }
  }
  return { prompt, answer: answer.trim() };
}

// Ask several prompts in parallel; return their answers (best-effort). The
// countryIso grounds each answer to the audited market.
export async function chatGptAnswers(
  prompts: string[],
  opts: { countryIso?: string; city?: string } = {}
): Promise<ChatGptAnswer[]> {
  const results = await Promise.allSettled(prompts.map((p) => chatGptAnswer(p, opts)));
  return results
    .filter((r): r is PromiseFulfilledResult<ChatGptAnswer> => r.status === "fulfilled")
    .map((r) => r.value);
}

// ---------------------------------------------------------------------------
// (C) GEMINI ANSWER — same shape as ChatGPT, different endpoint/model family.
// Confirmed endpoint: ai_optimization/gemini/llm_responses/live.
// ---------------------------------------------------------------------------
export async function geminiAnswer(
  prompt: string,
  opts: { model?: string; countryIso?: string } = {}
): Promise<ChatGptAnswer> {
  const { model = "gemini-2.5-flash", countryIso } = opts;
  const task: Record<string, unknown> = {
    user_prompt: prompt,
    model_name: model,
    max_output_tokens: 1024,
    web_search: true,
    system_message: countryIso
      ? `You are a helpful assistant answering for a user located in ${countryIso}. Give accurate, up-to-date information relevant to that market.`
      : "You are a helpful assistant that provides accurate information.",
  };
  const data = await post("/ai_optimization/gemini/llm_responses/live", [task]);
  const items = data?.tasks?.[0]?.result?.[0]?.items ?? [];
  let answer = "";
  for (const it of items) {
    if (it.type === "message") {
      for (const sec of it.sections ?? []) {
        if (sec.type === "text" && sec.text) answer += sec.text + "\n";
      }
    }
  }
  return { prompt, answer: answer.trim() };
}

export async function geminiAnswers(
  prompts: string[],
  opts: { countryIso?: string } = {}
): Promise<ChatGptAnswer[]> {
  const results = await Promise.allSettled(prompts.map((p) => geminiAnswer(p, opts)));
  return results
    .filter((r): r is PromiseFulfilledResult<ChatGptAnswer> => r.status === "fulfilled")
    .map((r) => r.value);
}

// ---------------------------------------------------------------------------
// (D) PERPLEXITY ANSWER — Sonar models have web search on by default (no
// web_search flag needed/supported the same way as ChatGPT/Gemini/Claude).
// Confirmed endpoint: ai_optimization/perplexity/llm_responses/live (Live
// method only — Perplexity doesn't support Standard on this API).
// ---------------------------------------------------------------------------
export async function perplexityAnswer(
  prompt: string,
  opts: { model?: string } = {}
): Promise<ChatGptAnswer> {
  const { model = "sonar" } = opts;
  const task: Record<string, unknown> = {
    user_prompt: prompt,
    model_name: model,
    max_output_tokens: 1024,
  };
  const data = await post("/ai_optimization/perplexity/llm_responses/live", [task], 45_000);
  const items = data?.tasks?.[0]?.result?.[0]?.items ?? [];
  let answer = "";
  for (const it of items) {
    if (it.type === "message") {
      for (const sec of it.sections ?? []) {
        if (sec.type === "text" && sec.text) answer += sec.text + "\n";
      }
    }
  }
  return { prompt, answer: answer.trim() };
}

export async function perplexityAnswers(prompts: string[]): Promise<ChatGptAnswer[]> {
  const results = await Promise.allSettled(prompts.map((p) => perplexityAnswer(p)));
  return results
    .filter((r): r is PromiseFulfilledResult<ChatGptAnswer> => r.status === "fulfilled")
    .map((r) => r.value);
}

// ---------------------------------------------------------------------------
// (E) BROADER GOOGLE SERP SNAPSHOT — real organic position, People Also Ask,
// featured snippet (and whether the audited domain holds it), and knowledge
// panel presence, for one keyword. Confirmed endpoint:
// serp/google/organic/live/advanced.
// ---------------------------------------------------------------------------
export interface GoogleSerpSnapshotRaw {
  yourPosition: number | null;
  hasFeaturedSnippet: boolean;
  featuredSnippetIsYours: boolean;
  hasPeopleAlsoAsk: boolean;
  hasKnowledgePanel: boolean;
  topResults: { position: number; domain: string; title: string }[];
}

export async function googleOrganicSerp(
  keyword: string,
  locationCode: number,
  languageCode: string,
  targetDomain: string
): Promise<GoogleSerpSnapshotRaw> {
  const data = await post("/serp/google/organic/live/advanced", [
    { keyword, location_code: locationCode, language_code: languageCode, device: "desktop" },
  ]);
  const items: any[] = data?.tasks?.[0]?.result?.[0]?.items ?? [];
  const host = targetDomain.replace(/^www\./, "").toLowerCase();

  const organicItems = items.filter((it) => it.type === "organic");
  const topResults = organicItems.slice(0, 10).map((it) => ({
    position: it.rank_absolute ?? it.rank_group ?? 0,
    domain: String(it.domain ?? "").toLowerCase(),
    title: it.title ?? "",
  }));
  const yourResult = organicItems.find((it) => String(it.domain ?? "").toLowerCase().replace(/^www\./, "") === host);

  const featuredSnippet = items.find((it) => it.type === "featured_snippet");
  const featuredSnippetIsYours =
    !!featuredSnippet &&
    String(featuredSnippet.domain ?? "").toLowerCase().replace(/^www\./, "") === host;

  return {
    yourPosition: yourResult?.rank_absolute ?? yourResult?.rank_group ?? null,
    hasFeaturedSnippet: !!featuredSnippet,
    featuredSnippetIsYours,
    hasPeopleAlsoAsk: items.some((it) => it.type === "people_also_ask"),
    hasKnowledgePanel: items.some((it) => it.type === "knowledge_graph"),
    topResults,
  };
}

// ---------------------------------------------------------------------------
// (F) REAL GOOGLE ADS SEARCH VOLUME — actual advertiser-facing volume/CPC,
// not Ahrefs' independently-modelled estimate. Confirmed endpoint:
// keywords_data/google_ads/search_volume/live.
// ---------------------------------------------------------------------------
export async function googleAdsSearchVolume(
  keywords: string[],
  locationCode: number
): Promise<{ keyword: string; searchVolume: number | null; cpc: number | null }[]> {
  if (!keywords.length) return [];
  try {
    const data = await post("/keywords_data/google_ads/search_volume/live", [
      { location_code: locationCode, keywords: keywords.slice(0, 20) },
    ]);
    const items: any[] = data?.tasks?.[0]?.result ?? [];
    return items.map((it) => ({
      keyword: it.keyword ?? "",
      searchVolume: it.search_volume ?? null,
      cpc: it.cpc ?? null,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// (G) GOOGLE BUSINESS PROFILE — does this business have a Google Business
// Profile? Confirmed endpoint: business_data/google/my_business_info/live.
// Best-effort by design: a location-code-only lookup (no street address) can
// legitimately miss a real profile, so absence here means "not found with
// this business name at this location" rather than a certain "does not exist".
// ---------------------------------------------------------------------------
export interface GoogleBusinessProfileRaw {
  found: boolean;
  name?: string;
  rating?: number | null;
  reviewCount?: number | null;
  category?: string | null;
}

export async function googleBusinessProfile(
  businessName: string,
  locationCode: number,
  languageCode = "en"
): Promise<GoogleBusinessProfileRaw> {
  try {
    const data = await post("/business_data/google/my_business_info/live", [
      { keyword: businessName, location_code: locationCode, language_code: languageCode },
    ]);
    const task = data?.tasks?.[0];
    if (!task || task.status_code === 40102 /* No Search Results */) return { found: false };
    const result = task.result?.[0];
    if (!result || !result.items_count) return { found: false };
    const item = result.items?.[0];
    if (!item) return { found: false };
    return {
      found: true,
      name: item.title ?? businessName,
      rating: item.rating?.value ?? null,
      reviewCount: item.rating?.votes_count ?? null,
      category: item.category ?? null,
    };
  } catch {
    return { found: false };
  }
}
