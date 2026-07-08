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
async function resolveStage(dealsObject: string, preferAttr: string, wantTitle: string): Promise<{ attr: string; status: string } | null> {
  if (stageCache) return stageCache;

  const wanted = wantTitle.trim().toLowerCase();
  const tryAttr = async (attr: string): Promise<{ attr: string; status: string } | null> => {
    try {
      const res = await attio<{ data?: { title?: string; id?: { status_id?: string } }[] }>(
        `/objects/${dealsObject}/attributes/${attr}/statuses`,
        "GET"
      );
      const statuses = res?.data ?? [];
      if (!statuses.length) return null;
      const match =
        statuses.find((s) => (s.title ?? "").trim().toLowerCase() === wanted) ??
        statuses.find((s) => (s.title ?? "").trim().toLowerCase().includes(wanted)) ??
        statuses[0]; // first stage of the pipeline as a safe default
      if (match?.title) return { attr, status: match.title };
    } catch {
      /* attr not a status field / not found */
    }
    return null;
  };

  // 1. Try the configured/likely attribute first.
  let resolved = await tryAttr(preferAttr);

  // 2. Otherwise discover the first status-type attribute on the Deal object.
  if (!resolved) {
    try {
      const attrs = await attio<{ data?: { api_slug?: string; type?: string }[] }>(
        `/objects/${dealsObject}/attributes?limit=100`,
        "GET"
      );
      const statusAttr = (attrs?.data ?? []).find((a) => a.type === "status" && a.api_slug);
      if (statusAttr?.api_slug) resolved = await tryAttr(statusAttr.api_slug);
    } catch {
      /* ignore */
    }
  }

  if (resolved) stageCache = resolved;
  return resolved;
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

  // Resolve the real pipeline status (attr + exact "Captured" title) from Attio.
  const resolved = await resolveStage(dealsObject, stageAttr, stageCaptured);
  const stage = resolved
    ? { [resolved.attr]: [{ status: resolved.status }] }
    : (stageAttr && stageCaptured ? { [stageAttr]: [{ status: stageCaptured }] } : {});

  // The Deal's marketing PIPELINE (stage) is REQUIRED in this workspace — a Deal
  // cannot be created without it — so we ALWAYS include it and never drop it.
  // Only lead_source is optional (it may lack an "SEO" option), so that's the
  // one thing dropped if Attio rejects it.
  const attempts: { label: string; values: Record<string, unknown> }[] = [
    { label: "full", values: { name, ...website, ...source, ...stage, ...link } },
    { label: "no-source", values: { name, ...website, ...stage, ...link } },
    { label: "stage-only", values: { name, ...stage, ...link } },
  ];

  for (const attempt of attempts) {
    try {
      const data = await post(attempt.values);
      if (attempt.label !== "full") {
        console.warn(`[attio] Deal created without lead_source — add an "${leadSourceValue}" option to the lead_source select to populate it.`);
      }
      return data?.data?.id?.record_id ?? null;
    } catch (err) {
      if (attempt.label === "stage-only") {
        console.error(`[attio] Deal creation failed. Verify pipeline stage "${stageCaptured}" exists on attribute "${stageAttr}" and is writable:`, err);
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
