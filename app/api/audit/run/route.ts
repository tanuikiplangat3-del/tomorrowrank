import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function queryPerplexity(prompt: string) {
  if (!process.env.PERPLEXITY_API_KEY) return { content: "", citations: [] };
  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [{ role: "system", content: "Recommend top brands with citations." }, { role: "user", content: prompt }]
      })
    });
    if (!res.ok) return { content: "", citations: [] };
    const data = await res.json();
    return { content: data.choices?.[0]?.message?.content || "", citations: data.citations || [] };
  } catch { return { content: "", citations: [] }; }
}

async function queryDataForSEO(keyword: string) {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return { content: "", citations: [] };
  const credentials = Buffer.from(`${login}:${password}`).toString("base64");
  try {
    const res = await fetch("https://api.dataforseo.com/v3/serp/google/organic/live/advanced", {
      method: "POST",
      headers: { "Authorization": `Basic ${credentials}`, "Content-Type": "application/json" },
      body: JSON.stringify([{ keyword, location_code: 2840, language_code: "en", device: "desktop" }])
    });
    if (!res.ok) return { content: "", citations: [] };
    const json = await res.json();
    const items = json?.tasks?.[0]?.result?.[0]?.items || [];
    const aiItem = items.find((i: any) => i.type === "ai_overview");
    if (!aiItem) return { content: "", citations: [] };
    return { content: aiItem.text || "", citations: (aiItem.items || []).map((ref: any) => ref.url).filter(Boolean) };
  } catch { return { content: "", citations: [] }; }
}

export async function POST(req: Request) {
  try {
    const { prompt, brandName, domain } = await req.json();

    const [pplxResult, dfseoResult] = await Promise.all([
      queryPerplexity(prompt),
      queryDataForSEO(prompt)
    ]);

    const enginesToAudit = [
      { name: "Perplexity", data: pplxResult },
      { name: "Google AI Overview", data: dfseoResult }
    ];

    let resultData = {
      engineQueriesCount: 0,
      targetMentions: 0,
      competitorMentions: 0,
      targetCitationsCount: 0,
      allCitationsCount: 0,
      sentiment: { positive: 0, neutral: 0, negative: 0 },
      competitors: {} as Record<string, number>,
      citationsFound: [] as any[],
      queries: [] as any[]
    };

    for (const engine of enginesToAudit) {
      if (!engine.data.content) continue;
      resultData.engineQueriesCount++;

      for (const link of engine.data.citations) {
        resultData.allCitationsCount++;
        if (link.includes(domain)) {
          resultData.targetCitationsCount++;
          resultData.citationsFound.push({ url: link, engine: engine.name });
        }
      }

      const evalRes = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `Evaluate AI response for visibility of '${brandName}'. Return JSON: {"targetBrandMentioned": boolean, "targetSentiment": "positive"|"neutral"|"negative"|"not_mentioned", "competitors": ["brand1"], "snippetSummary": "summary"}` },
          { role: "user", content: engine.data.content }
        ]
      });

      const analysis = JSON.parse(evalRes.choices[0].message.content || '{}');
      if (analysis.targetBrandMentioned) {
        resultData.targetMentions++;
        if (analysis.targetSentiment === 'positive') resultData.sentiment.positive++;
        if (analysis.targetSentiment === 'neutral') resultData.sentiment.neutral++;
        if (analysis.targetSentiment === 'negative') resultData.sentiment.negative++;
      }

      (analysis.competitors || []).forEach((c: string) => {
        resultData.competitors[c] = (resultData.competitors[c] || 0) + 1;
        resultData.competitorMentions++;
      });

      resultData.queries.push({
        prompt,
        engine: engine.name,
        targetMentioned: analysis.targetBrandMentioned,
        sentiment: analysis.targetSentiment,
        summary: analysis.snippetSummary,
        competitors: analysis.competitors || []
      });
    }

    return NextResponse.json(resultData);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
