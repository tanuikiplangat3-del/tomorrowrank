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
 * Create a Deal at the "Captured" stage, linked to the person.
 * Only sets the stage if ATTIO_STAGE_ATTR + ATTIO_STAGE_CAPTURED are configured
 * (so we never write a stage the tool isn't permitted / that doesn't exist).
 */
async function createDeal(lead: Lead, personId: string | null): Promise<string | null> {
  const dealsObject = cfg("ATTIO_DEALS_OBJECT", "deals");
  const websiteAttr = cfg("ATTIO_WEBSITE_ATTR", "website");
  const leadSourceAttr = cfg("ATTIO_LEAD_SOURCE_ATTR", "lead_source");
  const leadSourceValue = cfg("ATTIO_LEAD_SOURCE_VALUE", "SEO");
  const stageAttr = cfg("ATTIO_STAGE_ATTR", "stage");
  const stageCaptured = cfg("ATTIO_STAGE_CAPTURED", "Captured");

  const peopleObject = cfg("ATTIO_PEOPLE_OBJECT", "people");
  const baseValues: Record<string, unknown> = {
    name: [{ value: `${lead.company} — SEO audit lead` }],
  };
  if (lead.url) baseValues[websiteAttr] = lead.url;
  if (leadSourceAttr && leadSourceValue) baseValues[leadSourceAttr] = leadSourceValue;
  if (personId) baseValues["associated_people"] = [{ target_record_id: personId, target_object: peopleObject }];

  // Attio status attributes accept the option's title (or id). We attempt to set
  // the stage; if Attio rejects it (wrong label or the tool lacks write access to
  // the sales-owned status field), we retry WITHOUT the stage so the Deal still
  // lands — the lead is never lost to a stage mismatch.
  async function post(values: Record<string, unknown>) {
    return attio<{ data?: { id?: { record_id?: string } } }>(
      `/objects/${dealsObject}/records`,
      "POST",
      { data: { values } }
    );
  }

  if (stageAttr && stageCaptured) {
    try {
      const withStage = { ...baseValues, [stageAttr]: [{ status: stageCaptured }] };
      const data = await post(withStage);
      return data?.data?.id?.record_id ?? null;
    } catch {
      // Fall through and create the Deal without forcing a stage.
    }
  }
  const data = await post(baseValues);
  return data?.data?.id?.record_id ?? null;
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
