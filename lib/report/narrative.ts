// lib/report/narrative.ts
// Claude writes a FEW short, targeted prose blurbs FROM the real audit data —
// it no longer structures the whole report (scores, tables, issues are now
// rendered directly from real data in pdf.ts). This keeps Claude's role to
// what it's good at (explaining), and keeps every number/table in the PDF
// exactly as computed, not re-typed through a model.

import { claudeJSON, MODELS } from "@/lib/providers/llm";
import type { ReportNarrative } from "./pdf";

export async function buildReportNarrative(input: {
  siteLabel: string;
  report: any;
  ai?: any;
}): Promise<ReportNarrative> {
  const { siteLabel, report, ai } = input;

  const digest = {
    site: siteLabel,
    readiness: report?.readiness,
    competitorComparison: report?.competitorComparison,
    failing: report?.checks?.filter((c: any) => c.status === "fail").map((c: any) => c.label).slice(0, 15),
    topIssues: (report?.siteIssues ?? [])
      .filter((i: any) => i.status === "checked" && i.affected?.length)
      .map((i: any) => ({ title: i.title, affected: i.affected.length }))
      .slice(0, 10),
    backlinks: report?.backlinks?.summary,
    topKeywords: (report?.keywords?.organic ?? []).slice(0, 5).map((k: any) => k.keyword),
    aiVisibility: ai
      ? {
          brand: ai.clientBrand,
          competitors: ai.competitors,
          shareOfVoice: ai.shareOfVoice,
          headline: ai.headline,
          sentiment: ai.overallSentiment,
        }
      : null,
  };

  try {
    const result = await claudeJSON<ReportNarrative>({
      model: MODELS.judge,
      system:
        "You are a senior SEO & AI-visibility consultant at Welcome Tomorrow writing SHORT explanatory blurbs for a client report. Use ONLY the data provided — never invent metrics, pages, or competitors. Be specific and reference real numbers. British English. No fluff, no headers, no markdown — plain prose only.",
      prompt: `Write these 4 short blurbs for ${siteLabel}'s report, grounded strictly in this data. Return JSON:
{
  "executiveSummary": "<2-3 sentences: overall readiness score + the single biggest opportunity>",
  "technicalSummary": "<1-2 sentences interpreting the top technical issues>",
  "aiVisibilitySummary": "<1-2 sentences on AI visibility vs competitors; empty string if no AI data provided>",
  "recommendationsIntro": "<1 sentence introducing the recommendations list>"
}

DATA:
${JSON.stringify(digest).slice(0, 12000)}`,
      maxTokens: 700,
      webSearch: false,
      timeoutMs: 20_000,
    });
    return {
      executiveSummary: result.executiveSummary ?? "",
      technicalSummary: result.technicalSummary ?? "",
      aiVisibilitySummary: result.aiVisibilitySummary ?? "",
      recommendationsIntro: result.recommendationsIntro ?? "",
    };
  } catch {
    // Best-effort defaults so the PDF still renders complete, real data even
    // if Claude's narrative pass fails for any reason.
    return {
      executiveSummary: `${siteLabel} scores ${report?.readiness?.overall ?? "-"}/100 overall readiness across technical, content, and AI-visibility factors.`,
      technicalSummary: "",
      aiVisibilitySummary: "",
      recommendationsIntro: "The following actions are prioritised by impact.",
    };
  }
}
