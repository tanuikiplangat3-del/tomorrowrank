// lib/store/jobs.ts
// Job persistence. Uses Upstash Redis (serverless-friendly) in production.
// Falls back to an in-memory map for local dev without Redis.
//
// IMPORTANT (serverless): the in-memory fallback only works when every request
// hits the same instance — which is NOT guaranteed on Vercel. For a deployed
// audit to work across the start → run → status calls, Upstash MUST be set.

import { Redis } from "@upstash/redis";
import type { AuditJob } from "@/types/audit";

const TTL_SECONDS = 60 * 60; // keep jobs for 1 hour

let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (url && token) {
    redis = new Redis({ url, token });
    return redis;
  }
  return null;
}

export function isRedisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
}

// Health check: confirms we can actually talk to Redis (not just that vars exist).
export async function pingStore(): Promise<{ ok: boolean; backend: string; error?: string }> {
  const r = getRedis();
  if (!r) return { ok: true, backend: "memory" };
  try {
    await r.set("tomorrowrank:health", "1", { ex: 30 });
    const v = await r.get<string>("tomorrowrank:health");
    return { ok: v === "1" || v === 1 as any, backend: "redis" };
  } catch (e: any) {
    return { ok: false, backend: "redis", error: e?.message ?? String(e) };
  }
}

// in-memory fallback (per-instance; fine for `next dev`)
const mem = new Map<string, AuditJob>();

const key = (id: string) => `tomorrowrank:job:${id}`;

export async function saveJob(job: AuditJob): Promise<void> {
  job.updatedAt = new Date().toISOString();
  const r = getRedis();
  if (r) {
    try {
      await r.set(key(job.id), JSON.stringify(job), { ex: TTL_SECONDS });
    } catch (e: any) {
      // Surface a clear, actionable error instead of an opaque 500.
      throw new Error(
        `Could not write job to Upstash Redis. Check UPSTASH_REDIS_REST_URL / ` +
          `UPSTASH_REDIS_REST_TOKEN in your Vercel env vars (no quotes, no trailing space). ` +
          `Underlying error: ${e?.message ?? String(e)}`
      );
    }
  } else {
    mem.set(job.id, job);
  }
}

export async function getJob(id: string): Promise<AuditJob | null> {
  const r = getRedis();
  if (r) {
    try {
      const raw = await r.get<string>(key(id));
      if (!raw) return null;
      return typeof raw === "string" ? (JSON.parse(raw) as AuditJob) : (raw as AuditJob);
    } catch (e: any) {
      throw new Error(
        `Could not read job from Upstash Redis. Check your UPSTASH_REDIS_REST_* env vars. ` +
          `Underlying error: ${e?.message ?? String(e)}`
      );
    }
  }
  return mem.get(id) ?? null;
}

export async function updateJob(
  id: string,
  patch: Partial<AuditJob>
): Promise<AuditJob | null> {
  const job = await getJob(id);
  if (!job) return null;
  const next = { ...job, ...patch };
  await saveJob(next);
  return next;
}
