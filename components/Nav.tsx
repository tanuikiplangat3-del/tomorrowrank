"use client";
// components/Nav.tsx — top navigation with a mobile hamburger (collapsed on small
// screens, expands on tap). Desktop shows inline links.
import { useState } from "react";

const LINKS = [
  { label: "Services", href: "https://welcometomorrow.io/services" },
  { label: "Expertise", href: "https://welcometomorrow.io/expertise" },
  { label: "About us", href: "https://welcometomorrow.io/about" },
  { label: "Blog", href: "https://welcometomorrow.io/blog" },
];

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="relative z-30">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <a href="https://welcometomorrow.io" className="flex items-center" aria-label="Welcome Tomorrow">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/ranktomorrow/welcome-tomorrow-logo.png"
            alt="Welcome Tomorrow"
            width={362}
            height={117}
            className="h-9 w-auto md:h-10"
          />
        </a>

        {/* Desktop links */}
        <div className="hidden items-center gap-8 text-sm font-semibold text-paper md:flex">
          {LINKS.map((l) => (
            <a key={l.label} href={l.href} className="transition hover:text-wtgreen">{l.label}</a>
          ))}
          <a
            href="https://welcometomorrow.io/contact"
            className="rounded-lg border border-white/30 px-4 py-2 transition hover:border-wtgreen hover:text-wtgreen"
          >
            Let&apos;s talk →
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 text-paper md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          <div className="relative h-4 w-5">
            <span className={`absolute left-0 block h-0.5 w-5 bg-current transition-all duration-300 ${open ? "top-1.5 rotate-45" : "top-0"}`} />
            <span className={`absolute left-0 top-1.5 block h-0.5 w-5 bg-current transition-all duration-300 ${open ? "opacity-0" : "opacity-100"}`} />
            <span className={`absolute left-0 block h-0.5 w-5 bg-current transition-all duration-300 ${open ? "top-1.5 -rotate-45" : "top-3"}`} />
          </div>
        </button>
      </div>

      {/* Mobile menu panel */}
      {open && (
        <div className="md:hidden" style={{ backgroundColor: "#0b100e" }}>
          <div className="mx-auto flex max-w-6xl flex-col gap-1 border-t border-white/10 px-4 py-3">
            {LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-base font-semibold text-paper transition hover:bg-wtgreen hover:text-white"
              >
                {l.label}
              </a>
            ))}
            <a
              href="https://welcometomorrow.io/contact"
              onClick={() => setOpen(false)}
              className="mt-1 rounded-lg bg-wtgreen px-3 py-3 text-center text-base font-bold text-white transition hover:bg-wtgreenDeep"
            >
              Let&apos;s talk →
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
