// lib/providers/dataforseo-ai.ts
// DataForSEO integration using the endpoints VERIFIED on this account:
//   (A) SERP Google AI Mode (AI Overview) — serp/google/ai_mode/live/advanced
//       ~"$0.004/call. Returns the AI Overview + the sources it cites.
//   (B) ChatGPT LLM response — ai_optimization/chat_gpt/llm_responses/live
//       ~$0.004/call. Returns the actual ChatGPT answer to a prompt.
//
// Auth: HTTP Basic with login:password.
// These replace the earlier llm_mentions endpoints (which needed a $100/mo tier).

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
    signal: AbortSignal.timeout(35_000),
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
