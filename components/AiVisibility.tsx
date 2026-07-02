"use client";
// components/AiVisibility.tsx
import { useState } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip,
} from "recharts";
import type { AiVisibilityReport } from "@/types/audit";

// Green-led palette on the dark canvas; client brand is always wtgreen.
const PALETTE = ["#4CA66B", "#9BC846", "#9B8BFF", "#E2B340", "#F06A5A", "#7E8B84"];

function colorFor(i: number, isClient: boolean) {
  if (isClient) return "#4CA66B";
  return PALETTE[(i % (PALETTE.length - 1)) + 1];
}

const CARD = "rounded-xl2 border border-glassBorder bg-glass p-6 shadow-card backdrop-blur-sm";

export function AiVisibilitySection({ data }: { data: AiVisibilityReport }) {
  const sov = data.shareOfVoice;
  const client = sov.find((s) => s.isClient);

  const bubbleData = sov
    .filter((s) => s.brand !== "Other")
    .map((s, i) => ({
      x: s.sharePct,
      y: s.sentimentScore,
      z: Math.max(120, s.sharePct * 12),
      name: s.brand,
      fill: colorFor(i, s.isClient),
    }));

  return (
    <section className="mt-10">
      <div className="mb-5 flex items-baseline gap-3">
        <h2 className="font-display text-2xl font-extrabold text-paper">AI Visibility</h2>
        <span className="text-sm font-medium text-muted">
          GEO / Generative Engine Optimization · {data.modelsQueried.join(" · ") || "Claude"}
        </span>
      </div>

      {/* Row 1: Insights + Bubble */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Insights */}
        <div className={CARD}>
          <h3 className="font-display text-lg font-bold text-paper">Insights</h3>
          <p className="mt-1 text-sm text-muted">AI-generated strategy — click any insight to see the AI answers &amp; sources behind it.</p>
          <ol className="mt-5 space-y-3">
            {data.insights.map((ins) => (
              <InsightRow key={ins.rank} ins={ins} probes={data.probes ?? []} citations={data.citations ?? []} />
            ))}
          </ol>
        </div>

        {/* Share of Voice vs Sentiment bubble */}
        <div className={CARD}>
          <h3 className="font-display text-lg font-bold text-paper">Share of Voice vs. Sentiment</h3>
          <div className="mt-3 rounded-lg bg-violet/10 p-3">
            <p className="text-sm font-bold text-violet">✦ {data.headline.tag}</p>
            <p className="text-sm text-paper">{data.headline.text}</p>
          </div>
          <div className="mt-4 h-[280px]">
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 10, right: 16, bottom: 20, left: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.1)" />
                <XAxis type="number" dataKey="x" name="Share of Voice" unit="%"
                  domain={[0, "dataMax + 5"]} tick={{ fontSize: 11, fill: "#B9C2BC" }}
                  label={{ value: "Share of Voice (%)", position: "insideBottom", offset: -8, fontSize: 11, fill: "#B9C2BC" }} />
                <YAxis type="number" dataKey="y" name="Sentiment" unit="%"
                  domain={[0, 100]} tick={{ fontSize: 11, fill: "#B9C2BC" }}
                  label={{ value: "Sentiment Score (%)", angle: -90, position: "insideLeft", fontSize: 11, fill: "#B9C2BC" }} />
                <ZAxis type="number" dataKey="z" range={[120, 1400]} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }}
                  contentStyle={{ background: "#0c0f0d", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: "#fff" }}
                  formatter={(v: any, n: any) => [`${v}%`, n]} />
                <Scatter data={bubbleData}>
                  {bubbleData.map((b, i) => (
                    <Cell key={i} fill={b.fill} fillOpacity={0.65} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 2: Overall sentiment + Share of voice donut */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* Overall sentiment */}
        <div className={CARD}>
          <h3 className="font-display text-lg font-bold text-paper">Overall Sentiment</h3>
          {data.overallSentiment.hasMentions ? (
            <div className="mt-4 space-y-3">
              <SentimentBar label="Positive" pct={data.overallSentiment.positivePct} color="#4CA66B" />
              <SentimentBar label="Neutral" pct={data.overallSentiment.neutralPct} color="#7E8B84" />
              <SentimentBar label="Negative" pct={data.overallSentiment.negativePct} color="#F06A5A" />
              <p className="pt-2 text-sm text-muted">{data.overallSentiment.summary}</p>
            </div>
          ) : (
            <div className="mt-6 flex flex-col items-center text-center">
              <div className="grid h-20 w-20 place-items-center rounded-full bg-white/[0.06] text-3xl">☹</div>
              <p className="mt-3 font-display font-bold text-paper">No brand mentions</p>
              <p className="mt-1 max-w-xs text-sm text-muted">
                Sentiment data will appear here once your brand shows up in AI responses.
              </p>
            </div>
          )}
        </div>

        {/* Share of voice donut */}
        <div className={CARD}>
          <h3 className="font-display text-lg font-bold text-paper">Share of Voice</h3>
          <div className="mt-3 rounded-lg bg-violet/10 p-3">
            <p className="text-sm font-bold text-violet">✦ {data.headline.tag}</p>
            <p className="text-sm text-paper">
              You hold {client?.sharePct ?? 0}% share.{" "}
              {sov.find((s) => !s.isClient && s.brand !== "Other")
                ? `${sov.find((s) => !s.isClient && s.brand !== "Other")!.brand} leads at ${sov.find((s) => !s.isClient && s.brand !== "Other")!.sharePct}%.`
                : ""}
            </p>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <div className="h-[200px] w-[200px] shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={sov} dataKey="sharePct" nameKey="brand"
                    innerRadius={55} outerRadius={90} paddingAngle={1}>
                    {sov.map((s, i) => (
                      <Cell key={i} fill={s.brand === "Other" ? "#7E8B84" : colorFor(i, s.isClient)} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex-1 space-y-1.5">
              {sov.map((s, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-sm"
                      style={{ background: s.brand === "Other" ? "#7E8B84" : colorFor(i, s.isClient) }} />
                    <span className={s.isClient ? "font-bold text-paper" : "text-muted"}>{s.brand}</span>
                  </span>
                  <span className="font-semibold text-paper">{s.sharePct}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Citations / sources the AI engines actually referenced */}
      {data.citations && data.citations.length > 0 && (
        <div className={`mt-5 ${CARD}`}>
          <h3 className="font-display text-lg font-bold text-paper">
            Citations <span className="text-sm font-medium text-muted">· sources AI engines referenced</span>
          </h3>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {data.citations.map((c, i) => {
              let host = c.url;
              try { host = new URL(c.url).hostname.replace(/^www\./, ""); } catch {}
              return (
                <li key={i} className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${c.brandCited ? "bg-wtgreen" : "bg-white/30"}`} />
                  <div className="min-w-0">
                    <a href={c.url} target="_blank" rel="noopener noreferrer"
                      className="block truncate text-sm font-semibold text-paper hover:text-wtgreen">
                      {c.title}
                    </a>
                    <span className="block truncate text-xs text-muted">{host}</span>
                    {c.brandCited && (
                      <span className="mt-1 inline-block rounded bg-wtgreen/15 px-1.5 py-0.5 text-[11px] font-bold text-wtgreen">
                        cites your brand
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function SentimentBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-semibold text-paper">{pct}%</span>
      </div>
      <div className="mt-1 h-2 w-full rounded-full bg-white/10">
        <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function InsightRow({
  ins,
  probes,
  citations,
}: {
  ins: { rank: number; title: string; body: string; link: { label: string; href: string } };
  probes: { engine: string; prompt: string; answer: string; brandCited: boolean }[];
  citations: { url: string; title: string; brandCited?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-lg border border-white/10 bg-white/[0.02]">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full gap-3 p-3 text-left" aria-expanded={open}>
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-violet/20 text-sm font-bold text-violet">
          {ins.rank}
        </span>
        <span className="flex-1">
          <span className="block font-display font-bold text-paper">{ins.title}</span>
          <span className="mt-0.5 block text-sm text-muted">{ins.body}</span>
          <span className="mt-1 inline-block text-sm font-semibold text-wtgreen">
            {ins.link.label} {open ? "▲" : "→"}
          </span>
        </span>
      </button>

      {open && (
        <div className="border-t border-white/10 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
            What we asked the AI &amp; what it answered
          </p>
          {probes.length === 0 && (
            <p className="text-sm text-muted">No probe data was captured for this run.</p>
          )}
          <ul className="space-y-2">
            {probes.map((p, i) => (
              <li key={i} className="rounded-md bg-white/[0.03] p-2.5">
                <p className="text-sm font-semibold text-paper">
                  <span className="mr-2 rounded bg-violet/20 px-1.5 py-0.5 text-xs text-violet">{p.engine}</span>
                  {p.prompt}
                </p>
                <p className="mt-1 line-clamp-3 text-xs text-muted">{p.answer}</p>
                <span className={`mt-1 inline-block text-xs font-bold ${p.brandCited ? "text-good" : "text-bad"}`}>
                  {p.brandCited ? "✓ Your brand was mentioned" : "✗ Your brand was NOT mentioned"}
                </span>
              </li>
            ))}
          </ul>

          {citations.length > 0 && (
            <>
              <p className="mb-1 mt-3 text-xs font-bold uppercase tracking-wide text-muted">Sources the AI cited</p>
              <ul className="space-y-1">
                {citations.slice(0, 6).map((c, i) => (
                  <li key={i}>
                    <a href={c.url} target="_blank" rel="noopener noreferrer"
                      className="block truncate text-xs text-paper hover:text-wtgreen">
                      {c.brandCited ? "★ " : ""}{c.title || c.url}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </li>
  );
}
