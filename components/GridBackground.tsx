// components/GridBackground.tsx
// The Welcome Tomorrow dark hero look: near-black base, green radial glows in the
// corners, and a subtly warped perspective grid. Pure CSS/SVG, no images.
// Renders fixed behind all content.

export function GridBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-ink"
    >
      {/* green corner glows */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 0% 18%, rgba(52,168,99,0.45) 0%, rgba(52,168,99,0) 60%)," +
            "radial-gradient(60% 50% at 100% 12%, rgba(52,168,99,0.40) 0%, rgba(52,168,99,0) 60%)," +
            "radial-gradient(70% 60% at 8% 100%, rgba(124,200,120,0.30) 0%, rgba(124,200,120,0) 55%)," +
            "radial-gradient(70% 60% at 100% 100%, rgba(52,168,99,0.28) 0%, rgba(52,168,99,0) 55%)",
        }}
      />
      {/* warped grid */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.45]"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 1440 900"
      >
        <defs>
          <filter id="warp">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="46" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <linearGradient id="line" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7CF0A8" stopOpacity="0.55" />
            <stop offset="55%" stopColor="#34A863" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#1E5E3A" stopOpacity="0.18" />
          </linearGradient>
        </defs>
        <g filter="url(#warp)" stroke="url(#line)" strokeWidth="1.1" fill="none">
          {/* vertical lines */}
          {Array.from({ length: 41 }).map((_, i) => {
            const x = (i * 1440) / 40;
            return <line key={`v${i}`} x1={x} y1={-40} x2={x} y2={940} />;
          })}
          {/* horizontal lines */}
          {Array.from({ length: 27 }).map((_, i) => {
            const y = (i * 900) / 26;
            return <line key={`h${i}`} x1={-40} y1={y} x2={1480} y2={y} />;
          })}
        </g>
      </svg>

      {/* darken the very center a touch so foreground text stays legible */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(75% 60% at 50% 45%, rgba(8,12,10,0.55) 0%, rgba(8,12,10,0.15) 55%, rgba(8,12,10,0) 80%)",
        }}
      />
    </div>
  );
}
