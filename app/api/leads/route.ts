// app/api/leads/route.ts
// Protected view/export of captured leads (to demo to stakeholders).
// Auth: pass ?secret=INTERNAL_SECRET  (same secret already in your env).
// Add &format=csv for a downloadable CSV.
import { NextRequest, NextResponse } from "next/server";
import { listLeads } from "@/lib/store/leads";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const leads = await listLeads();

  if (req.nextUrl.searchParams.get("format") === "csv") {
    const header = "createdAt,firstName,lastName,email,company,position,url,agreed";
    const rows = leads.map((l) =>
      [l.createdAt, l.firstName, l.lastName, l.email, l.company, l.position ?? "", l.url, l.agreed]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
    );
    return new NextResponse([header, ...rows].join("\n"), {
      headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="leads.csv"' },
    });
  }
  return NextResponse.json({ count: leads.length, leads });
}
