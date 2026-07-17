// lib/geo/analyzer.ts
import type { GeoReport, AiOverviewCitation } from "@/types/audit";
import type { PageSignals } from "@/lib/seo/fetcher";
import { claudeJSON, MODELS } from "@/lib/providers/llm";

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * GEO analysis:
 *  - renderedContentRatio: how much text survives without JS (heuristic from HTML)
 *  - Claude judges LLM-readability + authority signals from the rendered text
 *  - AI Overview citations: probed via Claude web search (Ahrefs Standard has no
 *    direct AI-Overview SERP endpoint; Brand Radar is a separate purchase). We ask
 *    Claude (with web search) whether the brand tends to surface for each query.
 */
export async function analyzeGeo(
  signals: PageSignals,
  brand: string,
  probeQueries: string[]
): Promise<GeoReport> {
  const visibleText = stripTags(signals.html).slice(0, 12_000);

  // Heuristic rendered ratio: text length vs total HTML length (rough but useful).
  const ratio = signals.html.length
    ? Math.min(100, Math.round((stripTags(signals.html).length / signals.html.length) * 100 * 4))
    : 0;

  // Claude judgement of readability + authority
  let judged = {
    llmReadableScore: 60,
    authoritySignals: [] as string[],
    summary: "",
  };
  try {
    judged = await claudeJSON({
      model: MODELS.fast,
      system:
        "You are a Generative Engine Optimization (GEO) auditor. You assess how well an LLM can read a web page, identify the brand, and recognise authority/E-E-A-T signals.",
      prompt: `Brand: ${brand}
Page text (truncated):
"""${visibleText}"""

Return JSON: {"llmReadableScore": <0-100 how cleanly an LLM can parse this content>, "authoritySignals": [<short strings: e.g. "author bylines","client logos","case studies","credentials">], "summary": "<one sentence>"}`,
      maxTokens: 600,
    });
  } catch {
    /* keep defaults */
  }

  // AI Overview citation probe via Claude + web search.
  const citations: AiOverviewCitation[] = [];
  for (const q of probeQueries.slice(0, 3)) {
    try {
      const r = await claudeJSON<{ cited: boolean; competitors: string[] }>({
        model: MODELS.fast,
        system:
          "You check whether a brand is likely to appear in Google's AI Overview / top organic results for a query. Use web search to inform your answer.",
        prompt: `Query: "${q}"
Brand/domain to check: ${brand}
Return JSON: {"cited": <true if ${brand} appears in or would plausibly be cited by AI Overviews / top results for this query>, "competitors": [<up to 5 domains that DO appear>]}`,
        maxTokens: 400,
        webSearch: true,
      });
      citations.push({
        query: q,
        cited: !!r.cited,
        competitorsCited: (r.competitors ?? []).slice(0, 5),
      });
    } catch {
      citations.push({ query: q, cited: false, competitorsCited: [] });
    }
  }

  return {
    llmReadableScore: judged.llmReadableScore,
    renderedContentRatio: ratio,
    hasLlmsTxt: signals.llmsTxt,
    hasIdentitySchema: signals.hasIdentitySchema,
    hasOrganizationSchema: signals.hasOrganizationSchema,
    authoritySignals: judged.authoritySignals,
    aiOverviewCitations: citations,
    googleAiSearchPresence: citations.some((c) => c.cited),
  };
}
