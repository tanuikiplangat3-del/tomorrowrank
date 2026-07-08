import type { Metadata } from "next";
import "./globals.css";
import { Background } from "@/components/Background";

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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body antialiased text-paper">
        {/* Brand canvas: warped green grid + edge glow, fixed behind everything */}
        <Background />
        {children}
      </body>
    </html>
  );
}
