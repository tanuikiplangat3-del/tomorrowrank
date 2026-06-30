// app/page.tsx — landing + tool entry, Welcome Tomorrow dark hero theme.
import { AuditApp } from "@/components/AuditApp";
import { GridBackground } from "@/components/GridBackground";

export default function Home() {
  return (
    <main className="relative min-h-screen text-white">
      <GridBackground />

      {/* Top nav */}
      <nav className="relative z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <a href="https://welcometomorrow.io" className="flex items-center">
            {/* white logo on the dark hero */}
            <img
              src="/welcome-tomorrow-logo-white.png"
              alt="Welcome Tomorrow"
              className="h-9 w-auto"
            />
          </a>
          <div className="hidden items-center gap-8 text-sm font-semibold text-white md:flex">
            <a href="https://welcometomorrow.io" className="transition hover:text-growLight">Services</a>
            <a href="https://welcometomorrow.io" className="transition hover:text-growLight">Expertise</a>
            <a href="https://welcometomorrow.io" className="transition hover:text-growLight">About us</a>
            <a href="https://welcometomorrow.io" className="transition hover:text-growLight">Blog</a>
            <a
              href="https://welcometomorrow.io/contact"
              className="rounded-lg border border-white/70 px-4 py-2 transition hover:bg-white hover:text-ink"
            >
              Let&apos;s talk →
            </a>
          </div>
        </div>
      </nav>

      <AuditApp />

      <footer className="relative z-10 border-t border-white/10 py-8 text-center text-sm text-white/70">
        TomorrowRank — SEO &amp; AI Visibility Audit Tool ·{" "}
        <a href="https://welcometomorrow.io" className="font-semibold text-growLight">welcometomorrow.io</a>
      </footer>
    </main>
  );
}
