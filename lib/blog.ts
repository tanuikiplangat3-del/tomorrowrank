// lib/blog.ts
// Server-side fetch of the latest Welcome Tomorrow blog articles from the
// WordPress REST API, for the "Check our other articles" carousel shown just
// above the FAQ on the RankTomorrow marketing page.
//
// Design decisions (per the build brief):
//  - LIVE fetch (Option A): a brand-new blog post appears automatically, no
//    redeploy needed.
//  - Cached in-process for ~1 hour so we don't hit WordPress on every single
//    page load (the marketing page can be hit a lot).
//  - HIDE-ON-FAILURE: if WordPress is slow/down/misshapen, this returns an
//    empty array and the carousel simply doesn't render — it NEVER throws or
//    blocks the page. The audit tool must never break because a blog fetch
//    failed.

export interface BlogArticle {
  title: string;
  url: string;
  date: string;          // human-readable, e.g. "06 Aug 2026"
  imageUrl: string | null;
  category: string | null;
}

const WP_ENDPOINT =
  "https://welcometomorrow.io/wp-json/wp/v2/posts?per_page=9&_embed";
const CACHE_MS = 60 * 60 * 1000; // 1 hour

let cache: { at: number; articles: BlogArticle[] } | null = null;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

// WordPress titles come HTML-encoded (e.g. &amp;, &#8217;). Decode the common
// entities so the carousel shows clean text.
function decodeEntities(s: string): string {
  return (s || "")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;/g, "\u2019")
    .replace(/&#8216;/g, "\u2018")
    .replace(/&#8220;/g, "\u201c")
    .replace(/&#8221;/g, "\u201d")
    .replace(/&#038;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, "")
    .trim();
}

export async function getLatestArticles(): Promise<BlogArticle[]> {
  // Serve from cache if fresh.
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return cache.articles;
  }

  try {
    const res = await fetch(WP_ENDPOINT, {
      signal: AbortSignal.timeout(6000),
      headers: {
        // Some WordPress security plugins / CDN rules reject requests with a
        // missing or non-browser User-Agent. Send a normal browser UA + Accept
        // so the REST call isn't mistaken for an unwanted bot and 403'd.
        "User-Agent":
          "Mozilla/5.0 (compatible; RankTomorrow/1.0; +https://tools.welcometomorrow.io/ranktomorrow)",
        Accept: "application/json",
      },
      // Next.js server fetch: also let the framework cache it for an hour.
      next: { revalidate: 3600 },
    } as any);
    if (!res.ok) throw new Error(`WP responded ${res.status}`);

    const posts = (await res.json()) as any[];
    const articles: BlogArticle[] = (Array.isArray(posts) ? posts : [])
      .map((p) => {
        // Featured image (if present) lives in _embedded["wp:featuredmedia"].
        let imageUrl: string | null = null;
        const media = p?._embedded?.["wp:featuredmedia"]?.[0];
        if (media?.source_url) imageUrl = media.source_url;

        // First category term (skip the generic "Uncategorized").
        let category: string | null = null;
        const terms = p?._embedded?.["wp:term"]?.[0];
        if (Array.isArray(terms)) {
          const real = terms.find(
            (t: any) => t?.name && !/uncategor/i.test(t.name)
          );
          category = real?.name ?? terms[0]?.name ?? null;
        }

        return {
          title: decodeEntities(p?.title?.rendered ?? ""),
          url: typeof p?.link === "string" ? p.link : "",
          date: formatDate(p?.date ?? ""),
          imageUrl,
          category,
        };
      })
      .filter((a) => a.title && a.url);

    // Only overwrite the cache with a genuinely useful result.
    if (articles.length) cache = { at: Date.now(), articles };
    return articles;
  } catch {
    // Hide-on-failure: never throw. Return stale cache if we have one, else [].
    return cache?.articles ?? [];
  }
}
