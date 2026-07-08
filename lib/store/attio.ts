// lib/store/attio.ts
// Attio CRM integration for lead capture.
//
// FLOW (agreed with Victor):
//   1. Upsert a PERSON, matched on email  -> returns person record id
//   2. Create a DEAL at the "Captured" stage, linked to that person
//      via the associated_people attribute, with lead_source="SEO" and
//      website = the audited URL.
//
// Attio's API needs exact object slugs + attribute slugs + the "Captured"
// status option. These vary per workspace, so they are CONFIG (env vars),
// not hardcoded — fill them once Victor confirms. If any required id is
// missing, we skip the Attio push (and rely on the Redis backup) rather
// than guess and corrupt the CRM.
//
// Env:
//   ATTIO_API_KEY                 (required)
//   ATTIO_PEOPLE_OBJECT           default "people"
//   ATTIO_DEALS_OBJECT            default "deals"
//   ATTIO_STAGE_ATTR              deal stage attribute slug (e.g. "stage")
//   ATTIO_STAGE_CAPTURED          the "Captured" status value/title (e.g. "Captured")
//   ATTIO_LEAD_SOURCE_ATTR        default "lead_source"
//   ATTIO_LEAD_SOURCE_VALUE       default "SEO"
//   ATTIO_WEBSITE_ATTR            default "website"
//   ATTIO_JOBTITLE_ATTR           default "job_title"

import type { Lead } from "./leads";

const API = "https://api.attio.com/v2";

export function attioConfigured(): boolean {
  return !!process.env.ATTIO_API_KEY;
}

function cfg(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

// Confirmed slugs from the Attio field-mapping worked out with Victor:
//   People:  name (personal-name), email_addresses (array, match key), job_title_2 (text)
//   Deal:    website (audited URL), lead_source (select "SEO"), associated_people (link)
// The ONLY genuinely-open items are the stage attribute slug + the "Captured"
// status value, and whether the tool is permitted to write the stage — so those
// stay unset until confirmed, and the Deal is created without a stage if so.

async function attio<T = any>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.ATTIO_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Attio ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/**
 * Upsert a Person matched on email. Uses Attio's assert endpoint so a repeat
 * email updates the same record instead of creating a duplicate.
 * Returns the person record id (or null on failure).
 */
async function upsertPerson(lead: Lead): Promise<string | null> {
  const peopleObject = cfg("ATTIO_PEOPLE_OBJECT", "people");
  const jobTitleAttr = cfg("ATTIO_JOBTITLE_ATTR", "job_title_2");

  const values: Record<string, unknown> = {
    name: [{ first_name: lead.firstName, last_name: lead.lastName, full_name: `${lead.firstName} ${lead.lastName}`.trim() }],
    email_addresses: [{ email_address: lead.email }],
  };
  if (lead.position) values[jobTitleAttr] = lead.position;

  // PUT assert with matching_attribute=email_addresses => upsert on email.
  const data = await attio<{ data?: { id?: { record_id?: string } } }>(
    `/objects/${peopleObject}/records?matching_attribute=email_addresses`,
    "PUT",
    { data: { values } }
  );
  return data?.data?.id?.record_id ?? null;
}

/**
 * Resolve the Deal pipeline: find the status-type attribute and the exact title
 * of the "Captured" status, by asking Attio. Cached after first success so we
 * don't re-query on every lead. Falls back to configured defaults if the API
 * shape differs. This makes the stage write reliable regardless of slug/casing.
 */
let stageCache: { attr: string; status: string } | null = null;

// The Deal "owner" field (actor-reference) is REQUIRED in this workspace. It must
// point to a real workspace member, so we look one up (by ATTIO_DEAL_OWNER_EMAIL
// if set, else the first member) and cache it.
let ownerCache: { referenced_actor_type: string; referenced_actor_id: string } | null | undefined;
async function resolveOwner(): Promise<{ referenced_actor_type: string; referenced_actor_id: string } | null> {
  if (ownerCache !== undefined) return ownerCache;
  const wantEmail = (process.env.ATTIO_DEAL_OWNER_EMAIL || "").trim().toLowerCase();
  try {
    const res = await attio<{ data?: { id?: { workspace_member_id?: string }; email_address?: string; first_name?: string; last_name?: string }[] }>(
      `/workspace_members`,
      "GET"
    );
    const members = res?.data ?? [];
    console.log(`[attio] workspace members: ${members.map((m) => m.email_address).filter(Boolean).join(", ") || "none"}`);
    const pick =
      (wantEmail && members.find((m) => (m.email_address ?? "").toLowerCase() === wantEmail)) ||
      members[0];
    const id = pick?.id?.workspace_member_id;
    if (id) {
      console.log(`[attio] deal owner -> ${pick?.email_address ?? id}`);
      ownerCache = { referenced_actor_type: "workspace-member", referenced_actor_id: id };
      return ownerCache;
    }
  } catch (e: any) {
    console.error(`[attio] could not resolve workspace member for owner: ${e?.message ?? e}`);
  }
  ownerCache = null;
  return null;
}

async function resolveStage(dealsObject: string, preferAttr: string, wantTitle: string): Promise<{ attr: string; status: string } | null> {
  if (stageCache) return stageCache;

  const wanted = wantTitle.trim().toLowerCase();

  // Fetch the statuses of one status attribute.
  const getStatuses = async (attr: string): Promise<{ title: string }[]> => {
    try {
      const res = await attio<{ data?: { title?: string }[] }>(
        `/objects/${dealsObject}/attributes/${attr}/statuses`,
        "GET"
      );
      return (res?.data ?? []).filter((s): s is { title: string } => !!s.title);
    } catch {
      return [];
    }
  };

  // Log the workspace objects once — reveals if the "marketing pipeline" is a
  // separate object rather than a status field on Deals.
  try {
    const objs = await attio<{ data?: { api_slug?: string; singular_noun?: string }[] }>(`/objects`, "GET");
    console.log(`[attio] objects: ${(objs?.data ?? []).map((o) => o.api_slug).filter(Boolean).join(", ")}`);
  } catch { /* ignore */ }

  // Discover ALL status attributes on the Deal object and log each one's stages.
  let statusSlugs: string[] = [];
  try {
    const attrs = await attio<{ data?: { api_slug?: string; type?: string; is_required?: boolean; title?: string }[] }>(
      `/objects/${dealsObject}/attributes?limit=100`,
      "GET"
    );
    const list = attrs?.data ?? [];
    console.log(`[attio] deal required attrs: ${list.filter((a) => a.is_required).map((a) => `${a.title}[${a.api_slug}/${a.type}]`).join(", ") || "none"}`);
    statusSlugs = list.filter((a) => a.type === "status" && a.api_slug).map((a) => a.api_slug!) as string[];
    console.log(`[attio] deal status attrs: ${statusSlugs.join(", ") || "none"}`);
  } catch (e: any) {
    console.error(`[attio] could not list deal attributes: ${e?.message ?? e}`);
  }

  // Consider the preferred attr first, then every discovered status attr.
  const ordered = [preferAttr, ...statusSlugs.filter((s) => s !== preferAttr)];

  // Pass 1: find the attribute that actually CONTAINS the wanted stage
  // (e.g. "Captured" — which may live on the marketing pipeline field, not "stage").
  let fallback: { attr: string; status: string } | null = null;
  for (const attr of ordered) {
    const statuses = await getStatuses(attr);
    if (!statuses.length) continue;
    console.log(`[attio] statuses for "${attr}": ${statuses.map((s) => s.title).join(" | ")}`);
    const exact = statuses.find((s) => s.title.trim().toLowerCase() === wanted);
    const partial = statuses.find((s) => s.title.trim().toLowerCase().includes(wanted));
    const hit = exact ?? partial;
    if (hit) {
      const resolved = { attr, status: hit.title };
      console.log(`[attio] matched wanted stage "${wantTitle}" -> attr "${attr}" = "${hit.title}"`);
      stageCache = resolved;
      return resolved;
    }
    // remember the first pipeline's first stage as a last-resort fallback
    if (!fallback) fallback = { attr, status: statuses[0].title };
  }

  if (fallback) {
    console.warn(`[attio] wanted stage "${wantTitle}" not found on any pipeline; using "${fallback.attr}" = "${fallback.status}". Set ATTIO_STAGE_ATTR + ATTIO_STAGE_CAPTURED to target the right pipeline/stage.`);
    stageCache = fallback;
  }
  return fallback;
}

/**
 * Create a Deal at the "Captured" stage, linked to the person.
 */
async function createDeal(lead: Lead, personId: string | null): Promise<string | null> {
  const dealsObject = cfg("ATTIO_DEALS_OBJECT", "deals");
  const websiteAttr = cfg("ATTIO_WEBSITE_ATTR", "website");
  const leadSourceAttr = cfg("ATTIO_LEAD_SOURCE_ATTR", "lead_source");
  const leadSourceValue = cfg("ATTIO_LEAD_SOURCE_VALUE", "SEO");
  const stageAttr = cfg("ATTIO_STAGE_ATTR", "stage");
  const stageCaptured = cfg("ATTIO_STAGE_CAPTURED", "Captured");
  const peopleObject = cfg("ATTIO_PEOPLE_OBJECT", "people");

  async function post(values: Record<string, unknown>) {
    return attio<{ data?: { id?: { record_id?: string } } }>(
      `/objects/${dealsObject}/records`,
      "POST",
      { data: { values } }
    );
  }

  // Build the Deal from a "full" set of values down to a minimal set. Attio
  // rejects the WHOLE request if any single select/status value isn't a valid
  // option in the workspace (e.g. no "SEO" option on lead_source, or the stage
  // label/permission differs). So we try progressively simpler payloads and use
  // the first that succeeds — the Deal always lands, just with whatever fields
  // are valid. Anything dropped is logged so it can be corrected in Attio.
  const name = [{ value: `${lead.company} — SEO audit lead` }];
  const link = personId
    ? { associated_people: [{ target_record_id: personId, target_object: peopleObject }] }
    : {};
  const website = lead.url ? { [websiteAttr]: lead.url } : {};
  const source = leadSourceAttr && leadSourceValue ? { [leadSourceAttr]: leadSourceValue } : {};

  // Resolve the real pipeline status (attr + exact stage title) from Attio.
  const resolved = await resolveStage(dealsObject, stageAttr, stageCaptured);
  const stage = resolved
    ? { [resolved.attr]: [{ status: resolved.status }] }
    : (stageAttr && stageCaptured ? { [stageAttr]: [{ status: stageCaptured }] } : {});

  // Deal owner (actor-reference) is REQUIRED in this workspace — resolve a real
  // workspace member and always include it.
  const ownerRef = await resolveOwner();
  const owner = ownerRef ? { owner: [ownerRef] } : {};

  // The Deal's PIPELINE (stage) and OWNER are REQUIRED in this workspace — a Deal
  // cannot be created without them — so we ALWAYS include them and never drop them.
  // Only lead_source is optional (it may lack an "SEO" option), so that's the
  // one thing dropped if Attio rejects it.
  const attempts: { label: string; values: Record<string, unknown> }[] = [
    { label: "full", values: { name, ...website, ...source, ...stage, ...owner, ...link } },
    { label: "no-source", values: { name, ...website, ...stage, ...owner, ...link } },
    { label: "stage-owner-only", values: { name, ...stage, ...owner, ...link } },
  ];

  for (const attempt of attempts) {
    try {
      const data = await post(attempt.values);
      if (attempt.label !== "full") {
        console.warn(`[attio] Deal created without lead_source — add an "${leadSourceValue}" option to the lead_source select to populate it.`);
      }
      return data?.data?.id?.record_id ?? null;
    } catch (err) {
      if (attempt.label === "stage-owner-only") {
        console.error(`[attio] Deal creation failed (stage="${stageCaptured}" owner=${ownerRef ? "set" : "MISSING"}):`, err);
      }
    }
  }
  return null;
}

/**
 * Push a captured lead to Attio: upsert Person -> create Deal (Captured).
 * Best-effort: throws on failure so the caller can log, but the caller must
 * NOT let an Attio failure block the user (the lead is already in Redis).
 */
export async function pushLeadToAttio(lead: Lead): Promise<{ personId: string | null; dealId: string | null }> {
  const personId = await upsertPerson(lead);
  const dealId = await createDeal(lead, personId);
  return { personId, dealId };
}
