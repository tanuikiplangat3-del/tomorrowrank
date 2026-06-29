// app/page.tsx — landing + tool entry, branded like welcometomorrow.io
import { AuditApp } from "@/components/AuditApp";

export default function Home() {
  return (
    <main className="min-h-screen bg-paper">
      {/* Top nav echoing the Welcome Tomorrow dark bar */}
      <nav className="bg-ink">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-paper">
              <span className="text-sm">☀</span>
            </span>
            <span className="font-display text-sm font-bold leading-tight text-paper">
              WELCOME<br />TOMORROW
            </span>
          </div>
          <div className="hidden items-center gap-7 text-sm font-semibold text-paper md:flex">
            <a href="https://welcometomorrow.io" className="hover:text-electric">Services</a>
            <a href="https://welcometomorrow.io" className="hover:text-electric">Expertise</a>
            <a href="https://welcometomorrow.io" className="hover:text-electric">About us</a>
            <a href="https://welcometomorrow.io" className="hover:text-electric">Blog</a>
            <a href="https://welcometomorrow.io/contact"
              className="rounded-lg border border-paper px-4 py-2 hover:bg-paper hover:text-ink">
              Let&apos;s talk →
            </a>
          </div>
        </div>
      </nav>

      <AuditApp />

      <footer className="border-t border-mist bg-cloud py-8 text-center text-sm text-slatebody">
        TomorrowRank — SEO &amp; AI Visibility Audit Tool ·{" "}
        <a href="https://welcometomorrow.io" className="font-semibold text-electric">welcometomorrow.io</a>
      </footer>
    </main>
  );
}
