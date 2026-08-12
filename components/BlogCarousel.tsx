"use client";
// components/BlogCarousel.tsx
// "Check our other articles" — a link-juice carousel of the latest Welcome
// Tomorrow blog posts, shown just above the FAQ on the RankTomorrow page.
//
//  - 3 cards visible at a time on desktop (1 on mobile, 2 on tablet).
//  - Right/left arrows advance one card at a time.
//  - Every card is a REAL <a href> to the individual article (passes SEO link
//    equity — not JS-only navigation).
//  - "View all articles" links to the blog index.
//  - Matches the existing dark glass-card aesthetic; no new styling system.

import { useState } from "react";
import type { BlogArticle } from "@/lib/blog";

const BLOG_INDEX = "https://welcometomorrow.io/blog/";

export function BlogCarousel({ articles }: { articles: BlogArticle[] }) {
  const [start, setStart] = useState(0);
  // Hide-on-empty: if the server fetch returned nothing, render nothing at all.
  if (!articles || articles.length === 0) return null;

  const perView = 3;
  const maxStart = Math.max(0, articles.length - perView);
  const canPrev = start > 0;
  const canNext = start < maxStart;

  const prev = () => setStart((s) => Math.max(0, s - 1));
  const next = () => setStart((s) => Math.min(maxStart, s + 1));

  return (
    <div className="mx-auto mt-24 max-w-6xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-wtgreen">From the blog</span>
          <h2 className="mt-3 font-display text-3xl font-extrabold leading-tight text-paper sm:text-4xl">
            Check our other articles
          </h2>
        </div>
        <a
          href={BLOG_INDEX}
          className="hidden shrink-0 rounded-lg border border-glassBorder bg-glass px-4 py-2 text-sm font-semibold text-paper transition hover:border-wtgreen/50 sm:inline-block"
        >
          View all articles &rarr;
        </a>
      </div>

      <div className="relative mt-10">
        {/* Track */}
        <div className="overflow-hidden">
          <div
            className="flex gap-5 transition-transform duration-500 ease-out"
            style={{ transform: `translateX(calc(-${start} * (100% + 1.25rem) / ${perView}))` }}
          >
            {articles.map((a, i) => (
              <a
                key={`${a.url}-${i}`}
                href={a.url}
                className="group flex w-full shrink-0 flex-col overflow-hidden rounded-xl2 border border-glassBorder bg-glass backdrop-blur-sm transition hover:border-wtgreen/50 sm:w-[calc((100%-1.25rem)/2)] lg:w-[calc((100%-2.5rem)/3)]"
              >
                {/* Image */}
                <div className="aspect-[16/10] w-full overflow-hidden bg-white/5">
                  {a.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.imageUrl}
                      alt={a.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl text-wtgreen/40">WT</div>
                  )}
                </div>
                {/* Body */}
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-center gap-2 text-xs text-muted">
                    {a.category && (
                      <span className="rounded bg-wtgreen/15 px-2 py-0.5 font-semibold text-wtgreen">{a.category}</span>
                    )}
                    {a.date && <span>{a.date}</span>}
                  </div>
                  <h3 className="mt-3 font-display text-lg font-bold leading-snug text-paper group-hover:text-wtgreen">
                    {a.title}
                  </h3>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-wtgreen">
                    Read article &rarr;
                  </span>
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* Arrows — only shown when there are more articles than fit */}
        {articles.length > perView && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={prev}
              disabled={!canPrev}
              aria-label="Previous articles"
              className="grid h-10 w-10 place-items-center rounded-full border border-glassBorder bg-glass text-paper transition enabled:hover:border-wtgreen/50 disabled:opacity-30"
            >
              &larr;
            </button>
            <button
              onClick={next}
              disabled={!canNext}
              aria-label="Next articles"
              className="grid h-10 w-10 place-items-center rounded-full border border-glassBorder bg-glass text-paper transition enabled:hover:border-wtgreen/50 disabled:opacity-30"
            >
              &rarr;
            </button>
          </div>
        )}
      </div>

      {/* Mobile "view all" (the header one is hidden on small screens) */}
      <div className="mt-8 text-center sm:hidden">
        <a href={BLOG_INDEX} className="rounded-lg border border-glassBorder bg-glass px-4 py-2 text-sm font-semibold text-paper">
          View all articles &rarr;
        </a>
      </div>
    </div>
  );
}
