"use client";
// components/Report.tsx
import type { AuditReport, AiVisibilityReport, CheckResult } from "@/types/audit";
import { GradeGauge, CategoryRadar, PriorityBadge, CategoryTag } from "./Primitives";
import { AiVisibilitySection } from "./AiVisibility";
import { SiteIssues } from "./SiteIssues";

const HEADLINE_CATS = ["On-Page SEO", "GEO", "Links", "Usability", "Performance"] as const;

const CARD = "rounded-xl2 border border-glassBorder bg-glass p-6 shadow-card backdrop-blur-sm";

export function Report({
  report, ai,
}: { report: AuditReport; ai?: AiVisibilityReport }) {
  const headlineScores = HEADLINE_CATS.map(
    (c) => report.categories.find((x) => x.category === c)
  ).filter(Boolean) as AuditReport["categories"];

  const failing = report.checks.filter((c) => c.status === "fail");
  const warning = report.checks.filter((c) => c.status === "warn");

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Intro card */}
      <header className={CARD}>
        <h1 className="font-display text-2xl font-extrabold text-paper">
          SEO Audit for <span className="text-wtgreen">{prettyHost(report.meta.finalUrl)}</span>
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          This report grades your website across On-Page SEO, GEO (AI visibility), backlinks,
          usability and performance on an A+ to F scale. Improving your grade helps your site
          perform better for users and rank better in search and AI engines. Prioritised
          recommendations are at the bottom of the report.
        </p>
        <p className="mt-2 text-xs text-muted">
          Target: <span className="font-semibold text-wtgreen">{report.meta.country}</span> ·{" "}
          <span className="font-semibold text-wtgreen">{report.meta.language}</span>
          {report.meta.targetKeyword && <> · Keyword: <span className="font-semibold text-paper">{report.meta.targetKeyword}</span></>}
        </p>
      </header>

      {/* Overall + radar */}
      <section className={`mt-6 ${CARD}`}>
        <h2 className="font-display text-xl font-bold text-paper">Audit Results</h2>
        <div className="mt-6 grid items-center gap-8 md:grid-cols-2">
          <div className="flex flex-col items-center">
            <GradeGauge grade={report.overall.grade} score={report.overall.score} size={150} />
            <p className="mt-3 font-display text-lg font-bold text-paper">{report.overall.summary}</p>
            <span className="mt-2 rounded-md bg-bad/15 px-3 py-1 text-sm font-semibold text-bad">
              Recommendations: {report.overall.recommendationCount}
            </span>
          </div>
          <CategoryRadar categories={report.categories} />
        </div>

        {/* Category gauges row */}
        <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
          {headlineScores.map((c) => (
            <GradeGauge key={c.category} grade={c.grade} score={c.score} size={96} label={c.category} />
          ))}
        </div>
      </section>

      {/* Issues found */}
      <section className={`mt-6 ${CARD}`}>
        <h2 className="font-display text-xl font-bold text-paper">Issues Found</h2>
        <p className="mt-1 text-sm text-muted">
          {failing.length} failing · {warning.length} warnings across {report.checks.length} checks.
        </p>
        <div className="mt-5 divide-y divide-white/10">
          {[...failing, ...warning].map((c) => (
            <IssueRow key={c.id} check={c} />
          ))}
          {failing.length + warning.length === 0 && (
            <p className="py-6 text-sm text-good">No major issues found. Nicely done.</p>
          )}
        </div>
      </section>

      {/* Multi-page crawl: clickable site issues */}
      {report.siteIssues && report.siteIssues.length > 0 && (
        <SiteIssues issues={report.siteIssues} meta={report.crawlMeta} />
      )}

      {/* Recommendations table */}
      <section className={`mt-6 ${CARD}`}>
        <h2 className="font-display text-xl font-bold text-paper">Recommendations</h2>
        <div className="mt-4 divide-y divide-white/10">
          {report.recommendations.map((r) => (
            <div key={r.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-3.5">
              <span className="font-semibold text-paper">{r.title}</span>
              <CategoryTag>{r.category}</CategoryTag>
              <PriorityBadge priority={r.priority as "high" | "medium" | "low"} />
            </div>
          ))}
        </div>
      </section>

      {/* Keyword rankings / backlinks / performance */}
      <DetailGrid report={report} />

      {/* AI Visibility */}
      {ai && <AiVisibilitySection data={ai} />}

      {/* CTA */}
      <section className="mt-10 overflow-hidden rounded-xl2 border border-wtgreen/40 bg-wtgreen/10 p-8 text-center backdrop-blur-sm">
        <h2 className="font-display text-2xl font-extrabold text-paper">
          Ready to <span className="text-wtgreen">fix these?</span>
        </h2>
        <p className="mt-2 text-muted">Welcome Tomorrow can implement every recommendation in this report.</p>
        <a href="https://welcometomorrow.io/contact"
          className="mt-5 inline-block rounded-lg bg-wtgreen px-7 py-3 font-bold uppercase tracking-wide text-paper transition hover:bg-wtgreenDeep">
          Let&apos;s do this →
        </a>
      </section>
    </div>
  );
}

function IssueRow({ check }: { check: CheckResult }) {
  const dot = check.status === "fail" ? "bg-bad" : "bg-warn";
  return (
    <div className="flex items-start gap-3 py-3.5">
      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-paper">{check.label}</span>
          <CategoryTag>{check.category}</CategoryTag>
        </div>
        {check.detail && <p className="mt-0.5 text-sm text-muted">{check.detail}</p>}
        {check.recommendation && (
          <p className="mt-0.5 text-sm text-wtgreen">→ {check.recommendation}</p>
        )}
      </div>
      {check.value != null && (
        <span className="max-w-[180px] truncate text-right text-xs text-muted">{String(check.value)}</span>
      )}
    </div>
  );
}

function DetailGrid({ report }: { report: AuditReport }) {
  const { keywords, backlinks, performance } = report;
  return (
    <section className="mt-6 grid gap-5 lg:grid-cols-2">
      {/* Keywords */}
      <div className={CARD}>
        <h3 className="font-display text-lg font-bold text-paper">Top Organic Keywords</h3>
        <p className="mt-1 text-sm text-muted">
          Est. traffic from search: {keywords.trafficFromSearch ?? "—"}
        </p>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr><th className="py-1">Keyword</th><th>Pos.</th><th>Volume</th></tr>
          </thead>
          <tbody>
            {keywords.organic.slice(0, 10).map((k, i) => (
              <tr key={i} className="border-t border-white/10">
                <td className="py-2 pr-2 text-paper">{k.keyword}</td>
                <td className="font-semibold text-wtgreen">{k.position}</td>
                <td className="text-muted">{k.searchVolume ?? "—"}</td>
              </tr>
            ))}
            {keywords.organic.length === 0 && (
              <tr><td colSpan={3} className="py-4 text-muted">No ranking keywords found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Backlinks */}
      <div className={CARD}>
        <h3 className="font-display text-lg font-bold text-paper">Backlink Profile</h3>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="Backlinks" value={backlinks.summary.totalBacklinks} />
          <Stat label="Ref. Domains" value={backlinks.summary.referringDomains} />
          <Stat label="Domain Rating" value={backlinks.summary.domainAuthority} />
        </div>
        <h4 className="mt-5 text-sm font-bold text-paper">Top Backlinks</h4>
        <ul className="mt-2 space-y-1.5 text-sm">
          {backlinks.top.slice(0, 6).map((b, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="truncate text-muted">{b.sourceDomain}</span>
              <span className="font-semibold text-wtgreen">DR {b.domainAuthority ?? "—"}</span>
            </li>
          ))}
          {backlinks.top.length === 0 && <li className="text-muted">No backlinks found.</li>}
        </ul>
      </div>

      {/* Performance */}
      <div className={`lg:col-span-2 ${CARD}`}>
        <h3 className="font-display text-lg font-bold text-paper">PageSpeed & Core Web Vitals</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {(["mobile", "desktop"] as const).map((s) => {
            const p = performance[s];
            return (
              <div key={s} className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                <p className="font-display font-bold capitalize text-paper">{s}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <Stat label="Perf Score" value={p.performanceScore} />
                  <Stat label="LCP (s)" value={p.lcp} />
                  <Stat label="CLS" value={p.cls} />
                  <Stat label="INP (ms)" value={p.inp} />
                </div>
                <p className="mt-2 text-xs font-semibold"
                  style={{ color: p.passesCoreWebVitals ? "#4CA66B" : "#F06A5A" }}>
                  {p.passesCoreWebVitals === null ? "CWV: insufficient field data"
                    : p.passesCoreWebVitals ? "Core Web Vitals: Passing" : "Core Web Vitals: Failing"}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div>
      <p className="font-display text-xl font-extrabold text-paper">{value ?? "—"}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function prettyHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}
