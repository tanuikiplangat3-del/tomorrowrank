"use client";
// components/SeoContent.tsx : SEO/GEO marketing content rendered below the tool.
// Follows the Welcome Tomorrow dark aesthetic (glass cards, wtgreen accents,
// Outfit type). Includes an accessible FAQ accordion (answers live in the DOM
// for SEO) and FAQPage JSON-LD structured data.
import { useState } from "react";
import { BOOKING_URL } from "./Gate";

const STEPS = [
  {
    n: "01",
    title: "Enter your URL",
    body: "Just your website. Paste the URL, enter your details to receive the report, and we take it from there.",
  },
  {
    n: "02",
    title: "We crawl & analyze",
    body: "RankTomorrow scans your technical setup, content, schema, social signals, and bot access across several SEO and GEO dimensions.",
  },
  {
    n: "03",
    title: "Get your SEO, GEO & AI visibility score",
    body: "See exactly how Google and AI engines like ChatGPT, Claude, and Perplexity perceive your site.",
  },
  {
    n: "04",
    title: "See recommendations & fix what matters",
    body: "Follow prioritized, actionable recommendations to boost your SEO, citations, and AI visibility.",
  },
];

const FAQS = [
  {
    q: "What is a free SEO & GEO audit tool?",
    a: "A free SEO and GEO audit tool checks how well your website is set up to be found, understood, and recommended by both traditional search engines and AI answer engines. SEO covers the classic Google signals like titles, headings, links, and site health, while GEO (generative engine optimization) looks at how likely AI systems such as ChatGPT, Claude, and Perplexity are to cite your pages. RankTomorrow combines both in a single report so you can see your whole search picture in one place, at no cost.",
  },
  {
    q: "How does the SEO & GEO audit analyze my content?",
    a: "When you submit your URL, RankTomorrow crawls a sample of your pages and reads the same signals a search crawler and an AI model would see, including your titles, headings, meta descriptions, structured data, internal links, and how much real text is visible to bots. It then asks leading AI engines the kinds of questions your customers would ask and checks whether your brand and pages are mentioned or cited. The result is a grounded view of both your on-page SEO and your presence inside AI generated answers.",
  },
  {
    q: "What metrics does the SEO & GEO audit check?",
    a: "The audit grades your site across several dimensions, including on-page SEO such as titles, headings, meta tags, and content depth, technical health such as crawlability, robots rules, sitemaps, and page speed signals, structured data and schema, social and Open Graph cards, backlinks and off-page authority, and AI visibility such as Google AI Overview presence and citations from ChatGPT, Claude, and Perplexity. Each area rolls up into a clear score with the specific pages and issues behind it.",
  },
  {
    q: "Why is SEO & GEO auditing important for AI search?",
    a: "Search is shifting from a list of blue links to direct answers written by AI, and those answers only reference sources the models can read, trust, and understand. If your pages are hard to crawl, thin on clear content, or missing structured data, you can rank in classic search yet still be invisible inside AI answers. Auditing for both SEO and GEO shows you where you already win and where you are being left out, so you can protect the traffic you have and earn a place in the answers your future customers will rely on.",
  },
  {
    q: "How can I improve my SEO & GEO audit score?",
    a: "Start with the prioritized recommendations in your report, since they are ordered by impact. Common wins include tightening your titles and meta descriptions, giving every page a single clear H1, adding structured data so machines understand your content, making sure important pages are not blocked from crawlers, and publishing genuinely useful content that answers real questions in plain language. As you fix these, your pages become easier for both Google and AI engines to read and cite, which lifts your score over time.",
  },
  {
    q: "Want continuous SEO & GEO monitoring?",
    a: "One off audits are a great starting point, but search and AI answers change constantly, so ongoing monitoring is where the real gains come from. Welcome Tomorrow can track your SEO and GEO performance over time, watch how often AI engines cite you, and keep your recommendations up to date as algorithms evolve. If you want continuous visibility rather than a single snapshot, talk with our team and we will set up monitoring tailored to your site.",
  },
];

function faqSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function SeoContent() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <section className="relative z-10 mx-auto max-w-6xl px-4 py-20 sm:py-28">
      {/* FAQ structured data for rich results */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema()) }} />

      {/* HOW IT WORKS */}
      <div className="mx-auto max-w-3xl text-center">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-wtgreen">How it works</span>
        <h2 className="mt-3 font-display text-3xl font-extrabold leading-tight text-paper sm:text-4xl">
          A full analysis in under a minute
        </h2>
        <p className="mt-4 text-lg text-muted">
          Our free SEO &amp; GEO audit runs a full analysis of your site against six AI-search dimensions
          and returns an actionable report in under a minute.
        </p>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s) => (
          <div
            key={s.n}
            className="flex flex-col rounded-xl2 border border-glassBorder bg-glass p-6 backdrop-blur-sm transition hover:border-wtgreen/50"
          >
            <span className="font-display text-4xl font-extrabold text-wtgreen/80">{s.n}</span>
            <h3 className="mt-4 font-display text-lg font-bold text-paper">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
          </div>
        ))}
      </div>

      {/* FAQ */}
      <div className="mx-auto mt-24 max-w-3xl">
        <div className="text-center">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-wtgreen">FAQ</span>
          <h2 className="mt-3 font-display text-3xl font-extrabold leading-tight text-paper sm:text-4xl">
            Frequently asked questions
          </h2>
          <p className="mt-4 text-lg text-muted">
            Everything you need to know about SEO &amp; GEO audits and optimizing for AI search engines.
          </p>
        </div>

        <div className="mt-10 space-y-3">
          {FAQS.map((f, i) => {
            const isOpen = openFaq === i;
            return (
              <div key={i} className="overflow-hidden rounded-xl2 border border-glassBorder bg-glass">
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-white/[0.03]"
                  aria-expanded={isOpen}
                >
                  <span className="font-display text-base font-semibold text-paper sm:text-lg">{f.q}</span>
                  <span className={`shrink-0 text-wtgreen transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`}>
                    +
                  </span>
                </button>
                <div
                  className="grid transition-all duration-300 ease-out"
                  style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 pb-5 text-sm leading-relaxed text-muted sm:text-base">{f.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CLOSING CTA */}
      <div className="mx-auto mt-24 max-w-4xl overflow-hidden rounded-xl2 border border-wtgreen/30 bg-wtgreen/[0.07] p-8 text-center sm:p-12">
        <h2 className="font-display text-3xl font-extrabold leading-tight text-paper sm:text-4xl">
          Move beyond one-off audits
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
          RankTomorrow currently audits up to 50 pages per run. If your website is larger than 50 pages,
          or is highly secured (for example, protected by Cloudflare), talk with our experts and we will
          audit the full site for you.
        </p>
        <a
          href={BOOKING_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-wtgreen px-8 py-4 text-base font-bold text-white transition hover:bg-wtgreenDeep"
        >
          Talk with one of our experts →
        </a>
      </div>
    </section>
  );
}
