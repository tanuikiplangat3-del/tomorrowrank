// app/api/lead/route.ts
// Captures a lead before an audit runs. Enforces a real *company* email:
// valid format, not a free/public provider, and the domain has live MX records.
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { promises as dns } from "dns";
import { saveLead, type Lead } from "@/lib/store/leads";
import { sheetsConfigured, pushLeadToSheet } from "@/lib/store/sheets";

export const runtime = "nodejs";

// Common free/public inboxes we don't accept as "company" emails.
const FREE_PROVIDERS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "ymail.com",
  "hotmail.com", "hotmail.co.uk", "outlook.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com",
  "gmx.com", "zoho.com", "yandex.com", "mail.com", "pm.me", "tutanota.com",
]);

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

async function domainHasMx(domain: string): Promise<boolean> {
  try {
    const mx = await dns.resolveMx(domain);
    return Array.isArray(mx) && mx.length > 0;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const position = String(body.position ?? "").trim();
    const agreed = body.agreed === true;
    const newsletter = body.newsletter === true;
    const url = String(body.url ?? "").trim();

    if (!firstName || !lastName) {
      return NextResponse.json({ error: "Please enter your first and last name." }, { status: 400 });
    }
    if (!agreed) {
      return NextResponse.json({ error: "Please agree to receive your audit by email." }, { status: 400 });
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    const domain = email.split("@")[1];
    if (FREE_PROVIDERS.has(domain)) {
      return NextResponse.json(
        { error: "Please use your company email — free inboxes (Gmail, Yahoo, Outlook, etc.) aren't accepted." },
        { status: 400 }
      );
    }
    if (!(await domainHasMx(domain))) {
      return NextResponse.json(
        { error: "That email domain doesn't appear to receive mail. Please check your company email." },
        { status: 400 }
      );
    }

    const lead: Lead = {
      id: randomUUID(),
      firstName, lastName, email,
      company: domain,
      position: position || undefined,
      agreed,
      newsletter,
      url,
      createdAt: new Date().toISOString(),
    };
    // Safety net first: store locally so a lead is never lost even if the
    // Sheets push fails. Redis is a silent backup + powers the report email.
    await saveLead(lead);

    // Append to Google Sheets in the BACKGROUND (not awaited): the CRM push must
    // never delay the user or the audit. The lead is already saved above, so if
    // the push fails we still have it.
    if (sheetsConfigured()) {
      void pushLeadToSheet(lead).catch((err) => {
        console.error("[lead] Sheets push failed (lead saved to backup):", err);
      });
    }

    return NextResponse.json({ ok: true, leadId: lead.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Could not save your details." }, { status: 500 });
  }
}
