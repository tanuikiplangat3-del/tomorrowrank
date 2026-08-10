// lib/store/sheets.ts
// Lead CRM push -> Google Sheets, via a Google Apps Script Web App webhook.
//
// Why a webhook (not the Sheets API + service account): no extra npm deps, no
// private-key handling in ECS env, and it matches the Apps Script tooling the
// team already uses. You deploy a small bound script (see SHEETS_SETUP below),
// paste its /exec URL as SHEETS_WEBHOOK_URL, and every captured lead is appended
// as a row. An optional shared secret (SHEETS_WEBHOOK_SECRET) stops randoms from
// posting to the URL.
import type { Lead } from "./leads";

export function sheetsConfigured(): boolean {
  return !!process.env.SHEETS_WEBHOOK_URL;
}

export async function pushLeadToSheet(lead: Lead): Promise<void> {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) {
    console.warn("[sheets] SHEETS_WEBHOOK_URL not set — skipping Sheets push.");
    return;
  }

  // One flat row, column order fixed so the sheet header stays stable.
  const payload = {
    secret: process.env.SHEETS_WEBHOOK_SECRET || "",
    createdAt: lead.createdAt,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    company: lead.company,
    position: lead.position || "",
    website: lead.url,
    newsletter: lead.newsletter ? "Yes" : "No",
    agreed: lead.agreed ? "Yes" : "No",
    leadId: lead.id,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow", // Apps Script /exec responds via a 302 -> googleusercontent
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      console.error(`[sheets] append failed HTTP ${res.status}: ${text.slice(0, 200)}`);
    } else {
      console.log(`[sheets] lead appended for ${lead.email}`);
    }
  } catch (e: any) {
    console.error(`[sheets] push threw: ${e?.message ?? e}`);
  }
}

// Pushes a completed audit's score to a SEPARATE "Audit Results" tab, joined
// back to the lead by leadId — only called for audits tied to an actual
// captured lead (never for abandoned/anonymous runs), and deliberately kept
// to just the score fields, nothing else.
export interface AuditResultRow {
  leadId: string;
  domain: string;
  overall: number;
  technical: number;
  content: number;
  aiVisibility: number;
  auditedAt: string;
}

export async function pushAuditResultToSheet(row: AuditResultRow): Promise<void> {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return; // same webhook as leads — if it's not configured, nothing to push to

  const payload = {
    secret: process.env.SHEETS_WEBHOOK_SECRET || "",
    type: "audit_result", // lets the same Apps Script route to the right tab
    leadId: row.leadId,
    domain: row.domain,
    overall: row.overall,
    technical: row.technical,
    content: row.content,
    aiVisibility: row.aiVisibility,
    auditedAt: row.auditedAt,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      console.error(`[sheets] audit-result append failed HTTP ${res.status}: ${text.slice(0, 200)}`);
    } else {
      console.log(`[sheets] audit result appended for lead ${row.leadId}`);
    }
  } catch (e: any) {
    console.error(`[sheets] audit-result push threw: ${e?.message ?? e}`);
  }
}

/*
SHEETS_SETUP — one-time, ~5 minutes
-----------------------------------
1. Create (or open) the Google Sheet that should collect leads.
2. Extensions -> Apps Script. Delete any code and paste:

    const SECRET = "PUT-A-LONG-RANDOM-STRING-HERE"; // must equal SHEETS_WEBHOOK_SECRET

    function doPost(e) {
      try {
        var body = JSON.parse(e.postData.contents);
        if (SECRET && body.secret !== SECRET) {
          return ContentService.createTextOutput("forbidden");
        }
        var ss = SpreadsheetApp.getActiveSpreadsheet();

        if (body.type === "audit_result") {
          // Completed audit score, joined back to the lead by Lead ID.
          // Only sent for audits tied to an actual captured lead.
          var results = ss.getSheetByName("Audit Results") || ss.insertSheet("Audit Results");
          if (results.getLastRow() === 0) {
            results.appendRow(["Audited At","Lead ID","Domain","Overall","Technical","Content","AI Visibility"]);
          }
          results.appendRow([body.auditedAt, body.leadId, body.domain,
                             body.overall, body.technical, body.content, body.aiVisibility]);
          return ContentService.createTextOutput("ok");
        }

        // Default: a captured lead (name/email/company/etc.)
        var sheet = ss.getSheetByName("Leads") || ss.insertSheet("Leads");
        if (sheet.getLastRow() === 0) {
          sheet.appendRow(["Created At","First Name","Last Name","Email","Company",
                           "Position","Website","Newsletter","Agreed","Lead ID"]);
        }
        sheet.appendRow([body.createdAt, body.firstName, body.lastName, body.email,
                         body.company, body.position, body.website, body.newsletter,
                         body.agreed, body.leadId]);
        return ContentService.createTextOutput("ok");
      } catch (err) {
        return ContentService.createTextOutput("error: " + err);
      }
    }

3. Deploy -> New deployment -> type "Web app".
   - Execute as: Me
   - Who has access: Anyone
   Deploy, authorise, and COPY the Web app URL (ends in /exec).
4. On ECS set env vars:
   SHEETS_WEBHOOK_URL    = the /exec URL
   SHEETS_WEBHOOK_SECRET = the same long random string you used for SECRET
That's it — leads append to the "Leads" tab, and completed audit scores
(only for audits tied to a captured lead) append to a separate "Audit
Results" tab, joinable back to a lead by the "Lead ID" column in both tabs.

NOTE: if you already deployed the Apps Script from before this update, you
need to REPLACE its code with the version above (same URL/secret still work —
just update the code and re-deploy the SAME deployment, or create a new
deployment and update SHEETS_WEBHOOK_URL if you do).
*/
