"use client";
// components/Primitives.tsx
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer,
} from "recharts";
import type { Grade, CategoryScore } from "@/types/audit";

// Green-forward scale for the dark canvas
const GRADE_COLOR: Record<string, string> = {
  A: "#4CA66B", B: "#6FC08A", C: "#9BC846", D: "#E2B340", F: "#F06A5A",
};
function gradeColor(g: Grade): string {
  return GRADE_COLOR[g[0]] ?? "#4CA66B";
}

/** Circular grade gauge. */
export function GradeGauge({
  grade, score, size = 132, label,
}: { grade: Grade; score: number; size?: number; label?: string }) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const dash = (pct / 100) * c;
  const color = gradeColor(grade);

  return (
    <div className="flex flex-col items-center gap-2">
      <div style={{ width: size, height: size }} className="relative">
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
            strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="font-display font-extrabold text-paper"
            style={{ fontSize: size * 0.32 }}>{grade}</span>
        </div>
      </div>
      {label && <span className="text-sm font-semibold text-wtgreen">{label}</span>}
    </div>
  );
}

/** Radar over the five headline categories. */
export function CategoryRadar({ categories }: { categories: CategoryScore[] }) {
  const order = ["On-Page SEO", "GEO", "Links", "Usability", "Performance"];
  const data = order.map((cat) => {
    const found = categories.find((c) => c.category === cat);
    return { axis: cat, score: found?.score ?? 0 };
  });
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="rgba(255,255,255,0.14)" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: "#B9C2BC", fontSize: 12, fontWeight: 600 }} />
          <Radar dataKey="score" stroke="#4CA66B" fill="#4CA66B" fillOpacity={0.28} strokeWidth={2} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PriorityBadge({ priority }: { priority: "high" | "medium" | "low" }) {
  const map = {
    high: "bg-bad/15 text-bad",
    medium: "bg-warn/15 text-warn",
    low: "bg-good/15 text-good",
  } as const;
  const label = { high: "High Priority", medium: "Medium Priority", low: "Low Priority" }[priority];
  return <span className={`rounded-md px-2.5 py-1 text-xs font-bold ${map[priority]}`}>{label}</span>;
}

export function CategoryTag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-white/[0.07] px-2.5 py-1 text-xs font-semibold text-muted">{children}</span>;
}
