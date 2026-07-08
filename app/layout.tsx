import type { Metadata } from "next";
import "./globals.css";
import { Background } from "@/components/Background";

// Google Tag Manager container ID.
const GTM_ID = "GTM-PVGW8KF";

const SITE = "https://tools.welcometomorrow.io";
const PATH = "/ranktomorrow";
const LOGO = `${PATH}/welcome-tomorrow-logo.png`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "RankTomorrow — SEO & AI Visibility Audit Tool",
  description:
    "Free SEO audit + GEO / AI Visibility report by Welcome Tomorrow. Grade your on-page SEO, backlinks, Core Web Vitals and share of voice across AI engines like ChatGPT and Google AI Overviews.",
  applicationName: "RankTomorrow",
  alternates: { canonical: `${SITE}${PATH}` },
  icons: {
    icon: [{ url: LOGO }],
    shortcut: [{ url: LOGO }],
    apple: [{ url: LOGO }],
  },
  openGraph: {
    title: "RankTomorrow — SEO & AI Visibility Audit Tool",
    description:
      "Grade your site's SEO and AI visibility in minutes — on-page, off-page (backlinks) and share of voice across AI answer engines.",
    url: `${SITE}${PATH}`,
    siteName: "RankTomorrow by Welcome Tomorrow",
    type: "website",
    images: [{ url: LOGO, width: 1200, height: 630, alt: "RankTomorrow by Welcome Tomorrow" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "RankTomorrow — SEO & AI Visibility Audit Tool",
    description: "Grade your site's SEO and AI visibility in minutes.",
    images: [LOGO],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Google Tag Manager — as high in <head> as possible */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`,
          }}
        />
        {/* End Google Tag Manager */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body antialiased text-paper">
        {/* Google Tag Manager (noscript) — immediately after opening <body> */}
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        {/* End Google Tag Manager (noscript) */}

        {/* Brand canvas: warped green grid + edge glow, fixed behind everything */}
        <Background />
        {children}
      </body>
    </html>
  );
}
