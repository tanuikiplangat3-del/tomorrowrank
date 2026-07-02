// lib/providers/ahrefs-siteaudit.ts
// Hybrid routing helper: if the audited domain is a VERIFIED Site Audit project
// in the connected Ahrefs account, we can pull Ahrefs' own crawl issues.
// Otherwise the caller falls back to the in-app crawler.
//
// NOTE: Ahrefs Site Audit is project-scoped — the API cannot crawl an arbitrary
// URL on demand; it returns the latest scheduled crawl for a project you own.
// All calls are defensive: any failure returns null so the audit degrades to
// the in-app crawler rather than erroring.

import type { SiteIssue } from "@/types/audit";

const BASE = "https://api.ahrefs.com/v3";

function headers() {
  const key = process.env.AHREFS_API_KEY;
  if (!key) throw new Error("AHREFS_API_KEY not configured");
  return { Authorization: `Bearer ${key}`, Accept: "application/json" };
}

async function get<T = any>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  try {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${BASE}${path}${qs ? `?${qs}` : ""}`, {
      headers: headers(),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function hostOf(u: string): string {
  try { return new URL(u.startsWith("http") ? u : `https://${u}`).hostname.replace(/^www\./, ""); }
  catch { return u.replace(/^www\./, ""); }
}

// Returns the Ahrefs Site Audit project id for a domain, or null if not a project.
export async function findSiteAuditProject(domain: string): Promise<{ projectId: string; name: string } | null> {
  const host = hostOf(domain);
  const data = await get<any>("/site-audit/projects");
  const projects: any[] = data?.projects ?? data?.items ?? [];
  for (const p of projects) {
    const purl = p?.url ?? p?.domain ?? p?.name ?? "";
    if (hostOf(String(purl)) === host) {
      const id = p?.project_id ?? p?.id;
      if (id != null) return { projectId: String(id), name: String(p?.name ?? purl) };
    }
  }
  return null;
}

// Pull Ahrefs Site Audit issues for a project and map them to our SiteIssue model.
// Best-effort: field names vary by plan; unmapped shapes yield an empty list so
// the caller falls back to the in-app crawler.
export async function ahrefsSiteAuditIssues(projectId: string): Promise<SiteIssue[] | null> {
  const data = await get<any>("/site-audit/issues", { project_id: projectId });
  const rows: any[] = data?.issues ?? data?.items ?? [];
  if (!rows.length) return null;

  return rows.slice(0, 40).map((r, i) => {
    const count = Number(r?.pages_count ?? r?.count ?? r?.urls_count ?? 0);
    const name = String(r?.name ?? r?.issue ?? r?.title ?? `Issue ${i + 1}`);
    const sev = String(r?.severity ?? r?.priority ?? "").toLowerCase();
    const priority = sev.includes("error") ? 2 : sev.includes("warn") ? 5 : 7;
    return {
      id: `ahrefs-${r?.id ?? i}`,
      category: "Technical" as const,
      subcategory: String(r?.category ?? "Site Audit"),
      title: name,
      status: "checked" as const,
      priority,
      // Ahrefs returns counts here; per-URL detail needs the page-explorer endpoint
      // (added on demand when a project is connected).
      affected: Array.from({ length: Math.min(count, 0) }, () => ({ url: "", evidence: "" })),
      passedCount: 0,
      recommendation: String(r?.description ?? "Review this Ahrefs Site Audit issue and resolve affected pages."),
      actions: priority <= 2 ? ["fix", "contact_dev"] : ["fix"],
      reason: count ? `${count} pages flagged by Ahrefs Site Audit.` : undefined,
    };
  });
}
