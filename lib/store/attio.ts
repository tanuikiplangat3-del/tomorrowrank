// lib/store/attio.ts
// Lead capture -> n8n webhook -> Attio (Person / Company / Deal + Biz-Dev
// Slack notify). n8n already owns this pipeline for the Typeform and Cal.com
// lead sources into the same Attio workspace; this reuses it for SEO-audit
// leads instead of writing to Attio directly, so the Person/Company/Deal
// shape and ICP branching logic stay defined in ONE place (the n8n workflow).
//
// Env:
//   N8N_SEO_WEBHOOK_URL     (required) the production webhook URL for the
//                           SEO-audit trigger node — NOT the "Listen for test
//                           event" URL, which only fires once.
//   N8N_SEO_WEBHOOK_SECRET  shared secret, sent as the X-Webhook-Secret header.
//                           Checked by the Webhook node's own Header Auth
//                           (n8n rejects a mismatch with 401 before the
//                           workflow runs — nothing to wire up downstream).
import type { Lead } from "./leads";

const TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function attioConfigured(): boolean {
  return !!process.env.N8N_SEO_WEBHOOK_URL;
}

export async function pushLeadToAttio(lead: Lead): Promise<void> {
  const url = process.env.N8N_SEO_WEBHOOK_URL;
  if (!url) {
    console.warn("[attio] N8N_SEO_WEBHOOK_URL not set — skipping push.");
    return;
  }

  const payload = {
    source: "seo-audit",
    leadId: lead.id,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    company: lead.company,
    position: lead.position || "",
    website: lead.url,
    newsletter: lead.newsletter ? "Yes" : "No",
    agreed: lead.agreed ? "Yes" : "No",
    createdAt: lead.createdAt,
  };

  const secret = process.env.N8N_SEO_WEBHOOK_SECRET;

  // Retry on timeouts/network errors and 5xx (transient) — NOT on 4xx (bad
  // secret, malformed payload, etc.), since those fail identically every time.
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { "X-Webhook-Secret": secret } : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) {
        console.log(`[attio] lead pushed for ${lead.email}${attempt > 1 ? ` (attempt ${attempt})` : ""}`);
        return;
      }
      const text = await res.text().catch(() => "");
      if (res.status < 500) {
        console.error(`[attio] webhook failed HTTP ${res.status}, not retrying: ${text.slice(0, 200)}`);
        return;
      }
      console.error(`[attio] webhook failed HTTP ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS}): ${text.slice(0, 200)}`);
    } catch (e: any) {
      console.error(`[attio] push threw (attempt ${attempt}/${MAX_ATTEMPTS}): ${e?.message ?? e}`);
    }

    if (attempt < MAX_ATTEMPTS) {
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
  console.error(`[attio] giving up on ${lead.email} after ${MAX_ATTEMPTS} attempts`);
}
