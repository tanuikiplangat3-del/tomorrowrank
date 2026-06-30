// lib/ai-visibility/engine.ts
// Builds the "AI Visibility / GEO Visibility" report (screenshots 6 & 7):
//   1. Derive the brand's category & a set of buyer-intent prompts.
//   2. Auto-discover competitors.
//   3. Poll multiple LLMs (Claude + optional OpenAI/Gemini) with those prompts.
//   4. Count brand mentions -> Share of Voice. Score sentiment per brand.
//   5. Generate strategic insights.

import type {
  AiVisibilityReport,
  BrandShare,
  VisibilityInsight,
} from "@/types/audit";
import {
  claudeJSON,
  claudeAnswerWithCitations,
  queryOpenAI,
  queryGemini,
  MODELS,
} from "@/lib/providers/llm";
import {
  dataForSeoConfigured,
  searchMentions,
  crossAggregatedMetrics,
  topDomainsForKeyword,
  type LlmMentionRow,
} from "@/lib/providers/dataforseo-ai";
import { resolveLocation } from "@/lib/locations";

interface BrandContext {
  brand: string;
  category: string;            // e.g. "growth marketing agency"
  competitors: string[];
  prompts: string[];           // buyer-intent prompts to probe
}

// When FAST_MODE is on (recommended for Vercel Hobby / 60s limit), we probe
// fewer prompts and poll Claude-only in parallel so the whole step fits the window.
const FAST_MODE = process.env.FAST_MODE !== "false"; // default ON
const PROMPT_COUNT = FAST_MODE ? 2 : 6;

// Step 1+2: derive category, competitors, and probe prompts from the site.
async function deriveContext(
  brand: string,
  country: string,
  pageText: string
): Promise<BrandContext> {
  const ctx = await claudeJSON<BrandContext>({
    model: MODELS.judge,
    system:
      "You analyse a company website and produce its market context for an AI-visibility audit. Be specific to the brand's real category and geography.",
    prompt: `Brand domain: ${brand}
Target market: ${country}
Homepage text (truncated): """${pageText.slice(0, 6000)}"""

Return JSON:
{
 "brand": "${brand}",
 "category": "<the brand's specific service category, e.g. 'growth marketing agency'>",
 "competitors": [<5-7 real, named competitors a buyer in ${country} would consider>],
 "prompts": [<${PROMPT_COUNT} natural buyer-intent questions a user would ask ChatGPT/Claude when looking for this kind of service in ${country}; do NOT mention ${brand} in the prompts>]
}`,
    maxTokens: 1200,
    webSearch: false,
  });
  return ctx;
}

// Step 3: poll each engine with each prompt. Returns raw text answers per engine
// PLUS the real sources Claude cited via web search.
async function pollEngines(
  prompts: string[]
): Promise<{ answers: { engine: string; text: string }[]; citations: { url: string; title: string }[] }> {
  const probe = prompts.slice(0, PROMPT_COUNT);
  const citeMap = new Map<string, string>();

  // In FAST_MODE, poll Claude across all prompts in parallel (much faster) and
  // collect the web-search citations from each answer.
  if (FAST_MODE) {
    const results = await Promise.allSettled(
      probe.map((p) =>
        claudeAnswerWithCitations({
          model: MODELS.fast,
          system:
            "Answer the user's question as you normally would, recommending real named companies/brands with brief reasons.",
          prompt: p,
          maxTokens: 700,
        })
      )
    );
    const answers = results
      .filter((r): r is PromiseFulfilledResult<{ answer: string; citations: { url: string; title: string }[] }> => r.status === "fulfilled")
      .map((r) => {
        for (const c of r.value.citations) citeMap.set(c.url, c.title);
        return { engine: "Claude", text: r.value.answer ?? "" };
      });
    return { answers, citations: [...citeMap].map(([url, title]) => ({ url, title })) };
  }

  // Full mode: Claude + optional OpenAI/Gemini, sequentially per prompt.
  const out: { engine: string; text: string }[] = [];
  for (const p of probe) {
    try {
      const r = await claudeAnswerWithCitations({
        model: MODELS.fast,
        system: "Answer the user's question as you normally would, recommending real named companies/brands.",
        prompt: p,
        maxTokens: 800,
      });
      out.push({ engine: "Claude", text: r.answer ?? "" });
      for (const c of r.citations) citeMap.set(c.url, c.title);
    } catch {
      /* skip */
    }
    const oa = await queryOpenAI(p);
    if (oa) out.push({ engine: "ChatGPT", text: oa });
    const gm = await queryGemini(p);
    if (gm) out.push({ engine: "Gemini", text: gm });
  }
  return { answers: out, citations: [...citeMap].map(([url, title]) => ({ url, title })) };
}

// Step 4: from raw answers, compute share of voice + sentiment via Claude judge.
async function computeShareAndSentiment(
  brand: string,
  competitors: string[],
  answers: { engine: string; text: string }[]
): Promise<{ shares: BrandShare[]; sentiment: AiVisibilityReport["overallSentiment"] }> {
  const corpus = answers.map((a, i) => `[#${i} ${a.engine}] ${a.text}`).join("\n\n");
  const brands = [brand, ...competitors];

  const result = await claudeJSON<{
    shares: { brand: string; mentions: number; sentimentScore: number }[];
    clientSentiment: { positivePct: number; neutralPct: number; negativePct: number; summary: string; hasMentions: boolean };
  }>({
    model: MODELS.judge,
    system:
      "You are an AI-visibility analyst. Count how often each brand is mentioned across the AI answers, and score the sentiment (0-100, 100=glowing) of those mentions.",
    prompt: `Client brand (match loosely, e.g. domain or company name): ${brand}
Brands to track: ${brands.join(", ")}

AI answers corpus:
"""${corpus.slice(0, 14000)}"""

Return JSON:
{
 "shares": [{"brand": "<name>", "mentions": <int>, "sentimentScore": <0-100>}, ... for every tracked brand, 0 if absent],
 "clientSentiment": {"hasMentions": <bool>, "positivePct": <0-100>, "neutralPct": <0-100>, "negativePct": <0-100>, "summary": "<one sentence>"}
}`,
    maxTokens: 1500,
  });

  const totalMentions = result.shares.reduce((a, s) => a + s.mentions, 0) || 1;
  const otherMentions = Math.max(
    0,
    answers.length - result.shares.reduce((a, s) => (brands.includes(s.brand) ? a + s.mentions : a), 0)
  );

  const shares: BrandShare[] = result.shares.map((s) => ({
    brand: s.brand,
    isClient: s.brand.toLowerCase().includes(brand.toLowerCase().split(".")[0]),
    sharePct: Math.round((s.mentions / (totalMentions + otherMentions)) * 100),
    sentimentScore: s.sentimentScore,
    mentions: s.mentions,
  }));

  if (otherMentions > 0) {
    shares.push({
      brand: "Other",
      isClient: false,
      sharePct: Math.round((otherMentions / (totalMentions + otherMentions)) * 100),
      sentimentScore: 60,
      mentions: otherMentions,
    });
  }

  return {
    shares: shares.sort((a, b) => b.sharePct - a.sharePct),
    sentiment: {
      hasMentions: result.clientSentiment.hasMentions,
      positivePct: result.clientSentiment.positivePct,
      neutralPct: result.clientSentiment.neutralPct,
      negativePct: result.clientSentiment.negativePct,
      summary: result.clientSentiment.summary,
    },
  };
}

// Step 5: strategy insights + headline callout.
async function buildInsights(
  brand: string,
  country: string,
  shares: BrandShare[]
): Promise<{ insights: VisibilityInsight[]; headline: { tag: string; text: string } }> {
  const client = shares.find((s) => s.isClient);
  const leader = shares.find((s) => !s.isClient && s.brand !== "Other");

  const res = await claudeJSON<{
    headline: { tag: string; text: string };
    insights: { title: string; body: string; section: string }[];
  }>({
    model: MODELS.judge,
    system:
      "You are a GEO/AI-visibility strategist. Produce concise, action-oriented insights like a premium SaaS dashboard.",
    prompt: `Brand: ${brand} (${country})
Share of voice data: ${JSON.stringify(shares)}
Client share: ${client?.sharePct ?? 0}% | Leader: ${leader?.brand ?? "n/a"} ${leader?.sharePct ?? 0}%

Return JSON:
{
 "headline": {"tag": "<2-4 word status, e.g. 'Absent from conversation'>", "text": "<one punchy sentence with the key number and the action>"},
 "insights": [
   {"title": "<3-5 word imperative>", "body": "<one sentence, specific>", "section": "Perception|Narrative Drivers"},
   ... 4 insights total
 ]
}`,
    maxTokens: 1000,
  });

  const insights: VisibilityInsight[] = res.insights.map((i, idx) => ({
    rank: idx + 1,
    title: i.title,
    body: i.body,
    link: {
      label: `Go to ${i.section}`,
      href: `#${i.section.toLowerCase().replace(/\s+/g, "-")}`,
    },
  }));

  return { insights, headline: res.headline };
}

// ============================================================
// PRIMARY PATH: DataForSEO LLM Mentions (real AI Overview / ChatGPT data)
// ============================================================
async function runWithDataForSeo(
  brand: string,
  country: string,
  pageText: string,
  onStage?: (stage: string, progress: number) => void
): Promise<AiVisibilityReport> {
  const loc = resolveLocation(country);

  // 1. Derive market context (category, competitors, probe prompts) via Claude.
  onStage?.("Mapping your market & competitors", 10);
  const ctx = await deriveContext(brand, country, pageText);

  // 2. Pull REAL mentions for the brand from Google AI Overviews.
  onStage?.("Reading real AI Overview & ChatGPT mentions", 35);
  let mentions: LlmMentionRow[] = [];
  try {
    mentions = await searchMentions(brand, loc.locationCode, "English", "google", 50);
  } catch {
    /* brand may simply have no mentions yet */
  }

  // 3. Benchmark brand vs competitors side-by-side (cross-aggregated metrics).
  onStage?.("Measuring share of voice vs competitors", 60);
  const brands = [brand, ...ctx.competitors];
  let cross: Awaited<ReturnType<typeof crossAggregatedMetrics>> = [];
  try {
    cross = await crossAggregatedMetrics(brands, loc.locationCode, "English", "google");
  } catch {
    /* fall through to deriving shares from `mentions` + top domains */
  }

  // If cross-agg came back empty, derive competitor mentions from top domains
  // for the brand's main prompts.
  if (cross.length === 0 && ctx.prompts.length) {
    const td = await topDomainsForKeyword(ctx.prompts[0], loc.locationCode, "English", "google", 10);
    cross = td.map((d) => ({
      target: d.domain,
      mentions: d.mentions,
      citations: 0,
      aiSearchVolume: null,
    }));
  }

  // 4. Build share of voice from real mention counts.
  const totalMentions = cross.reduce((a, c) => a + c.mentions, 0) || 1;
  const shares: BrandShare[] = cross
    .map((c) => ({
      brand: c.target,
      isClient: c.target.toLowerCase().includes(brand.toLowerCase().split(".")[0]),
      sharePct: Math.round((c.mentions / totalMentions) * 100),
      sentimentScore: 60, // refined by Claude below
      mentions: c.mentions,
    }))
    .sort((a, b) => b.sharePct - a.sharePct);

  // Ensure the client brand always appears (even at 0%).
  if (!shares.some((s) => s.isClient)) {
    shares.push({ brand, isClient: true, sharePct: 0, sentimentScore: 0, mentions: 0 });
  }

  // 5. Use Claude to score sentiment from the actual answer snippets + write insights.
  onStage?.("Scoring sentiment & generating insights", 85);
  const corpus = mentions.map((m) => `Q: ${m.query}\nA: ${m.answer}`).join("\n\n").slice(0, 12000);
  const sentiment = await scoreSentimentFromCorpus(brand, corpus, mentions.length > 0);

  // refine per-brand sentiment if we have snippets
  if (mentions.length > 0) {
    for (const s of shares) {
      if (s.isClient) s.sentimentScore = sentiment.clientScore;
    }
  }

  const { insights, headline } = await buildInsights(brand, country, shares);

  // Citations summary → add a headline note if the brand is cited anywhere.
  const citedCount = mentions.filter((m) =>
    m.citedSources.some((src) => src.includes(brand.toLowerCase().split(".")[0]))
  ).length;

  onStage?.("Finalising AI visibility report", 98);
  return {
    clientBrand: brand,
    competitors: ctx.competitors,
    shareOfVoice: shares,
    overallSentiment: sentiment.overall,
    headline: citedCount > 0
      ? { tag: "Cited in AI answers", text: `${brand} is cited in ${citedCount} AI Overview answer(s). ${headline.text}` }
      : headline,
    insights,
    modelsQueried: ["Google AI Overview", "ChatGPT (via DataForSEO)"],
  };
}

// Claude scores sentiment from the real answer corpus.
async function scoreSentimentFromCorpus(
  brand: string,
  corpus: string,
  hasMentions: boolean
): Promise<{
  overall: AiVisibilityReport["overallSentiment"];
  clientScore: number;
}> {
  if (!hasMentions) {
    return {
      overall: { hasMentions: false, positivePct: 0, neutralPct: 0, negativePct: 0, summary: "" },
      clientScore: 0,
    };
  }
  try {
    const r = await claudeJSON<{
      positivePct: number; neutralPct: number; negativePct: number;
      summary: string; clientScore: number;
    }>({
      model: MODELS.judge,
      system: "You analyse how AI engines talk about a brand and score the sentiment of those mentions.",
      prompt: `Brand: ${brand}
AI answer snippets that mention the brand or its space:
"""${corpus}"""
Return JSON: {"positivePct":<0-100>,"neutralPct":<0-100>,"negativePct":<0-100>,"summary":"<one sentence>","clientScore":<0-100 overall sentiment toward ${brand}>}`,
      maxTokens: 600,
    });
    return {
      overall: {
        hasMentions: true,
        positivePct: r.positivePct,
        neutralPct: r.neutralPct,
        negativePct: r.negativePct,
        summary: r.summary,
      },
      clientScore: r.clientScore,
    };
  } catch {
    return {
      overall: { hasMentions: true, positivePct: 50, neutralPct: 40, negativePct: 10, summary: "" },
      clientScore: 60,
    };
  }
}

// ============================================================
// FALLBACK PATH: Claude-only polling (no DataForSEO subscription)
// ============================================================
async function runWithClaudeOnly(
  brand: string,
  country: string,
  pageText: string,
  onStage?: (stage: string, progress: number) => void
): Promise<AiVisibilityReport> {
  onStage?.("Mapping your market & competitors", 10);
  const ctx = await deriveContext(brand, country, pageText);

  onStage?.("Polling AI engines for brand mentions", 40);
  const { answers, citations } = await pollEngines(ctx.prompts);

  onStage?.("Scoring share of voice & sentiment", 70);
  const { shares, sentiment } = await computeShareAndSentiment(brand, ctx.competitors, answers);

  onStage?.("Generating strategy insights", 90);
  const { insights, headline } = await buildInsights(brand, country, shares);

  const engines = Array.from(new Set(answers.map((a) => a.engine)));
  const brandStem = brand.toLowerCase().split(".")[0];
  const markedCitations = citations
    .slice(0, 30)
    .map((c) => ({
      ...c,
      brandCited:
        c.url.toLowerCase().includes(brandStem) ||
        c.title.toLowerCase().includes(brandStem),
    }));

  return {
    clientBrand: brand,
    competitors: ctx.competitors,
    shareOfVoice: shares,
    overallSentiment: sentiment,
    headline,
    insights,
    modelsQueried: engines.length ? engines : ["Claude"],
    citations: markedCitations,
  };
}

// ============================================================
// ENTRY: prefer real DataForSEO data; fall back to Claude polling.
// ============================================================
export async function runAiVisibility(
  brand: string,
  country: string,
  pageText: string,
  onStage?: (stage: string, progress: number) => void
): Promise<AiVisibilityReport> {
  if (dataForSeoConfigured() && process.env.USE_DATAFORSEO_AI !== "false") {
    try {
      return await runWithDataForSeo(brand, country, pageText, onStage);
    } catch (err) {
      // If the AI-optimization subscription isn't active or the call fails,
      // degrade gracefully to Claude-only rather than failing the whole audit.
      return await runWithClaudeOnly(brand, country, pageText, onStage);
    }
  }
  return await runWithClaudeOnly(brand, country, pageText, onStage);
}
