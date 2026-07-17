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
  googleAiOverview,
  chatGptAnswers,
} from "@/lib/providers/dataforseo-ai";
import { resolveLocation } from "@/lib/locations";

interface BrandContext {
  brand: string;
  category: string;            // e.g. "growth marketing agency"
  scope?: string;              // real market scope, e.g. "Africa", "Kenya", "global"
  competitors: string[];
  prompts: string[];           // buyer-intent prompts to probe
}

// Public tool: richer AI-visibility picture (Option B). 5 buyer-intent prompts
// per audit gives a convincing result. Cost ~ 5 x $0.004 + AI Overview ~$0.004
// = ~$0.024/audit — fine for a lead-gen tool. Tune PROMPT_COUNT to trade
// depth vs cost.
const FAST_MODE = process.env.FAST_MODE !== "false"; // parallel polling, still on
const PROMPT_COUNT = 5;

// Step 1+2: derive category, competitors, and probe prompts from the site.
async function deriveContext(
  brand: string,
  country: string,
  pageText: string
): Promise<BrandContext> {
  const ctx = await claudeJSON<BrandContext>({
    model: MODELS.judge,
    system:
      "You analyse a company website and produce its market context for an AI-visibility audit. First determine the brand's real GEOGRAPHIC SCOPE from its own content — do not assume it only serves the visitor's country. A brand may be city/local, national, regional (e.g. 'East Africa', 'Africa', 'the Gulf', 'Southeast Asia'), or global. Then make the category, competitors, and buyer-intent prompts match that real scope.",
    prompt: `Brand domain: ${brand}
Visitor's country (for reference only — the brand may serve a wider area): ${country}
Homepage text (truncated): """${pageText.slice(0, 6000)}"""

Determine the brand's real market scope from what the site actually says about who it serves. If the site positions itself continent- or region-wide (e.g. "we help brands across Africa"), the scope is that region, NOT the visitor's single country. If it clearly serves one country or city, use that.

Return JSON:
{
 "brand": "${brand}",
 "scope": "<the brand's real market, e.g. 'Africa', 'East Africa', 'Kenya', 'global', 'London UK'>",
 "category": "<the brand's specific service category, e.g. 'growth marketing agency'>",
 "competitors": [<5-7 real, named competitors a buyer in that SCOPE would actually consider — regional/global players if the scope is regional/global, not only local ones>],
 "prompts": [<${PROMPT_COUNT} natural buyer-intent questions someone in that SCOPE would ask ChatGPT/Claude when looking for this kind of service; phrase them for the real scope (e.g. "...in Africa" not "...in Kenya" when the brand is Africa-wide); do NOT mention ${brand} in the prompts>]
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
): Promise<{ answers: { engine: string; text: string; prompt: string }[]; citations: { url: string; title: string }[] }> {
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
      .map((r, i) => ({ r, prompt: probe[i] }))
      .filter((x): x is { r: PromiseFulfilledResult<{ answer: string; citations: { url: string; title: string }[] }>; prompt: string } => x.r.status === "fulfilled")
      .map(({ r, prompt }) => {
        for (const c of r.value.citations) citeMap.set(c.url, c.title);
        return { engine: "Claude", text: r.value.answer ?? "", prompt };
      });
    return { answers, citations: [...citeMap].map(([url, title]) => ({ url, title })) };
  }

  // Full mode: Claude + optional OpenAI/Gemini, sequentially per prompt.
  const out: { engine: string; text: string; prompt: string }[] = [];
  for (const p of probe) {
    try {
      const r = await claudeAnswerWithCitations({
        model: MODELS.fast,
        system: "Answer the user's question as you normally would, recommending real named companies/brands.",
        prompt: p,
        maxTokens: 800,
      });
      out.push({ engine: "Claude", text: r.answer ?? "", prompt: p });
      for (const c of r.citations) citeMap.set(c.url, c.title);
    } catch {
      /* skip */
    }
    const oa = await queryOpenAI(p);
    if (oa) out.push({ engine: "ChatGPT", text: oa, prompt: p });
    const gm = await queryGemini(p);
    if (gm) out.push({ engine: "Gemini", text: gm, prompt: p });
  }
  return { answers: out, citations: [...citeMap].map(([url, title]) => ({ url, title })) };
}

// Step 4: from raw answers, compute share of voice + sentiment via Claude judge.
async function computeShareAndSentiment(
  brand: string,
  competitors: string[],
  answers: { engine: string; text: string; prompt: string }[]
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
// PRIMARY PATH: DataForSEO — real ChatGPT answers + real Google AI Overview
// (uses the endpoints verified on this account, not the llm_mentions tier).
// ============================================================
async function runWithDataForSeo(
  brand: string,
  country: string,
  pageText: string,
  onStage?: (stage: string, progress: number) => void
): Promise<AiVisibilityReport> {
  const loc = resolveLocation(country);
  const countryIso = loc.countryCode || undefined; // ISO-2 for ChatGPT web-search grounding

  // 1. Derive market context (category, competitors, buyer-intent prompts).
  onStage?.("Mapping your market & competitors", 10);
  const ctx = await deriveContext(brand, country, pageText);

  // 2. FEATURE B — ask ChatGPT the real buyer-intent prompts (via DataForSEO),
  //    grounding ChatGPT's web search to the AUDITED country (not the US default).
  onStage?.("Asking ChatGPT what it recommends", 35);
  const gptAnswers = await chatGptAnswers(ctx.prompts.slice(0, PROMPT_COUNT), { countryIso });

  // 3. FEATURE A — check the real Google AI Overview for the brand's category,
  //    but ONLY when we have the audited country's real DataForSEO location code.
  //    We never fall back to USA — showing US AI-Overview data for a non-US audit
  //    would be misleading, so we skip it instead.
  onStage?.("Reading Google AI Overview citations", 60);
  let aiOverview: Awaited<ReturnType<typeof googleAiOverview>> = {
    present: false, citedDomains: [], references: [],
  };
  if (loc.locationCode) {
    try {
      aiOverview = await googleAiOverview(ctx.category, loc.locationCode);
    } catch {
      /* no AI overview / call failed */
    }
  } else {
    console.warn(`[ai-visibility] no DataForSEO location code for "${country}" — skipping AI Overview to avoid wrong-country data.`);
  }

  // 4. Probes from the REAL ChatGPT answers.
  const brandStem = brand.toLowerCase().split(".")[0];
  const probes = gptAnswers.map((a) => ({
    engine: "ChatGPT",
    prompt: a.prompt,
    answer: (a.answer || "").slice(0, 600),
    brandCited: (a.answer || "").toLowerCase().includes(brandStem),
  }));

  // 5. Citations = the real domains Google's AI Overview cited.
  const citations = aiOverview.references.slice(0, 30).map((r) => ({
    url: r.url,
    title: r.title || r.domain,
    brandCited: r.domain.includes(brandStem),
  }));

  // 6. Share of voice + sentiment, judged by Claude from the REAL answers.
  onStage?.("Scoring share of voice & sentiment", 80);
  const answersForJudge = gptAnswers.map((a) => ({ engine: "ChatGPT", text: a.answer, prompt: a.prompt }));
  const judged =
    answersForJudge.length > 0
      ? await computeShareAndSentiment(brand, ctx.competitors, answersForJudge)
      : { shares: [{ brand, isClient: true, sharePct: 0, sentimentScore: 0, mentions: 0 }] as BrandShare[],
          sentiment: { hasMentions: false, positivePct: 0, neutralPct: 0, negativePct: 0, summary: "" } };
  const shares = judged.shares;
  const sentiment = judged.sentiment;

  onStage?.("Generating strategy insights", 92);
  const { insights, headline } = await buildInsights(brand, country, shares);

  const aiHeadline = aiOverview.present && !aiOverview.citedDomains.some((d) => d.includes(brandStem))
    ? { tag: "Absent from Google AI", text: `Google shows an AI Overview for "${ctx.category}" citing ${aiOverview.citedDomains.length} sources - ${brand} is not one of them. ${headline.text}` }
    : headline;

  onStage?.("Finalising AI visibility report", 98);
  return {
    clientBrand: brand,
    competitors: ctx.competitors,
    shareOfVoice: shares,
    overallSentiment: sentiment,
    headline: aiHeadline,
    insights,
    modelsQueried: ["ChatGPT (DataForSEO)", "Google AI Overview (DataForSEO)"],
    citations,
    probes,
  };
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

  const brandStem2 = brand.toLowerCase().split(".")[0];
  const probes = answers.slice(0, 8).map((a) => ({
    engine: a.engine,
    prompt: a.prompt,
    answer: (a.text || "").slice(0, 600),
    brandCited: (a.text || "").toLowerCase().includes(brandStem2),
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
    probes,
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
  // COST CONTROL: DataForSEO (live ChatGPT + AI Overview queries) is now OPT-IN.
  // It only runs when USE_DATAFORSEO_AI is explicitly "true". By default we use the
  // free Claude-only path so no DataForSEO credits are spent. Flip the env var to
  // "true" to re-enable live AI-engine data.
  if (dataForSeoConfigured() && process.env.USE_DATAFORSEO_AI === "true") {
    try {
      console.log("[ai-visibility] engine=dataforseo (live ChatGPT + AI Overview)");
      return await runWithDataForSeo(brand, country, pageText, onStage);
    } catch (err) {
      console.error("[ai-visibility] DataForSEO failed, falling back to Claude-only:", err);
      return await runWithClaudeOnly(brand, country, pageText, onStage);
    }
  }
  console.log("[ai-visibility] engine=claude-only (DataForSEO disabled — no credits spent)");
  return await runWithClaudeOnly(brand, country, pageText, onStage);
}
