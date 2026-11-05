"use client";
// components/Nav.tsx — the Welcome Tomorrow header, ported from the theme.
//
// Source of every value: public/wp-content/themes/welcometomorrow/build/css/app.css
// and src/components/layout/header.html in the Astro export.
//   .o-header            fixed, padding 44px -> 10px when scrolled, gradient :after
//   .o-header__logo      width 124px
//   .o-header__row       desktop gap 33px; below 1024px a full-height slide-in panel
//   .c-main-menu__list   desktop row, gap 33px, items 16px/700
//   .o-header__button    yellow ONLY below 1024px; transparent + white border above
// Menu order is the real DOM order, not alphabetical.
import { useEffect, useState } from "react";

const MENU = [
  { label: "Services", href: "https://welcometomorrow.io/", caret: true },
  { label: "Expertise", href: "https://welcometomorrow.io/", caret: true },
  { label: "About us", href: "https://welcometomorrow.io/about-us/", caret: false },
  { label: "Blog", href: "https://welcometomorrow.io/blog/", caret: false },
  { label: "Resources", href: "https://welcometomorrow.io/", caret: true },
  { label: "Join Us", href: "https://welcometomorrow.io/join-us/", caret: false },
];

// The real header button points at the Typeform, not /contact-us/.
const TALK_HREF = "https://welcometomorrow.typeform.com/to/CeIvTBF5";

export function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    // The theme sizes the mobile panel with --vh so it survives mobile browser chrome.
    const setVh = () =>
      document.documentElement.style.setProperty("--vh", `${innerHeight * 0.01}px`);
    setVh();
    addEventListener("resize", setVh);
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", setVh);
    };
  }, []);

  return (
    <header className={`o-header${scrolled ? " is-scrolled" : ""}`}>
      <div className="o-header__main">
        <div className="wt-container">
          <div className="o-header__logo">
            <a href="https://welcometomorrow.io/" aria-label="Welcome Tomorrow">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/ranktomorrow/img/logo-anim.gif" alt="Welcome Tomorrow" width={124} height={40} />
            </a>
          </div>

          <button
            type="button"
            className="c-burger"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span /><span /><span />
          </button>

          <div className={`o-header__row${open ? " is-active" : ""}`}>
            <div className="o-header__menu">
              <nav className="c-main-menu">
                <ul className="c-main-menu__list">
                  {MENU.map((m) => (
                    <li className="menu-item" key={m.label}>
                      <a href={m.href}>
                        {m.label}
                        {m.caret && (
                          <svg viewBox="0 0 9 6" width="9" height="6" aria-hidden="true" fill="none">
                            <path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.5"
                              strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>

            <div className="o-header__button">
              <a className="c-button c-button--secondary" href={TALK_HREF}>
                Let&apos;s talk
                <svg viewBox="0 0 12 11" fill="none" aria-hidden="true">
                  <path d="M6.5 1L11 5.5L6.5 10M11 5.5H1" stroke="currentColor" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
