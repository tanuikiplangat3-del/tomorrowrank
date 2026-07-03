// lib/store/leads.ts
// Lead capture storage. Stored in Upstash Redis now (free, already connected);
// swap in a CRM later by changing only saveLead()/listLeads().

import { Redis } from "@upstash/redis";

export interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;      // derived from email domain
  position?: string;
  agreed: boolean;
  newsletter?: boolean;
  url: string;          // the site they wanted audited
  createdAt: string;
}

let redis: Redis | null = null;
function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (!redis) redis = new Redis({ url, token });
  return redis;
}

export async function saveLead(lead: Lead): Promise<void> {
  const r = getRedis();
  if (!r) return; // dev without redis: no-op
  // store the record + keep an index list (newest first)
  await r.set(`lead:${lead.id}`, JSON.stringify(lead));
  await r.lpush("leads:index", lead.id);
}

export async function listLeads(limit = 500): Promise<Lead[]> {
  const r = getRedis();
  if (!r) return [];
  const ids = (await r.lrange("leads:index", 0, limit - 1)) as string[];
  if (!ids?.length) return [];
  const out: Lead[] = [];
  for (const id of ids) {
    const raw = await r.get(`lead:${id}`);
    if (!raw) continue;
    try { out.push(typeof raw === "string" ? JSON.parse(raw) : (raw as Lead)); } catch { /* skip */ }
  }
  return out;
}
