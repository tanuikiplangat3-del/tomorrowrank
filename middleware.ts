// middleware.ts
// Two security controls enforced at the edge, before any route handler runs:
//
//  1. RATE LIMITING (H2) — caps how often a single IP can start audits and
//     submit leads, so nobody can script the tool to run up paid-API spend or
//     use it to hammer third-party sites. Best-effort via Upstash Redis; if
//     Redis is unavailable it FAILS OPEN (never blocks a real user because the
//     limiter itself had a problem).
//
//  2. INTERNAL-TOOL GATE (H3) — the /seo internal tool (no lead gate, deep
//     500-page audits) was previously protected only by an unlisted URL
//     ("security by obscurity"). Now it requires a one-time key: visit
//     /seo?key=THE_SECRET once, which sets a signed cookie, and the team stays
//     unlocked on that device. Anyone without the cookie is redirected to the
//     public tool. No key in the URL on every visit, no mid-session lockout.

import { NextRequest, NextResponse } from "next/server";

// NOTE: basePath (/ranktomorrow) is applied by Next AFTER middleware matching,
// so paths here are matched WITHOUT the basePath prefix.
const INTERNAL_COOKIE = "wt_internal";

// --- simple fixed-window rate limit in Redis via the REST API (no SDK import
// needed in the edge runtime; we call the REST endpoint directly) ---
async function rateLimit(ip: string, bucket: string, limit: number, windowSec: number): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return true; // fail open — no limiter configured

  const key = `rl:${bucket}:${ip}`;
  try {
    // INCR then set expiry on first hit. Two pipelined commands.
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR", key], ["EXPIRE", key, String(windowSec), "NX"]]),
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return true; // fail open
    const out = (await res.json()) as { result: any }[];
    const count = Number(out?.[0]?.result ?? 0);
    return count <= limit;
  } catch {
    return true; // fail open on any limiter error
  }
}

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // ---- 2. INTERNAL GATE for /seo ----
  if (pathname === "/seo" || pathname.startsWith("/seo/")) {
    const secret = process.env.INTERNAL_SECRET;
    // If no secret is configured we don't lock (avoids accidentally bricking
    // the internal tool); the gate only activates once INTERNAL_SECRET is set.
    if (secret) {
      const provided = searchParams.get("key");
      const cookie = req.cookies.get(INTERNAL_COOKIE)?.value;
      if (provided && provided === secret) {
        // Correct key in URL -> set cookie and redirect to the clean URL.
        const clean = req.nextUrl.clone();
        clean.searchParams.delete("key");
        const res = NextResponse.redirect(clean);
        res.cookies.set(INTERNAL_COOKIE, secret, {
          httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
        });
        return res;
      }
      if (cookie !== secret) {
        // Not unlocked -> send to the public tool.
        const home = req.nextUrl.clone();
        home.pathname = "/";
        home.search = "";
        return NextResponse.redirect(home);
      }
    }
  }

  // ---- 1. RATE LIMIT sensitive POST endpoints ----
  if (req.method === "POST" && (pathname === "/api/audit/start" || pathname === "/api/lead")) {
    const ip = clientIp(req);
    // Audit starts: 10 per 10 min per IP. Lead submits: 20 per 10 min.
    const isAudit = pathname === "/api/audit/start";
    const ok = await rateLimit(ip, isAudit ? "audit" : "lead", isAudit ? 10 : 20, 600);
    if (!ok) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/seo", "/seo/:path*", "/api/audit/start", "/api/lead"],
};
