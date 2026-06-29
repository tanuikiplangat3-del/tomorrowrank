// lib/providers/llm.ts
// Wraps the Anthropic Claude API for two jobs:
//   1) GEO: judge how well an LLM can read/parse a page's content & authority.
//   2) AI Visibility: poll models for brand share-of-voice & sentiment.
//
// We use Claude as the primary judge. To capture true multi-engine "share of
// voice" you can ALSO wire OpenAI + Gemini here (see queryOpenAI / queryGemini
// stubs) and merge results in lib/ai-visibility/engine.ts.

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Model strings — verify current names at https://docs.claude.com/en/docs/about-claude/models
export const MODELS = {
  judge: "claude-opus-4-8",      // deep reasoning for GEO + strategy insights
  fast: "claude-haiku-4-5-20251001", // cheap, for many brand-mention probes
};

export async function claudeJSON<T = any>(opts: {
  model?: string;
  system?: string;
  prompt: string;
  maxTokens?: number;
  webSearch?: boolean;
}): Promise<T> {
  // The web_search server tool is typed loosely here; the API accepts it as-is.
  const tools = opts.webSearch
    ? ([{ type: "web_search_20250305", name: "web_search" }] as any)
    : undefined;

  const msg = await anthropic.messages.create({
    model: opts.model ?? MODELS.judge,
    max_tokens: opts.maxTokens ?? 2000,
    system:
      (opts.system ?? "") +
      "\nReturn ONLY valid minified JSON. No markdown, no backticks, no preamble.",
    messages: [{ role: "user", content: opts.prompt }],
    ...(tools ? { tools } : {}),
  });

  const text = msg.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  const clean = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(clean) as T;
  } catch {
    // last-ditch: extract first {...} block
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error("LLM did not return parseable JSON: " + clean.slice(0, 200));
  }
}

// --- Optional secondary engines for true multi-LLM share of voice ---
// Fill these in if you want OpenAI / Gemini polled alongside Claude.

export async function queryOpenAI(prompt: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return "";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1200,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) return "";
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

export async function queryGemini(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return "";
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: AbortSignal.timeout(60_000),
    }
  );
  if (!res.ok) return "";
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}
