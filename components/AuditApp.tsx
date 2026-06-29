"use client";
// components/AuditApp.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import type { AuditJob } from "@/types/audit";
import { COUNTRIES, LANGUAGES } from "@/lib/locations";
import { Report } from "./Report";

type Phase = "input" | "processing" | "done" | "error";

export function AuditApp() {
  const [phase, setPhase] = useState<Phase>("input");
  const [url, setUrl] = useState("");
  const [country, setCountry] = useState("Kenya");
  const [language, setLanguage] = useState("English");
  const [keyword, setKeyword] = useState("");
  const [job, setJob] = useState<AuditJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = () => { if (pollRef.current) clearInterval(pollRef.current); pollRef.current = null; };
  useEffect(() => () => stopPoll(), []);

  const start = useCallback(async () => {
    setError(null);
    if (!/\./.test(url)) { setError("Enter a valid URL, e.g. example.com"); return; }
    setPhase("processing");
    try {
      const res = await fetch("/api/audit/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, country, language, targetKeyword: keyword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start audit");
      const jobId = data.jobId as string;

      pollRef.current = setInterval(async () => {
        const r = await fetch(`/api/audit/status?id=${jobId}`);
        const j: AuditJob = await r.json();
        setJob(j);
        if (j.status === "done") { stopPoll(); setPhase("done"); }
        if (j.status === "error") { stopPoll(); setError(j.error || "Audit failed"); setPhase("error"); }
      }, 2500);
    } catch (e: any) {
      setError(e.message);
      setPhase("error");
    }
  }, [url, country, language, keyword]);

  if (phase === "done" && job?.report) {
    return <Report report={job.report} ai={job.aiVisibility} />;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      {/* Heading (screenshot 2) */}
      <div className="text-center">
        <h1 className="font-display text-4xl font-extrabold leading-tight text-ink sm:text-5xl">
          <span className="underline-sketch underline-sun">SEO Audit</span> &amp; AI Visibility Tool
        </h1>
        <p className="mt-4 text-lg font-medium text-slatebody">
          + Simple, Affordable SEO / GEO Toolset
        </p>
      </div>

      {phase === "input" || phase === "error" ? (
        <div className="mt-10">
          <div className="flex flex-col gap-3 rounded-xl2 border-2 border-ink p-2 sm:flex-row sm:items-center sm:p-1.5">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && start()}
              placeholder="Example.com"
              className="flex-1 rounded-lg px-4 py-3 text-lg text-ink outline-none placeholder:text-slate-400"
            />
            <button
              onClick={start}
              className="rounded-lg bg-sun px-8 py-3 text-lg font-bold text-ink transition hover:brightness-95"
            >
              Audit
            </button>
          </div>

          {/* Country / language / keyword selectors (screenshot 3 context) */}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Select label="Country" value={country} onChange={setCountry}
              options={COUNTRIES.map((c) => c.country)} />
            <Select label="Language" value={language} onChange={setLanguage}
              options={LANGUAGES.map((l) => l.language)} />
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slatebody">
                Target keyword (optional)
              </label>
              <input value={keyword} onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. growth agency"
                className="w-full rounded-lg border border-mist px-3 py-2.5 text-sm outline-none focus:border-electric" />
            </div>
          </div>

          <p className="mt-4 text-center text-sm text-slatebody">
            Enter a URL and get a free website analysis — SEO, GEO &amp; AI visibility.
          </p>
          {error && <p className="mt-3 text-center text-sm font-semibold text-bad">{error}</p>}
        </div>
      ) : (
        <Processing job={job} url={url} country={country} language={language} />
      )}
    </div>
  );
}

function Processing({ job, url, country, language }: {
  job: AuditJob | null; url: string; country: string; language: string;
}) {
  const progress = job?.progress ?? 0;
  const stage = job?.stage ?? "Queued";
  return (
    <div className="mt-14 flex flex-col items-center text-center">
      <div className="spinner h-16 w-16 rounded-full border-4 border-mist border-t-electric" />
      <div className="mt-8 w-full max-w-md">
        <div className="h-2 w-full overflow-hidden rounded-full bg-cloud">
          <div className="h-2 rounded-full bg-electric transition-all duration-500"
            style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-3 text-sm font-semibold text-ink">{stage}…</p>
      </div>
      <p className="mt-6 max-w-md text-slatebody">
        Come back in a few minutes — we&apos;re building insights for{" "}
        <span className="font-bold text-ink">{prettyHost(url)}, {country}, {language}.</span>
      </p>
    </div>
  );
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slatebody">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-mist bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-electric">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function prettyHost(url: string): string {
  try { return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, ""); }
  catch { return url; }
}
