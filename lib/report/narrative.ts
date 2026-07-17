// lib/report/narrative.ts
// Uses Claude to turn the REAL audit data (scores, issues, backlinks, AI
// visibility) into a precise, client-ready narrative. Claude only structures and
// explains the data it is given — it must not invent findings.

import { claudeJSON, MODELS } from "@/lib/providers/llm";
import type { ReportContent } from "./pdf";

export async function buildReportNarrative(input: {
  siteLabel: string;
  report: any;
  ai?: any;
}): Promise<ReportContent> {
  const { siteLabel, report, ai } = input;

  // Condense the data so Claude works from facts, not the whole payload.
  const digest = {
    site: siteLabel,
    overall: report?.overall,
    categories: (report?.categories ?? []).map((c: any) => ({ category: c.category, score: c.score, grade: c.grade })),
    failing: report?.checks?.filter((c: any) => c.status === "fail").map((c: any) => c.label).slice(0, 20),
    warnings: report?.checks?.filter((c: any) => c.status === "warn").map((c: any) => c.label).slice(0, 20),
    recommendations: (report?.recommendations ?? []).slice(0, 20),
    backlinks: report?.backlinks?.summary,
    topKeywords: (report?.keywords?.organic ?? []).slice(0, 10),
    siteIssues: (report?.siteIssues ?? [])
      .filter((i: any) => i.status === "checked" && i.affected?.length)
      .map((i: any) => ({ title: i.title, affected: i.affected.length, priority: i.priority }))
      .slice(0, 25),
    aiVisibility: ai
      ? {
          brand: ai.clientBrand,
          competitors: ai.competitors,
          shareOfVoice: ai.shareOfVoice,
          headline: ai.headline,
          citations: (ai.citations ?? []).slice(0, 10),
          probes: (ai.probes ?? []).map((p: any) => ({ prompt: p.prompt, brandCited: p.brandCited })),
          insights: ai.insights,
        }
      : null,
  };

  const content = await claudeJSON<ReportContent>({
    model: MODELS.judge,
    system:
      "You are a senior SEO & AI-visibility consultant at Welcome Tomorrow writing a client report. Use ONLY the data provided — never invent metrics, pages, or competitors. Be specific, precise, and actionable. Reference real numbers from the data. British English. No fluff.",
    prompt: `Write a professional audit report for ${siteLabel} from this data. Return JSON matching:
{
 "title": "SEO & AI Visibility Report — ${siteLabel}",
 "subtitle": "<one line with the overall grade/score>",
 "intro": "<2-3 sentence executive summary grounded in the data>",
 "sections": [
   {"heading":"Overall Health","body":"<interpret the overall score + category scores>"},
   {"heading":"Technical & On-Page Findings","body":"<summary>","bullets":[<the most important real issues with counts>]},
   {"heading":"Backlinks & Authority","body":"<interpret backlink summary + domain rating>"},
   {"heading":"AI Visibility (ChatGPT & Google AI Overviews)","body":"<whether the brand appears in AI answers vs competitors, using the real probe/citation/share-of-voice data; if no AI data, say it wasn't available>"},
   {"heading":"Priority Recommendations","body":"<intro>","bullets":[<5-8 concrete prioritised actions grounded in the findings>]}
 ]
}

DATA:
${JSON.stringify(digest).slice(0, 14000)}`,
    maxTokens: 2500,
    webSearch: false,
  });

  // Defensive defaults so the PDF never renders empty.
  if (!content.title) content.title = `SEO & AI Visibility Report — ${siteLabel}`;
  if (!Array.isArray(content.sections)) content.sections = [];
  return content;
}
