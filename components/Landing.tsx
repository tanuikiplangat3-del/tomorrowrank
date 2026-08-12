// components/Landing.tsx — shared landing shell for external (/) and internal (/seo) entry.
import { AuditApp } from "@/components/AuditApp";
import { Nav } from "@/components/Nav";
import { SeoContent } from "@/components/SeoContent";
import { Footer } from "@/components/Footer";
import { getLatestArticles } from "@/lib/blog";

export async function Landing({ internal = false, initialUrl = "" }: { internal?: boolean; initialUrl?: string }) {
  // Fetch latest blog articles server-side (public page only). Cached ~1h,
  // hides itself on failure — never blocks the page.
  const articles = internal ? [] : await getLatestArticles();

  return (
    <main className="relative min-h-screen">
      <Nav />

      {internal && (
        <div className="relative z-10 mx-auto max-w-3xl px-4">
          <div className="rounded-lg border border-wtgreen/40 bg-wtgreen/10 px-4 py-2 text-center text-xs font-semibold text-wtgreen">
            Internal team view — full report, no lead gate.
          </div>
        </div>
      )}

      <AuditApp internal={internal} initialUrl={initialUrl} />

      {/* SEO / GEO marketing content (public page only) */}
      {!internal && <SeoContent articles={articles} />}

      <Footer />
    </main>
  );
}
