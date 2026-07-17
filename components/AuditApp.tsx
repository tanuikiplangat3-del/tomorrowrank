"use client";
// components/AuditApp.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import type { AuditJob } from "@/types/audit";
import { COUNTRIES, LANGUAGES } from "@/lib/locations";
import { SearchableSelect } from "./SearchableSelect";
import { LeadGate } from "./LeadGate";
import { apiPath, BASE_PATH } from "./Gate";
import { Report } from "./Report";
import { gtmEvent } from "@/lib/gtm";

type Phase = "input" | "processing" | "done" | "error";

// Parse a fetch Response safely. If the server crashed and returned an empty or
// non-JSON body, surface a real message instead of "Unexpected end of JSON input".
async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) {
    throw new Error(
      res.ok
        ? "The server returned an empty response."
        : `Server error ${res.status} (${res.statusText || "no message"}).`
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    // Non-JSON (e.g. an HTML error page) — show a trimmed snippet.
    throw new Error(
      `Server error ${res.status}: ${text.slice(0, 180).replace(/\s+/g, " ").trim()}`
    );
  }
}

export function AuditApp({ internal = false, initialUrl = "" }: { internal?: boolean; initialUrl?: string }) {
  const [phase, setPhase] = useState<Phase>("input");
  const [url, setUrl] = useState(initialUrl);
  const [country, setCountry] = useState("Kenya");
  const [language, setLanguage] = useState("English");
  const [keyword, setKeyword] = useState("");
  const [competitorUrl, setCompetitorUrl] = useState("");
  const [job, setJob] = useState<AuditJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [verified, setVerified] = useState(internal); // internal team is pre-verified
  const [leadId, setLeadId] = useState<string | undefined>(undefined);
  const [leadEmail, setLeadEmail] = useState<string | undefined>(undefined);
  const leadIdRef = useRef<string | undefined>(undefined);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = () => { if (pollRef.current) clearInterval(pollRef.current); pollRef.current = null; };
  useEffect(() => () => stopPoll(), []);

  // Persist the current job id in the URL (?job=…) so a page refresh — e.g. after
  // a dropped connection — restores the SAME dashboard from storage instead of
  // wiping it and forcing a re-audit. While we're at it, swap the bare tool
  // root for a clean, shareable path with the audited site in it, e.g.
  // /ranktomorrow/welcometomorrow.io (or /ranktomorrow/seo/welcometomorrow.io
  // for the internal tool) instead of a long job/lead id string.
  const setJobParam = (jobId: string | null, lead?: string | null) => {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    if (jobId) u.searchParams.set("job", jobId); else u.searchParams.delete("job");
    if (lead) u.searchParams.set("lead", lead); else if (lead === null) u.searchParams.delete("lead");
    if (jobId) {
      const slug = prettyHost(url);
      if (slug && /\./.test(slug)) {
        u.pathname = `${BASE_PATH}${internal ? "/seo" : ""}/${encodeURIComponent(slug)}`;
      }
    }
    window.history.replaceState(null, "", u.toString());
  };

  const pollJob = useCallback((jobId: string) => {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(apiPath(`/api/audit/status?id=${jobId}`));
        const j: AuditJob = await readJson(r);
        setJob(j);
        if (j.status === "done") { stopPoll(); setPhase("done"); }
        if (j.status === "error") { stopPoll(); setError(j.error || "Audit failed"); setPhase("error"); }
      } catch (e: any) {
        stopPoll();
        setError(e.message || "Lost connection to the audit.");
        setPhase("error");
      }
    }, 2500);
  }, []);

  // On mount: if the URL has ?job=…, restore that audit (running or finished)
  // rather than starting from a blank form. This makes refresh non-destructive.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const jobId = new URL(window.location.href).searchParams.get("job");
    const savedLead = new URL(window.location.href).searchParams.get("lead");
    if (!jobId) return;
    if (savedLead) { leadIdRef.current = savedLead; setLeadId(savedLead); }
    setPhase("processing");
    (async () => {
      try {
        const r = await fetch(apiPath(`/api/audit/status?id=${jobId}`));
        const j: AuditJob = await readJson(r);
        setJob(j);
        if (j.status === "done") { setPhase("done"); return; }
        if (j.status === "error") { setError(j.error || "Audit failed"); setPhase("error"); return; }
        pollJob(jobId); // still running — resume the progress bar
      } catch {
        setJobParam(null); // job expired/not found — fall back to the form
        setPhase("input");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollJob]);

  // Clicking Audit first opens the lead gate (unless internal or already verified).
  const start = useCallback(() => {
    setError(null);
    if (!/\./.test(url)) { setError("Enter a valid URL, e.g. example.com"); return; }
    if (!internal && !verified) { setGateOpen(true); return; }
    void runAudit();
  }, [url, verified, internal]);

  const runAudit = useCallback(async () => {
    setPhase("processing");
    try {
      gtmEvent("audit_start", { site: prettyHost(url), country, internal });
      const res = await fetch(apiPath("/api/audit/start"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, country, language, targetKeyword: keyword, competitorUrl, internal }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to start audit");
      const jobId = data.jobId as string;
      setJobParam(jobId, leadIdRef.current ?? null); // persist so refresh restores audit + lead
      pollJob(jobId);
    } catch (e: any) {
      setError(e.message);
      setPhase("error");
    }
  }, [url, country, language, keyword, competitorUrl, internal, pollJob]);

  if (phase === "done" && job?.report) {
    return (
      <div className="relative z-10">
        <Report report={job.report} ai={job.aiVisibility} gated={!internal} jobId={job.id} leadId={leadId} email={leadEmail} />
      </div>
    );
  }

  return (
    <div className="relative z-10 mx-auto max-w-3xl px-4 pb-16 pt-10 sm:pt-16">
      {gateOpen && (
        <LeadGate
          url={url}
          onVerified={(id, mail) => { leadIdRef.current = id; setLeadId(id); setLeadEmail(mail); setVerified(true); setGateOpen(false); void runAudit(); }}
        />
      )}
      {/* Heading — white, no underline (dark canvas) */}
      <div className="text-center">
        <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-paper sm:text-6xl">
          Free, Simple SEO &amp; GEO Audit Tool
        </h1>
        <p className="mt-5 text-lg font-medium text-muted">
          Analyze your website&apos;s readiness for AI search engines. Get instant insights on how well
          your content is optimized for generative AI platforms.
        </p>
      </div>

      {phase === "input" || phase === "error" ? (
        <div className="mt-10">
          <div className="flex flex-col gap-3 rounded-xl2 border border-glassBorder bg-glass p-2 backdrop-blur-sm sm:flex-row sm:items-center sm:p-1.5">
            <div className="flex flex-1 items-center gap-2 pl-3">
              {url.trim().length > 2 && (
                <img
                  src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(prettyHost(url))}&sz=64`}
                  alt=""
                  className="h-5 w-5 shrink-0 rounded-sm"
                  onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
                />
              )}
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && start()}
                placeholder="Example.com"
                className="flex-1 rounded-lg bg-transparent py-3 text-lg text-paper outline-none placeholder:text-white/40"
              />
            </div>
            <button
              onClick={start}
              className="rounded-lg bg-wtgreen px-8 py-3 text-base font-bold uppercase tracking-wide text-paper transition hover:bg-wtgreenDeep"
            >
              Audit →
            </button>
          </div>

          {/* Country / language / keyword / competitor selectors */}
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SearchableSelect label="Country" value={country} onChange={setCountry}
              options={COUNTRIES.map((c) => c.country)} placeholder="Search your country…" />
            <SearchableSelect label="Language" value={language} onChange={setLanguage}
              options={LANGUAGES.map((l) => l.language)} searchable={false} placeholder="Select language" />
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                Target keyword (optional)
              </label>
              <input value={keyword} onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. growth agency"
                className="w-full rounded-lg border border-glassBorder bg-glass px-3 py-2.5 text-sm text-paper outline-none transition placeholder:text-white/35 focus:border-wtgreen" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                Competitor URL (optional)
              </label>
              <input value={competitorUrl} onChange={(e) => setCompetitorUrl(e.target.value)}
                placeholder="e.g. competitor.com"
                className="w-full rounded-lg border border-glassBorder bg-glass px-3 py-2.5 text-sm text-paper outline-none transition placeholder:text-white/35 focus:border-wtgreen" />
            </div>
          </div>

          {error && <p className="mt-3 text-center text-sm font-semibold text-bad">{error}</p>}

          {/* What we check visibility across */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted">
            <span>Checks your visibility across</span>
            <span className="flex items-center gap-1.5 font-semibold text-paper">
              <img src="https://www.google.com/s2/favicons?domain=chatgpt.com&sz=32" alt="" className="h-4 w-4" /> ChatGPT
            </span>
            <span className="flex items-center gap-1.5 font-semibold text-paper">
              <img src="https://www.google.com/s2/favicons?domain=perplexity.ai&sz=32" alt="" className="h-4 w-4" /> Perplexity
            </span>
            <span className="flex items-center gap-1.5 font-semibold text-paper">
              <img src="https://www.google.com/s2/favicons?domain=claude.ai&sz=32" alt="" className="h-4 w-4" /> Claude
            </span>
            <span className="flex items-center gap-1.5 font-semibold text-paper">
              <img src="https://www.google.com/s2/favicons?domain=google.com&sz=32" alt="" className="h-4 w-4" /> Google
            </span>
          </div>
        </div>
      ) : (
        <Processing job={job} url={url} country={country} language={language} internal={internal} />
      )}
    </div>
  );
}

function Processing({ job, url, country, language, internal }: {
  job: AuditJob | null; url: string; country: string; language: string; internal?: boolean;
}) {
  const progress = job?.progress ?? 0;
  const stage = job?.stage ?? "Starting";
  // Track how long we've been waiting so we can reassure during a cold start.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const waking = (!job || job.status === "queued") && elapsed > 6;
  return (
    <div className="mt-16 flex flex-col items-center text-center">
      <div className="relative">
        {/* green halo behind the spinner */}
        <div className="halo-pulse absolute -inset-6 rounded-full bg-wtgreen/25 blur-2xl" />
        <div className="spinner relative h-16 w-16 rounded-full border-4 border-white/15 border-t-wtgreen" />
      </div>
      <div className="mt-10 w-full max-w-md">
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-2 rounded-full bg-wtgreen transition-all duration-500"
            style={{ width: `${Math.max(progress, waking ? 5 : 0)}%` }} />
        </div>
        <p className="mt-3 text-sm font-semibold text-paper">{stage}…</p>
        {waking && (
          <p className="mt-2 text-xs text-muted">
            {internal
              ? "Waking the server (free tier can take up to ~1 min on first run) — then a full crawl of up to 500 pages."
              : "Waking the server (free tier can take up to ~1 min on first run) — then crawling your key pages."}
          </p>
        )}
      </div>
      <p className="mt-6 max-w-md text-muted">
        Wait as your site is being audited — auditing{" "}
        <span className="font-bold text-paper">{prettyHost(url)}, {country}, {language}</span>{" "}
        {internal
          ? "can take up to 30 minutes for a full crawl of up to 500 pages and the most accurate results."
          : "can take up to 3 minutes for the most accurate results."}{" "}
        Please don&apos;t cancel or close this tab midway.
      </p>
    </div>
  );
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-glassBorder bg-glass px-3 py-2.5 text-sm text-paper outline-none transition focus:border-wtgreen">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function prettyHost(url: string): string {
  try { return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, ""); }
  catch { return url; }
}
