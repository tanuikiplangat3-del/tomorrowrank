// components/Footer.tsx : Full Welcome Tomorrow footer, mirrored from
// welcometomorrow.io (brand blurb + socials, Company / Services / Expertise
// columns, legal bar). Outfit font is inherited from the body.

const COMPANY: [string, string][] = [
  ["About us", "https://welcometomorrow.io/about-us/"],
  ["Blog", "https://welcometomorrow.io/blog/"],
  ["Join Us", "https://welcometomorrow.io/join-us/"],
  ["App Marketing | South Africa", "https://welcometomorrow.io/app-growth-south-africa/"],
  ["Try Our Creative Checklist Tool", "https://welcometomorrow.io/creative-checklist/"],
  ["Contact Us", "https://welcometomorrow.typeform.com/to/CeIvTBF5"],
  ["SEO & GEO Audit Tool", "https://tools.welcometomorrow.io/ranktomorrow"],
];

const SERVICES: [string, string][] = [
  ["Performance Marketing", "https://welcometomorrow.io/performance-marketing-agency/"],
  ["Organic Growth", "https://welcometomorrow.io/social-media-marketing-agency/"],
  ["Creative Studio", "https://welcometomorrow.io/creative-agency/"],
  ["Marketing Analytics", "https://welcometomorrow.io/marketing-analytics/"],
];

const EXPERTISE: [string, string][] = [
  ["Sports Betting", "https://welcometomorrow.io/sports-betting-agency/"],
  ["Fintech", "https://welcometomorrow.io/fintech-marketing-agency/"],
  ["Retail", "https://welcometomorrow.io/retail-marketing-agency/"],
  ["Healthcare", "https://welcometomorrow.io/healthcare-marketing-agency/"],
  ["B2B", "https://welcometomorrow.io/b2b-marketing-agency/"],
  ["Banking", "https://welcometomorrow.io/trusted-banking-marketing-agency/"],
  ["Travel", "https://welcometomorrow.io/travel-marketing-agency/"],
];

const SOCIALS: { label: string; href: string; path: string }[] = [
  { label: "Instagram", href: "https://www.instagram.com/welcome_tomorrow/", path: "M12 2.2c3.2 0 3.6 0 4.8.07 1.2.06 1.8.25 2.2.42.6.22 1 .48 1.4.9.42.4.68.8.9 1.4.17.4.36 1 .42 2.2.07 1.2.07 1.6.07 4.8s0 3.6-.07 4.8c-.06 1.2-.25 1.8-.42 2.2a3.9 3.9 0 0 1-.9 1.4c-.4.42-.8.68-1.4.9-.4.17-1 .36-2.2.42-1.2.07-1.6.07-4.8.07s-3.6 0-4.8-.07c-1.2-.06-1.8-.25-2.2-.42a3.9 3.9 0 0 1-1.4-.9 3.9 3.9 0 0 1-.9-1.4c-.17-.4-.36-1-.42-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.8c.06-1.2.25-1.8.42-2.2.22-.6.48-1 .9-1.4.4-.42.8-.68 1.4-.9.4-.17 1-.36 2.2-.42C8.4 2.2 8.8 2.2 12 2.2Zm0 1.8c-3.1 0-3.5 0-4.7.07-.9.04-1.4.2-1.7.32-.43.17-.74.37-1.06.7-.32.31-.52.62-.7 1.05-.12.3-.28.8-.32 1.7C3.25 9 3.25 9.4 3.25 12s0 3 .07 4.2c.04.9.2 1.4.32 1.7.17.43.37.74.7 1.06.31.32.62.52 1.05.7.3.12.8.28 1.7.32 1.2.07 1.6.07 4.7.07s3.5 0 4.7-.07c.9-.04 1.4-.2 1.7-.32.43-.17.74-.37 1.06-.7.32-.31.52-.62.7-1.05.12-.3.28-.8.32-1.7.07-1.2.07-1.6.07-4.2s0-3-.07-4.2c-.04-.9-.2-1.4-.32-1.7a2.8 2.8 0 0 0-.7-1.06 2.8 2.8 0 0 0-1.05-.7c-.3-.12-.8-.28-1.7-.32C15.5 4 15.1 4 12 4Zm0 3.1a4.9 4.9 0 1 1 0 9.8 4.9 4.9 0 0 1 0-9.8Zm0 1.8a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2Zm5-3.4a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3Z" },
  { label: "Facebook", href: "https://www.facebook.com/welcometomorrowagency", path: "M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.5-1.5h1.7V3.6c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.1H7.3V13h2.7v8h3.5Z" },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/wtglobal/", path: "M6.94 8.5V19H3.56V8.5h3.38ZM5.25 3.5a1.96 1.96 0 1 1 0 3.92 1.96 1.96 0 0 1 0-3.92ZM20.44 19h-3.38v-5.6c0-1.4-.5-2.36-1.75-2.36-.95 0-1.52.64-1.77 1.26-.09.22-.11.53-.11.84V19h-3.38s.04-9.5 0-10.5h3.38v1.49c.45-.7 1.25-1.7 3.05-1.7 2.22 0 3.9 1.45 3.9 4.58V19Z" },
  { label: "TikTok", href: "https://www.tiktok.com/@welcome.tomorrow", path: "M16.5 3c.3 2 1.5 3.6 3.5 3.9v2.7c-1.3.1-2.5-.3-3.6-1v5.6c0 3.2-2.4 5.3-5.2 5.3A5.1 5.1 0 0 1 6 14.3c0-3.1 2.8-5.4 6-4.8v2.8c-.4-.1-.8-.2-1.2-.2-1.3 0-2.3 1-2.3 2.3 0 1.3 1 2.3 2.3 2.3 1.3 0 2.3-1 2.3-2.3V3h3.4Z" },
  { label: "Newsletter", href: "https://newsletter.welcometomorrow.io/", path: "M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1.4 2 7.6 5.3L19.6 7H4.4ZM20 8.5l-8 5.6L4 8.5V17h16V8.5Z" },
];

function Column({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h3 className="font-display text-sm font-bold uppercase tracking-wide text-paper">{title}</h3>
      <ul className="mt-4 space-y-2.5">
        {links.map(([label, href]) => (
          <li key={label}>
            <a href={href} className="text-sm text-muted transition hover:text-wtgreen">{label}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-white/10">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:pr-6">
            <a href="https://welcometomorrow.io" aria-label="Welcome Tomorrow">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/ranktomorrow/welcome-tomorrow-logo.png" alt="Welcome Tomorrow" width={362} height={117} className="h-9 w-auto" />
            </a>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Moving away from traditional marketing agencies, Welcome Tomorrow sets new standards as your
              trusted growth partner. We operate across the continent, with our main offices located in
              Cape Town, Nairobi, and Lagos.
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-muted transition hover:border-wtgreen hover:text-wtgreen"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><path d={s.path} /></svg>
                </a>
              ))}
            </div>
          </div>

          <Column title="Company" links={COMPANY} />
          <Column title="Services" links={SERVICES} />
          <Column title="Expertise" links={EXPERTISE} />
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-muted sm:flex-row">
          <span>Copyright © 2026 Welcome Tomorrow, all rights reserved</span>
          <a href="https://welcometomorrow.io/legal-notice/" className="transition hover:text-wtgreen">Legal information</a>
        </div>
      </div>
    </footer>
  );
}
