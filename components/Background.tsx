// components/Background.tsx
// Plain black canvas.
//
// This used to render green corner glows and a warped grid. That was built from
// a palette sampled off a screenshot, and it sat on top of the whole page.
// The hero now paints the real theme background itself
// (blocks-bg-pattern-yellow.png under linear-gradient(180deg,rgba(0,0,0,.43),#000),
// per acf-hero-banner-v4-view-style-inline-css.css), so this just needs to be black.
export function Background() {
  return <div aria-hidden="true" className="fixed inset-0 -z-10 bg-black" />;
}
