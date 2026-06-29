import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Welcome Tomorrow dark hero palette (screenshot 2)
        ink: "#000000",          // pure-black canvas
        wtgreen: "#4CA66B",      // primary CTA green (sampled rgb 76,166,107)
        wtgreenDeep: "#3E9059",  // CTA hover
        wtglow: "#9BC846",       // olive-green edge glow / accents
        paper: "#FFFFFF",        // white text on dark
        muted: "#B9C2BC",        // muted light-grey body text on dark
        // Glass surfaces that let the warped grid show through
        glass: "rgba(255,255,255,0.045)",
        glassStrong: "rgba(255,255,255,0.07)",
        glassBorder: "rgba(255,255,255,0.12)",
        // Status colours
        good: "#4CA66B",
        warn: "#E2B340",
        bad: "#F06A5A",
        violet: "#9B8BFF",       // AI-visibility accent on dark
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.4), 0 18px 48px rgba(0,0,0,0.45)",
        glow: "0 0 0 1px rgba(76,166,107,0.4), 0 12px 40px rgba(76,166,107,0.25)",
      },
    },
  },
  plugins: [],
};
export default config;
