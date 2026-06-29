// components/Background.tsx
// Full-bleed brand background: pure-black canvas, olive-green light bleeding
// in from the edges, and a warped "gravity-well" grid mesh.
// Matches the welcometomorrow.io hero. Rendered once, fixed behind all content.

export function Background() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-black"
    >
      <svg
        className="absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 1440 900"
      >
        <defs>
          {/* Faint green warped grid */}
          <pattern
            id="wt-grid"
            width="44"
            height="44"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M44 0 H0 V44"
              fill="none"
              stroke="rgba(150,200,140,0.16)"
              strokeWidth="1"
            />
          </pattern>

          {/* Organic displacement that bows the grid like a fabric well */}
          <filter id="wt-warp" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.004 0.006"
              numOctaves="2"
              seed="7"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="90"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>

          {/* Edge glows */}
          <radialGradient id="glow-left" cx="0%" cy="42%" r="55%">
            <stop offset="0%" stopColor="rgba(150,190,70,0.55)" />
            <stop offset="45%" stopColor="rgba(90,140,55,0.22)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <radialGradient id="glow-right" cx="100%" cy="34%" r="52%">
            <stop offset="0%" stopColor="rgba(120,175,75,0.5)" />
            <stop offset="50%" stopColor="rgba(70,120,55,0.18)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <radialGradient id="glow-bottom" cx="22%" cy="100%" r="60%">
            <stop offset="0%" stopColor="rgba(110,160,70,0.4)" />
            <stop offset="55%" stopColor="rgba(60,110,50,0.14)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <radialGradient id="glow-topleft" cx="6%" cy="4%" r="42%">
            <stop offset="0%" stopColor="rgba(120,170,80,0.32)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>

          {/* Keep the dead-center pure black */}
          <radialGradient id="center-dark" cx="50%" cy="48%" r="48%">
            <stop offset="0%" stopColor="rgba(0,0,0,0.9)" />
            <stop offset="60%" stopColor="rgba(0,0,0,0.45)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>

        {/* Base */}
        <rect width="1440" height="900" fill="#000000" />

        {/* Warped grid */}
        <g filter="url(#wt-warp)">
          <rect x="-120" y="-120" width="1680" height="1140" fill="url(#wt-grid)" />
        </g>

        {/* Light bleed from the edges */}
        <rect width="1440" height="900" fill="url(#glow-left)" />
        <rect width="1440" height="900" fill="url(#glow-right)" />
        <rect width="1440" height="900" fill="url(#glow-bottom)" />
        <rect width="1440" height="900" fill="url(#glow-topleft)" />

        {/* Pull the centre back to black so text stays crisp */}
        <rect width="1440" height="900" fill="url(#center-dark)" />
      </svg>
    </div>
  );
}
