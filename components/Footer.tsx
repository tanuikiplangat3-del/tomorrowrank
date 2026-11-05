// components/Footer.tsx — the Welcome Tomorrow footer, ported from the theme.
//
// Source: build/css/app.css (.o-footer*) and src/components/layout/footer.html.
//   .o-footer                 NO border-top; padding 38px -> 36px at 768px
//   .o-footer:after           blurred orb, blur(200px), mix-blend-mode:lighten, opacity .5
//   .o-footer__middle-row     flex, gap 45px — TWO columns, not four
//   .middle-col--text         max-width 435px
//   .o-footer__menus          flex, gap 58px — all three menus live in one column
//   .o-footer__bottom-row     border-top 2px SOLID WHITE, padding-top 31px
// Link lists are the real ones: Company 7, Services 4, Expertise 7.
const COMPANY = [
  ["Contact Us", "https://welcometomorrow.io/contact-us/"],
  ["About us", "https://welcometomorrow.io/about-us/"],
  ["Blog", "https://welcometomorrow.io/blog/"],
  ["Join Us", "https://welcometomorrow.io/join-us/"],
  ["App Marketing | South Africa", "https://welcometomorrow.io/app-growth-south-africa/"],
  ["Fintech Marketing | Nigeria", "https://welcometomorrow.io/fintech-marketing-agency/"],
  ["iGaming | Kenya", "https://welcometomorrow.io/"],
];
const SERVICES = [
  ["Performance Marketing", "https://welcometomorrow.io/"],
  ["Organic Growth", "https://welcometomorrow.io/seo-agency/"],
  ["Creative Studio", "https://welcometomorrow.io/creative-agency/"],
  ["Marketing Analytics", "https://welcometomorrow.io/"],
];
const EXPERTISE = [
  ["Sports Betting", "https://welcometomorrow.io/"],
  ["Fintech", "https://welcometomorrow.io/fintech-marketing-agency/"],
  ["Retail", "https://welcometomorrow.io/"],
  ["Healthcare", "https://welcometomorrow.io/"],
  ["B2B", "https://welcometomorrow.io/"],
  ["Banking", "https://welcometomorrow.io/"],
  ["Travel", "https://welcometomorrow.io/"],
];

// Icons live in public/img/sprites.svg, copied from the theme build.
const SPRITE = "/ranktomorrow/img/sprites.svg";
const SOCIAL = [
  ["Instagram", "instagram", "https://www.instagram.com/welcome_tomorrow/"],
  ["Facebook", "facebook", "https://welcometomorrow.io/"],
  ["LinkedIn", "linkedin", "https://www.linkedin.com/company/wtglobal/"],
  ["TikTok", "tiktok", "https://www.tiktok.com/@welcome.tomorrow"],
  ["Substack", "substack", "https://welcometomorrow.io/"],
];

function Menu({ title, items }: { title: string; items: string[][] }) {
  return (
    <div className="c-footer-menu">
      <div className="c-footer-menu__title">{title}</div>
      <nav>
        <ul className="c-footer-menu__list">
          {items.map(([label, href]) => (
            <li key={label}><a href={href}>{label}</a></li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="o-footer">
      <div className="wt-container">
        <div className="o-footer__logo">
          <a href="https://welcometomorrow.io/" aria-label="Welcome Tomorrow">
            {/* Static in the footer; the animated mark is header-only. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ranktomorrow/img/logo-static.png" alt="Welcome Tomorrow" width={204} height={68} />
          </a>
        </div>

        <div className="o-footer__middle-row">
          <div className="o-footer__middle-col middle-col--text">
            <div className="o-footer__big-description">
              Moving away from traditional marketing agencies, Welcome Tomorrow sets new
              standards as your trusted growth partner.
            </div>
            <div className="o-footer__small-description">
              We operate across the continent, with our main offices located in Cape Town,
              Nairobi, and Lagos
            </div>
            <nav className="c-social-menu">
              {SOCIAL.map(([label, icon, href]) => (
                <a className="c-social-menu__link" href={href} key={label} aria-label={label}>
                  <svg aria-hidden="true"><use href={`${SPRITE}#${icon}`} /></svg>
                </a>
              ))}
            </nav>
          </div>

          <div className="o-footer__middle-col middle-col--menus">
            <div className="o-footer__menus">
              <Menu title="Company" items={COMPANY} />
              <Menu title="Services" items={SERVICES} />
              <Menu title="Expertise" items={EXPERTISE} />
            </div>
          </div>
        </div>

        <div className="o-footer__bottom">
          <div className="o-footer__bottom-row">
            <div className="o-footer__bottom-copyright">
              Copyright © {new Date().getFullYear()} Welcome Tomorrow, all rights reserved
            </div>
            <div className="o-footer__bottom-links">
              <a className="o-footer__bottom-link" href="https://welcometomorrow.io/">
                Legal information
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
