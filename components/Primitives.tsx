"use client";
// components/Primitives.tsx
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer,
} from "recharts";
import type { Grade, CategoryScore } from "@/types/audit";

const GRADE_COLOR: Record<string, string> = {
  A: "#34A863", B: "#34A863", C: "#7CF0A8", D: "#F4B740", F: "#EF4444",
};
function gradeColor(g: Grade): string {
  return GRADE_COLOR[g[0]] ?? "#34A863";
}

/** Circular grade gauge (screenshot 4 style). */
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
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={stroke} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
            strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="font-display font-extrabold text-white"
            style={{ fontSize: size * 0.32 }}>{grade}</span>
        </div>
      </div>
      {label && <span className="text-sm font-semibold text-growLight">{label}</span>}
    </div>
  );
}

/** Radar over the five headline categories (screenshot 4 right). */
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
          <PolarGrid stroke="rgba(255,255,255,0.15)" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 600 }} />
          <Radar dataKey="score" stroke="#34A863" fill="#34A863" fillOpacity={0.22} strokeWidth={2} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PriorityBadge({ priority }: { priority: "high" | "medium" | "low" }) {
  const map = {
    high: "bg-red-500/15 text-red-300",
    medium: "bg-amber-400/15 text-amber-300",
    low: "bg-green-500/15 text-green-300",
  } as const;
  const label = { high: "High Priority", medium: "Medium Priority", low: "Low Priority" }[priority];
  return <span className={`rounded-md px-2.5 py-1 text-xs font-bold ${map[priority]}`}>{label}</span>;
}

export function CategoryTag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/80">{children}</span>;
}
