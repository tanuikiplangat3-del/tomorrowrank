import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 });

    const cleanUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const domain = cleanUrl.split('/')[0].replace('www.', '');

    let siteText = "";
    try {
      const res = await fetch(`https://r.jina.ai/https://${cleanUrl}`, {
        headers: { Accept: "text/plain" },
        next: { revalidate: 3600 }
      });
      if (res.ok) siteText = (await res.text()).slice(0, 3000);
    } catch (err) {
      console.warn("Jina fetch failed.");
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Extract brandName (string) and targetPrompts (array of 3 commercial buyer search prompts). Return JSON: {"brandName": "...", "targetPrompts": ["...", "...", "..."]}"
        },
        { role: "user", content: `Target Domain: ${domain}\nSite Excerpt:\n${siteText}` }
      ]
    });

    const parsed = JSON.parse(completion.choices[0].message.content || '{}');
    return NextResponse.json({
      brandName: parsed.brandName || domain.split('.')[0],
      prompts: parsed.targetPrompts || [
        `Best software alternatives to ${domain}`,
        `Top tools for ${domain.split('.')[0]}`,
        `Who are the best providers for ${domain.split('.')[0]}?`
      ],
      domain
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
