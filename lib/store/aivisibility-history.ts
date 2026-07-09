// lib/store/aivisibility-history.ts
// Stores the LAST AI Responses snapshot per domain so a later audit can show
// a delta ("+23", "-26") instead of a flat number. Deliberately separate from
// lib/store/jobs.ts (1-hour TTL, per-audit) — this is per-DOMAIN, long-lived
// (90 days), and only ever holds one small record per domain.

import { getRedis } from "./jobs";

const TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days — long enough to always have "vs last audit"

export interface PlatformSnapshotValue {
  responses: number | null;
  pages: number | null;
}
export type Snapshot = Record<string, PlatformSnapshotValue>; // keyed by platform name

const mem = new Map<string, Snapshot>(); // in-memory fallback (no Redis configured / local dev)
const key = (domain: string) => `tomorrowrank:aivis:${domain.toLowerCase()}`;

export async function getPreviousSnapshot(domain: string): Promise<Snapshot | null> {
  const r = getRedis();
  if (!r) return mem.get(domain) ?? null;
  try {
    const raw = await r.get<string>(key(domain));
    if (!raw) return null;
    return typeof raw === "string" ? (JSON.parse(raw) as Snapshot) : (raw as Snapshot);
  } catch {
    return null; // best-effort — a history-read failure should never break the audit
  }
}

export async function saveSnapshot(domain: string, snapshot: Snapshot): Promise<void> {
  const r = getRedis();
  if (!r) { mem.set(domain, snapshot); return; }
  try {
    await r.set(key(domain), JSON.stringify(snapshot), { ex: TTL_SECONDS });
  } catch {
    /* best-effort — losing a delta snapshot isn't worth failing the audit over */
  }
}
