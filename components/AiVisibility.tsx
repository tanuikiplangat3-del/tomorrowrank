"use client";
// components/AiVisibility.tsx
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip,
} from "recharts";
import type { AiVisibilityReport } from "@/types/audit";

const PALETTE = ["#3B43F5", "#22C55E", "#7C5CFC", "#F4B740", "#EF4444", "#C7CBD8"];

function colorFor(i: number, isClient: boolean) {
  if (isClient) return "#3B43F5";
  return PALETTE[(i % (PALETTE.length - 1)) + 1];
}

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
        <h2 className="font-display text-2xl font-extrabold text-ink">AI Visibility</h2>
        <span className="text-sm font-medium text-slatebody">
          GEO / Generative Engine Optimization · {data.modelsQueried.join(" · ") || "Claude"}
        </span>
      </div>

      {/* Row 1: Insights + Bubble */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Insights */}
        <div className="rounded-xl2 border border-mist bg-paper p-6 shadow-card">
          <h3 className="font-display text-lg font-bold text-ink">Insights</h3>
          <p className="mt-1 text-sm text-slatebody">AI-generated strategy based on the latest data update.</p>
          <ol className="mt-5 space-y-5">
            {data.insights.map((ins) => (
              <li key={ins.rank} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-violet/10 text-sm font-bold text-violet">
                  {ins.rank}
                </span>
                <div>
                  <p className="font-display font-bold text-ink">{ins.title}</p>
                  <p className="mt-0.5 text-sm text-slatebody">{ins.body}</p>
                  <span className="mt-1 inline-block text-sm font-semibold text-electric">
                    {ins.link.label} →
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Share of Voice vs Sentiment bubble */}
        <div className="rounded-xl2 border border-mist bg-paper p-6 shadow-card">
          <h3 className="font-display text-lg font-bold text-ink">Share of Voice vs. Sentiment</h3>
          <div className="mt-3 rounded-lg bg-gradient-to-r from-violet/5 to-transparent p-3">
            <p className="text-sm font-bold text-violet">✦ {data.headline.tag}</p>
            <p className="text-sm text-ink">{data.headline.text}</p>
          </div>
          <div className="mt-4 h-[280px]">
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 10, right: 16, bottom: 20, left: 0 }}>
                <CartesianGrid stroke="#EEF0F6" />
                <XAxis type="number" dataKey="x" name="Share of Voice" unit="%"
                  domain={[0, "dataMax + 5"]} tick={{ fontSize: 11, fill: "#3A3F55" }}
                  label={{ value: "Share of Voice (%)", position: "insideBottom", offset: -8, fontSize: 11 }} />
                <YAxis type="number" dataKey="y" name="Sentiment" unit="%"
                  domain={[0, 100]} tick={{ fontSize: 11, fill: "#3A3F55" }}
                  label={{ value: "Sentiment Score (%)", angle: -90, position: "insideLeft", fontSize: 11 }} />
                <ZAxis type="number" dataKey="z" range={[120, 1400]} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }}
                  formatter={(v: any, n: any) => [`${v}${n === "Sentiment" ? "%" : "%"}`, n]} />
                <Scatter data={bubbleData}>
                  {bubbleData.map((b, i) => (
                    <Cell key={i} fill={b.fill} fillOpacity={0.55} />
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
        <div className="rounded-xl2 border border-mist bg-paper p-6 shadow-card">
          <h3 className="font-display text-lg font-bold text-ink">Overall Sentiment</h3>
          {data.overallSentiment.hasMentions ? (
            <div className="mt-4 space-y-3">
              <SentimentBar label="Positive" pct={data.overallSentiment.positivePct} color="#22C55E" />
              <SentimentBar label="Neutral" pct={data.overallSentiment.neutralPct} color="#C7CBD8" />
              <SentimentBar label="Negative" pct={data.overallSentiment.negativePct} color="#EF4444" />
              <p className="pt-2 text-sm text-slatebody">{data.overallSentiment.summary}</p>
            </div>
          ) : (
            <div className="mt-6 flex flex-col items-center text-center">
              <div className="grid h-20 w-20 place-items-center rounded-full bg-cloud text-3xl">☹</div>
              <p className="mt-3 font-display font-bold text-ink">No brand mentions</p>
              <p className="mt-1 max-w-xs text-sm text-slatebody">
                Sentiment data will appear here once your brand shows up in AI responses.
              </p>
            </div>
          )}
        </div>

        {/* Share of voice donut */}
        <div className="rounded-xl2 border border-mist bg-paper p-6 shadow-card">
          <h3 className="font-display text-lg font-bold text-ink">Share of Voice</h3>
          <div className="mt-3 rounded-lg bg-gradient-to-r from-violet/5 to-transparent p-3">
            <p className="text-sm font-bold text-violet">✦ {data.headline.tag}</p>
            <p className="text-sm text-ink">
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
                      <Cell key={i} fill={s.brand === "Other" ? "#C7CBD8" : colorFor(i, s.isClient)} />
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
                      style={{ background: s.brand === "Other" ? "#C7CBD8" : colorFor(i, s.isClient) }} />
                    <span className={s.isClient ? "font-bold text-ink" : "text-slatebody"}>{s.brand}</span>
                  </span>
                  <span className="font-semibold text-ink">{s.sharePct}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function SentimentBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-slatebody">{label}</span>
        <span className="font-semibold text-ink">{pct}%</span>
      </div>
      <div className="mt-1 h-2 w-full rounded-full bg-cloud">
        <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
