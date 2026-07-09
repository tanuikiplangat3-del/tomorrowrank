// components/Landing.tsx — shared landing shell for external (/) and internal (/seo) entry.
import { AuditApp } from "@/components/AuditApp";
import { Nav } from "@/components/Nav";
import { SeoContent } from "@/components/SeoContent";
import { Footer } from "@/components/Footer";

export function Landing({ internal = false }: { internal?: boolean }) {
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

      <AuditApp internal={internal} />

      {/* SEO / GEO marketing content (public page only) */}
      {!internal && <SeoContent />}

      <Footer />
    </main>
  );
}
