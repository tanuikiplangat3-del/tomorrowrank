"use client";
// components/AuditApp.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import type { AuditJob } from "@/types/audit";
import { COUNTRIES, LANGUAGES } from "@/lib/locations";
import { Report } from "./Report";

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
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to start audit");
      const jobId = data.jobId as string;

      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/audit/status?id=${jobId}`);
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
    } catch (e: any) {
      setError(e.message);
      setPhase("error");
    }
  }, [url, country, language, keyword]);

  if (phase === "done" && job?.report) {
    return (
      <div className="relative z-10">
        <Report report={job.report} ai={job.aiVisibility} />
      </div>
    );
  }

  return (
    <div className="relative z-10 mx-auto max-w-3xl px-4 pb-16 pt-10 sm:pt-16">
      {/* Heading — white, no underline (dark canvas) */}
      <div className="text-center">
        <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-paper sm:text-6xl">
          SEO Audit &amp; AI Visibility Tool
        </h1>
        <p className="mt-5 text-lg font-medium text-muted">
          + Simple, Affordable SEO / GEO Toolset
        </p>
      </div>

      {phase === "input" || phase === "error" ? (
        <div className="mt-10">
          <div className="flex flex-col gap-3 rounded-xl2 border border-glassBorder bg-glass p-2 backdrop-blur-sm sm:flex-row sm:items-center sm:p-1.5">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && start()}
              placeholder="Example.com"
              className="flex-1 rounded-lg bg-transparent px-4 py-3 text-lg text-paper outline-none placeholder:text-white/40"
            />
            <button
              onClick={start}
              className="rounded-lg bg-wtgreen px-8 py-3 text-base font-bold uppercase tracking-wide text-paper transition hover:bg-wtgreenDeep"
            >
              Audit →
            </button>
          </div>

          {/* Country / language / keyword selectors */}
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Select label="Country" value={country} onChange={setCountry}
              options={COUNTRIES.map((c) => c.country)} />
            <Select label="Language" value={language} onChange={setLanguage}
              options={LANGUAGES.map((l) => l.language)} />
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                Target keyword (optional)
              </label>
              <input value={keyword} onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. growth agency"
                className="w-full rounded-lg border border-glassBorder bg-glass px-3 py-2.5 text-sm text-paper outline-none transition placeholder:text-white/35 focus:border-wtgreen" />
            </div>
          </div>

          <p className="mt-5 text-center text-sm text-muted">
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
    <div className="mt-16 flex flex-col items-center text-center">
      <div className="relative">
        {/* green halo behind the spinner */}
        <div className="halo-pulse absolute -inset-6 rounded-full bg-wtgreen/25 blur-2xl" />
        <div className="spinner relative h-16 w-16 rounded-full border-4 border-white/15 border-t-wtgreen" />
      </div>
      <div className="mt-10 w-full max-w-md">
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-2 rounded-full bg-wtgreen transition-all duration-500"
            style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-3 text-sm font-semibold text-paper">{stage}…</p>
      </div>
      <p className="mt-6 max-w-md text-muted">
        Come back in a few minutes — we&apos;re building insights for{" "}
        <span className="font-bold text-paper">{prettyHost(url)}, {country}, {language}.</span>
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
