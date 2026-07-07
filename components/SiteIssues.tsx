"use client";
// components/SiteIssues.tsx
// Clickable, drill-down issue report from the multi-page crawl.
// Each issue expands to show EVERY affected URL with first-hand evidence,
// then the recommendation and action chips (Fix / Add / Remove / Contact dev /
// SEO or content specialist).

import { useState } from "react";
import type { SiteIssue, CrawlMeta } from "@/types/audit";
import { BlurGate, ReportButton } from "./Gate";

const CARD = "rounded-xl2 border border-glassBorder bg-glass p-6 shadow-card backdrop-blur-sm";

const ACTION_LABEL: Record<string, string> = {
  fix: "Fix",
  add: "Add",
  remove: "Remove",
  contact_dev: "Contact your developer",
  seo_specialist: "Have an SEO specialist review",
  content_specialist: "Have a content specialist review",
};

function priorityBand(p: number): { label: string; cls: string } {
  if (p <= 2) return { label: "Very high", cls: "bg-bad/15 text-bad" };
  if (p <= 4) return { label: "High", cls: "bg-bad/10 text-bad" };
  if (p <= 6) return { label: "Medium", cls: "bg-warn/15 text-warn" };
  if (p <= 8) return { label: "Low", cls: "bg-good/15 text-good" };
  return { label: "Very low", cls: "bg-white/10 text-muted" };
}

export function SiteIssues({ issues, meta }: { issues: SiteIssue[]; meta?: CrawlMeta }) {
  const checked = issues.filter((i) => i.status === "checked");
  const withProblems = checked
    .filter((i) => i.affected.length > 0)
    .sort((a, b) => a.priority - b.priority || b.affected.length - a.affected.length);
  const clean = checked.filter((i) => i.affected.length === 0);
  const notChecked = issues.filter((i) => i.status === "not_checked");

  return (
    <section className="mt-6">
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <h2 className="font-display text-2xl font-extrabold text-paper">Site Audit</h2>
        {meta && (
          <span className="text-sm text-muted">
            Crawled {meta.crawled} of {meta.discovered} pages
            {meta.truncated ? " (capped)" : ""} · source: {meta.source} ·{" "}
            {meta.checkedCount} checks run · {meta.notCheckedCount} need extra data
          </span>
        )}
      </div>

      {withProblems.length === 0 && (
        <div className={CARD}>
          <p className="text-good">No issues detected across the crawled pages. Nicely done.</p>
        </div>
      )}

      <div className="space-y-3">
        {withProblems.map((issue) => (
          <IssueRow key={issue.id} issue={issue} />
        ))}
      </div>

      {/* Passed + not-checked summary */}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {clean.length > 0 && (
          <div className={CARD}>
            <h3 className="font-display text-sm font-bold text-good">Passed ({clean.length})</h3>
            <ul className="mt-2 space-y-1 text-sm text-muted">
              {clean.map((i) => <li key={i.id}>✓ {i.title}</li>)}
            </ul>
          </div>
        )}
        {notChecked.length > 0 && (
          <div className={CARD}>
            <h3 className="font-display text-sm font-bold text-muted">
              Not checked ({notChecked.length}) — needs extra data
            </h3>
            <ul className="mt-2 space-y-2 text-sm text-muted">
              {notChecked.map((i) => (
                <li key={i.id}>
                  <span className="text-paper">{i.title}</span>
                  <span className="block text-xs">{i.reason}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <ReportButton source="not-checked" className="w-full text-center" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function IssueRow({ issue }: { issue: SiteIssue }) {
  const [open, setOpen] = useState(false);
  const band = priorityBand(issue.priority);
  const total = issue.affected.length + issue.passedCount;

  return (
    <div className={CARD}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 text-left"
        aria-expanded={open}
      >
        <span className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-bold ${band.cls}`}>{band.label}</span>
        <span className="flex-1">
          <span className="font-display font-bold text-paper">
            {issue.affected.length} {issue.affected.length === 1 ? "page has" : "pages have"} this issue
          </span>
          <span className="block text-sm text-muted">
            {issue.title} · {issue.category} / {issue.subcategory} · {issue.passedCount}/{total} passed
          </span>
        </span>
        <span className={`transition ${open ? "rotate-180" : ""} text-muted`}>▾</span>
      </button>

      {open && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <BlurGate source={`site-issue:${issue.id}`}>
            {/* Affected URLs with first-hand evidence */}
            <ul className="max-h-80 space-y-1.5 overflow-auto pr-1">
              {issue.affected.map((a, i) => (
                <li key={i} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                  <a href={a.url} target="_blank" rel="noopener noreferrer"
                    className="block truncate text-sm font-semibold text-paper hover:text-wtgreen">
                    {a.url}
                  </a>
                  <span className="block truncate text-xs text-muted">{a.evidence}</span>
                </li>
              ))}
            </ul>

            {/* Recommendation + actions */}
            <div className="mt-4 rounded-lg bg-wtgreen/10 p-4">
              <p className="text-sm font-semibold text-paper">Recommendation</p>
              <p className="mt-1 text-sm text-muted">{issue.recommendation}</p>
              {issue.actions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {issue.actions.map((a) => (
                    <span key={a} className="rounded-md bg-wtgreen/20 px-2.5 py-1 text-xs font-bold text-wtgreen">
                      {ACTION_LABEL[a] ?? a}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </BlurGate>
        </div>
      )}
    </div>
  );
}
