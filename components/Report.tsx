"use client";
// components/Report.tsx
import type { AuditReport, AiVisibilityReport, CheckResult, SocialProfile } from "@/types/audit";
import { GradeGauge, ScoreRing, PriorityBadge, CategoryTag } from "./Primitives";
import { AiVisibilitySection } from "./AiVisibility";
import { SiteIssues } from "./SiteIssues";
import { GateContext, CtaButton } from "./Gate";

const CARD = "rounded-xl2 border border-glassBorder bg-glass p-6 shadow-card backdrop-blur-sm";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso;
  }
}

function ReadinessStat({ label, value }: { label: string; value: number }) {
  const color = value >= 85 ? "text-good" : value >= 70 ? "text-wtgreen" : value >= 50 ? "text-warn" : "text-bad";
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`font-display text-2xl font-extrabold ${color}`}>{value}<span className="text-sm font-medium text-muted">/100</span></p>
    </div>
  );
}

function ScoreStat({ dotColor, label, value, sub }: { dotColor: string; label: string; value: number; sub?: string }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} /> {label}
      </p>
      <p className="font-display text-2xl font-extrabold text-paper">{value}<span className="text-sm font-medium text-muted">/100</span></p>
      {sub && <p className="truncate text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function Report({
  report, ai, gated = true, jobId, leadId, email,
}: { report: AuditReport; ai?: AiVisibilityReport; gated?: boolean; jobId?: string; leadId?: string; email?: string }) {
  const failing = report.checks.filter((c) => c.status === "fail");
  const warning = report.checks.filter((c) => c.status === "warn");
  const comp = report.competitorComparison;

  return (
    <GateContext.Provider value={{ gated, jobId, leadId, email }}>
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Hero */}
      <header className={CARD}>
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          {/* Screenshot thumbnail, mobile shot overlaid in the corner */}
          {report.meta.screenshotDesktop && (
            <div className="relative w-full shrink-0 overflow-hidden rounded-lg border border-white/10 md:w-[200px]">
              <img src={report.meta.screenshotDesktop} alt={`Homepage screenshot of ${prettyHost(report.meta.finalUrl)}`}
                className="aspect-[4/3] w-full object-cover object-top" />
              {report.meta.screenshotMobile && (
                <img src={report.meta.screenshotMobile} alt="Mobile view"
                  className="absolute bottom-2 right-2 w-12 rounded border-2 border-[#0b100e] object-cover shadow-lg" />
              )}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-extrabold leading-snug text-paper">
              {report.meta.pageTitle || `SEO Audit for ${prettyHost(report.meta.finalUrl)}`}
            </h1>
            <p className="mt-1 truncate text-sm text-muted">{report.meta.finalUrl}</p>
            <p className="mt-3 text-sm leading-relaxed text-muted">{report.readiness.summary}</p>
            {(report.meta.targetKeyword || report.meta.competitorUrl) && (
              <p className="mt-2 text-xs text-muted">
                {report.meta.targetKeyword && <>Keyword: <span className="font-semibold text-paper">{report.meta.targetKeyword}</span></>}
                {report.meta.targetKeyword && report.meta.competitorUrl && <> · </>}
                {report.meta.competitorUrl && <>Compared against: <span className="font-semibold text-paper">{report.meta.competitorUrl}</span></>}
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-center">
            <ScoreRing score={report.readiness.overall} size={140} label="Readiness" />
          </div>
        </div>

        {/* Technical / Content / AI Visibility readiness */}
        <div className="mt-8 grid grid-cols-1 gap-6 border-t border-white/10 pt-6 sm:grid-cols-3">
          <ReadinessStat label="Technical Readiness" value={report.readiness.technical} />
          <ReadinessStat label="Content Readiness" value={report.readiness.content} />
          <ReadinessStat label="AI Visibility Readiness" value={report.readiness.aiVisibility} />
        </div>

        {/* Your score / Industry average / Top competitor — real computed data only */}
        <div className="mt-6 grid grid-cols-1 gap-6 border-t border-white/10 pt-6 sm:grid-cols-3">
          <ScoreStat dotColor="#EDEDED" label="Your Score" value={comp?.yourScore ?? report.readiness.overall} />
          {comp?.industryAverage != null && (
            <ScoreStat dotColor="#7E8B84" label="Industry Average" value={comp.industryAverage} />
          )}
          {comp?.topCompetitor && (
            <ScoreStat dotColor="#4CA66B" label="Top Competitor" value={comp.topCompetitor.overall} sub={comp.topCompetitor.domain} />
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6">
          <p className="text-sm text-muted">Analyzed on {formatDate(report.meta.fetchedAt)}</p>
          <CtaButton label="Talk to Expert" source="hero" />
        </div>
      </header>

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

      {/* Local Business Profile — framed as an issue when not found, not left empty */}
      {report.localBusiness?.checked && (
        <section className={`mt-6 ${CARD}`}>
          <h2 className="font-display text-xl font-bold text-paper">Local Business Profile</h2>
          {report.localBusiness.found ? (
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Stat label="Rating" value={report.localBusiness.rating ?? "—"} />
              <Stat label="Reviews" value={report.localBusiness.reviewCount ?? "—"} />
              <Stat label="Category" value={report.localBusiness.category ?? "—"} />
            </div>
          ) : (
            <div className="mt-3 flex items-start gap-3 rounded-lg border border-bad/30 bg-bad/10 p-4">
              <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-bad" />
              <div>
                <p className="font-semibold text-paper">{report.localBusiness.issue!.title}</p>
                <p className="mt-1 text-sm text-wtgreen">→ {report.localBusiness.issue!.recommendation}</p>
                <p className="mt-1 text-sm text-muted">{report.localBusiness.issue!.reason}</p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Technical verification — an independent second opinion (DataForSEO
          On-Page API) on the homepage's core fields, cross-checked against our
          own crawler. Any disagreement is shown plainly, not resolved silently. */}
      {report.technicalCrossCheck?.checked && (
        <section className={`mt-6 ${CARD}`}>
          <h2 className="font-display text-xl font-bold text-paper">Technical Verification</h2>
          <p className="mt-1 text-sm text-muted">
            Homepage title/meta/canonical/H1 confirmed against a second, independent source.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {report.technicalCrossCheck.fields.map((f, i) => (
              <li key={i} className="flex items-start justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <span className="text-muted capitalize">{f.field.replace(/([A-Z])/g, " $1")}</span>
                {f.agrees ? (
                  <span className="font-semibold text-good">✓ Confirmed</span>
                ) : (
                  <span className="text-right text-xs">
                    <span className="block font-semibold text-warn">⚠ Sources disagree</span>
                    <span className="block text-muted">Ours: {f.ours.slice(0, 60)}</span>
                    <span className="block text-muted">DataForSEO: {f.dataForSeo.slice(0, 60)}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

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

      {/* Social Media Presence — live follower/engagement numbers where public */}
      <SocialSection profiles={report.social ?? []} />

      {/* AI Visibility */}
      {ai && <AiVisibilitySection data={ai} />}

      {/* CTA */}
      <section className="mt-10 overflow-hidden rounded-xl2 border border-wtgreen/40 bg-wtgreen/10 p-8 text-center backdrop-blur-sm">
        <h2 className="font-display text-2xl font-extrabold text-paper">
          Ready to <span className="text-wtgreen">fix these?</span>
        </h2>
        <p className="mt-2 text-muted">Welcome Tomorrow can implement every recommendation in this report.</p>
        <div className="mt-5">
          <CtaButton label="Talk to Expert" source="report-footer" className="px-7 py-3 text-base" />
        </div>
      </section>
    </div>
    </GateContext.Provider>
  );
}

const PLATFORM_ICON: Record<SocialProfile["platform"], string> = {
  Facebook: "📘",
  "X (Twitter)": "✖️",
  Instagram: "📸",
  LinkedIn: "💼",
  YouTube: "▶️",
};

function SocialSection({ profiles }: { profiles: SocialProfile[] }) {
  return (
    <section className={`mt-6 ${CARD}`}>
      <h2 className="font-display text-xl font-bold text-paper">Social Media Presence</h2>
      <p className="mt-1 text-sm text-muted">
        Live follower and engagement numbers for the social profiles linked from this site, where the platform
        makes them publicly visible.
      </p>
      {profiles.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          No linked social profiles were found on the site. Adding links to active social accounts helps visitors
          (and AI engines) verify the business is real and active.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((p, i) => (
            <div key={i} className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-center gap-2">
                <span className="text-lg">{PLATFORM_ICON[p.platform]}</span>
                <span className="font-display font-bold text-paper">{p.platform}</span>
              </div>
              {p.handle && <p className="mt-1 truncate text-xs text-muted">{p.handle}</p>}
              {p.available ? (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Stat label="Followers" value={p.followers} />
                  <Stat label="Last post engagement" value={p.engagement} />
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted">
                  Profile linked, but this platform doesn&apos;t show follower/engagement numbers publicly.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
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
              <tr><td colSpan={3} className="py-4 text-muted">
                No ranking keywords found — this is your biggest opportunity. Start by building brand awareness
                through informational content around your niche: check what competitors already rank for, then
                write new, more useful, more thorough content on the same topics to earn your first rankings.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Keyword Opportunities — page 1 bottom half through page 5, not yet top-3 */}
      <div className={CARD}>
        <h3 className="font-display text-lg font-bold text-paper">Keyword Opportunities</h3>
        <p className="mt-1 text-sm text-muted">
          Already visible to Google at positions 4–50 — the closest, highest-volume pushes to page 1.
        </p>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr><th className="py-1">Keyword</th><th>Pos.</th><th>Volume</th><th>KD</th></tr>
          </thead>
          <tbody>
            {keywords.opportunities.slice(0, 10).map((k, i) => (
              <tr key={i} className="border-t border-white/10">
                <td className="py-2 pr-2 text-paper">{k.keyword}</td>
                <td className="font-semibold text-wtgreen">{k.position}</td>
                <td className="text-muted">{k.searchVolume ?? "—"}</td>
                <td className="text-muted">{k.difficulty ?? "—"}</td>
              </tr>
            ))}
            {keywords.opportunities.length === 0 && (
              <tr><td colSpan={4} className="py-4 text-muted">No near-miss keywords found (either already top-3 for most terms, or no page-2-5 rankings detected).</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Content Gap — keywords a competitor ranks for that we don't rank for at all */}
      {keywords.contentGap.length > 0 && (
        <div className={CARD}>
          <h3 className="font-display text-lg font-bold text-paper">Content Gap</h3>
          <p className="mt-1 text-sm text-muted">
            <span className="font-semibold text-paper">{keywords.contentGap[0]?.competitorDomain}</span> ranks for these —
            you don&apos;t rank for them at all yet.
          </p>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr><th className="py-1">Keyword</th><th>Their Pos.</th><th>Volume</th></tr>
            </thead>
            <tbody>
              {keywords.contentGap.slice(0, 10).map((k, i) => (
                <tr key={i} className="border-t border-white/10">
                  <td className="py-2 pr-2 text-paper">{k.keyword}</td>
                  <td className="font-semibold text-wtgreen">{k.competitorPosition}</td>
                  <td className="text-muted">{k.searchVolume ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* SERP Snapshot — real Google result for the target/top-opportunity keyword */}
      {report.serpSnapshot && (
        <div className={CARD}>
          <h3 className="font-display text-lg font-bold text-paper">SERP Snapshot</h3>
          <p className="mt-1 text-sm text-muted">
            Real Google result right now for <span className="font-semibold text-paper">&ldquo;{report.serpSnapshot.keyword}&rdquo;</span>.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Stat label="Your Position" value={report.serpSnapshot.yourPosition ?? "Not in top 10"} />
            <Stat label="Search Volume" value={report.serpSnapshot.searchVolume} />
            <Stat label="CPC (USD)" value={report.serpSnapshot.cpc} />
          </div>
          <ul className="mt-4 space-y-1.5 text-sm">
            <li className="flex justify-between">
              <span className="text-muted">Featured snippet</span>
              <span className={report.serpSnapshot.hasFeaturedSnippet ? (report.serpSnapshot.featuredSnippetIsYours ? "font-semibold text-good" : "font-semibold text-bad") : "text-muted"}>
                {!report.serpSnapshot.hasFeaturedSnippet ? "None on this SERP" : report.serpSnapshot.featuredSnippetIsYours ? "Yours" : "A competitor holds it"}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted">People Also Ask</span>
              <span className="text-paper">{report.serpSnapshot.hasPeopleAlsoAsk ? "Present" : "Not present"}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted">Knowledge panel</span>
              <span className="text-paper">{report.serpSnapshot.hasKnowledgePanel ? "Present" : "Not present"}</span>
            </li>
          </ul>
          {report.serpSnapshot.topResults.length > 0 && (
            <>
              <h4 className="mt-4 text-sm font-bold text-paper">Top Results</h4>
              <ul className="mt-2 space-y-1.5 text-sm">
                {report.serpSnapshot.topResults.slice(0, 5).map((r, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="truncate text-muted">#{r.position} {r.domain}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {(report.serpSnapshot.bingPosition != null || report.serpSnapshot.yahooPosition != null || report.serpSnapshot.imagesPresence || report.serpSnapshot.mapsPresence) && (
            <>
              <h4 className="mt-4 text-sm font-bold text-paper">Other Search Surfaces</h4>
              <ul className="mt-2 space-y-1.5 text-sm">
                {report.serpSnapshot.bingPosition != null && (
                  <li className="flex justify-between"><span className="text-muted">Bing position</span><span className="text-paper">{report.serpSnapshot.bingPosition ?? "Not in top 10"}</span></li>
                )}
                {report.serpSnapshot.yahooPosition != null && (
                  <li className="flex justify-between"><span className="text-muted">Yahoo position</span><span className="text-paper">{report.serpSnapshot.yahooPosition ?? "Not in top 10"}</span></li>
                )}
                {report.serpSnapshot.imagesPresence && (
                  <li className="flex justify-between"><span className="text-muted">Google Images</span><span className="text-paper">{report.serpSnapshot.imagesPresence.present ? `${report.serpSnapshot.imagesPresence.imageCount} image(s) showing` : "Not appearing"}</span></li>
                )}
                {report.serpSnapshot.mapsPresence && (
                  <li className="flex justify-between"><span className="text-muted">Google Maps</span><span className="text-paper">{report.serpSnapshot.mapsPresence.present ? `Listed (#${report.serpSnapshot.mapsPresence.position})` : "Not appearing"}</span></li>
                )}
              </ul>
            </>
          )}
        </div>
      )}

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

      {/* Link Gap — sites linking to a competitor but not to this domain */}
      <div className={CARD}>
        <h3 className="font-display text-lg font-bold text-paper">Link Gap</h3>
        <p className="mt-1 text-sm text-muted">
          {backlinks.linkGap.competitor
            ? <>Sites linking to <span className="font-semibold text-paper">{backlinks.linkGap.competitor}</span> but not to this site — concrete outreach targets.</>
            : "Add a competitor URL before running the audit to see this section."}
        </p>
        <ul className="mt-3 space-y-1.5 text-sm">
          {backlinks.linkGap.domains.map((d, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="truncate text-muted">{d.domain}</span>
              <span className="font-semibold text-wtgreen">DR {d.domainRating ?? "—"}</span>
            </li>
          ))}
          {backlinks.linkGap.competitor && backlinks.linkGap.domains.length === 0 && (
            <li className="text-muted">No gap found — this site already has links from most of the competitor's referring domains.</li>
          )}
        </ul>
      </div>

      {/* Performance — only shown when PageSpeed data actually exists */}
      {hasPerf(performance) && (
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
      )}
    </section>
  );
}

// True only when at least one performance metric actually came back.
function hasPerf(performance: AuditReport["performance"]): boolean {
  const sides = [performance?.mobile, performance?.desktop].filter(Boolean) as any[];
  return sides.some((p) =>
    p && (p.performanceScore != null || p.lcp != null || p.cls != null || p.inp != null)
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
