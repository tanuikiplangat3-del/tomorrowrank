// components/Landing.tsx — shared landing shell for external (/) and internal (/seo) entry.
import Image from "next/image";
import { AuditApp } from "@/components/AuditApp";

export function Landing({ internal = false }: { internal?: boolean }) {
  return (
    <main className="relative min-h-screen">
      {/* Top nav — transparent, floating over the warped-grid canvas */}
      <nav className="relative z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
          <a href="https://welcometomorrow.io" className="flex items-center" aria-label="Welcome Tomorrow">
            <Image
              src="/welcome-tomorrow-logo.png"
              alt="Welcome Tomorrow"
              width={362}
              height={117}
              priority
              className="h-9 w-auto md:h-10"
            />
          </a>
          <div className="hidden items-center gap-8 text-sm font-semibold text-paper md:flex">
            <a href="https://welcometomorrow.io" className="transition hover:text-wtgreen">Services</a>
            <a href="https://welcometomorrow.io" className="transition hover:text-wtgreen">Expertise</a>
            <a href="https://welcometomorrow.io" className="transition hover:text-wtgreen">About us</a>
            <a href="https://welcometomorrow.io" className="transition hover:text-wtgreen">Blog</a>
            <a
              href="https://welcometomorrow.io/contact"
              className="rounded-lg border border-white/30 px-4 py-2 transition hover:border-wtgreen hover:text-wtgreen"
            >
              Let&apos;s talk →
            </a>
          </div>
        </div>
      </nav>

      {internal && (
        <div className="relative z-10 mx-auto max-w-3xl px-4">
          <div className="rounded-lg border border-wtgreen/40 bg-wtgreen/10 px-4 py-2 text-center text-xs font-semibold text-wtgreen">
            Internal team view — full report, no lead gate.
          </div>
        </div>
      )}

      <AuditApp internal={internal} />

      <footer className="relative z-10 mt-10 border-t border-white/10 py-8 text-center text-sm text-muted">
        RankTomorrow — SEO &amp; AI Visibility Audit Tool ·{" "}
        <a href="https://welcometomorrow.io" className="font-semibold text-wtgreen hover:underline">
          welcometomorrow.io
        </a>
      </footer>
    </main>
  );
}
