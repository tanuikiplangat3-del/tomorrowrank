import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TomorrowRank — SEO & AI Visibility Audit Tool",
  description:
    "Free SEO audit + GEO / AI Visibility report by Welcome Tomorrow. Grade your On-Page SEO, GEO, backlinks, Core Web Vitals and share of voice across AI engines.",
  openGraph: {
    title: "TomorrowRank — SEO & AI Visibility Audit Tool",
    description: "Grade your site's SEO and AI visibility in minutes.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body antialiased">{children}</body>
    </html>
  );
}
