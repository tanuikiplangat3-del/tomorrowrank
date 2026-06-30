// lib/store/jobs.ts
// Job persistence. Uses Upstash Redis (serverless-friendly) in production.
// Falls back to an in-memory map for local dev without Redis.

import { Redis } from "@upstash/redis";
import type { AuditJob } from "@/types/audit";

const TTL_SECONDS = 60 * 60; // keep jobs for 1 hour

let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    redis = new Redis({ url, token });
    return redis;
  }
  return null;
}

// in-memory fallback (per-instance; fine for `next dev`)
const mem = new Map<string, AuditJob>();

const key = (id: string) => `tomorrowrank:job:${id}`;

export async function saveJob(job: AuditJob): Promise<void> {
  job.updatedAt = new Date().toISOString();
  const r = getRedis();
  if (r) await r.set(key(job.id), JSON.stringify(job), { ex: TTL_SECONDS });
  else mem.set(job.id, job);
}

export async function getJob(id: string): Promise<AuditJob | null> {
  const r = getRedis();
  if (r) {
    const raw = await r.get<string>(key(id));
    if (!raw) return null;
    return typeof raw === "string" ? (JSON.parse(raw) as AuditJob) : (raw as AuditJob);
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
