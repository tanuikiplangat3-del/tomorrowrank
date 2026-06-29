import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Extracted from welcometomorrow.io (screenshot 1)
        ink: "#0A0A0A",        // near-black hero / nav
        electric: "#3B43F5",   // primary electric blue (headings / CTA accent)
        electricDeep: "#2E36E0",
        sun: "#F4B740",        // warm yellow accent (audit underline / GEO)
        paper: "#FFFFFF",
        cloud: "#F4F5F9",      // light section background
        mist: "#E6E8F0",       // borders
        slatebody: "#3A3F55",  // body text
        good: "#22C55E",
        warn: "#F4B740",
        bad: "#EF4444",
        violet: "#7C5CFC",     // AI-visibility accent (screenshots 6/7)
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      boxShadow: {
        card: "0 1px 3px rgba(10,10,10,0.06), 0 8px 24px rgba(10,10,10,0.04)",
      },
    },
  },
  plugins: [],
};
export default config;
