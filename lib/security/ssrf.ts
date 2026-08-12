// lib/security/ssrf.ts
// SSRF (Server-Side Request Forgery) protection for user-supplied URLs.
//
// The audit tool fetches whatever URL a user submits, server-side. Without
// this guard, an attacker could point it at internal-only addresses — most
// dangerously the cloud metadata endpoint (169.254.169.254) which can expose
// IAM credentials, or internal services on the private network. This module
// is the single chokepoint every user-URL fetch must pass through.
//
// Approach: resolve the hostname to its real IP address(es) and reject any
// that fall in private / loopback / link-local / reserved ranges — BEFORE we
// connect. We also re-validate on every redirect hop (a public URL can 302 to
// an internal one), and only allow http/https schemes.

import { lookup } from "node:dns/promises";
import net from "node:net";

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

// Returns true if an IPv4/IPv6 address is in a range that must never be
// reachable from a user-supplied URL.
export function isBlockedIp(ip: string): boolean {
  const type = net.isIP(ip);
  if (type === 4) return isBlockedIpv4(ip);
  if (type === 6) return isBlockedIpv6(ip);
  return true; // not a valid IP literal -> refuse rather than risk it
}

function isBlockedIpv4(ip: string): boolean {
  const p = ip.split(".").map((n) => parseInt(n, 10));
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0) return true;                          // 0.0.0.0/8 "this host"
  if (a === 10) return true;                         // 10.0.0.0/8 private
  if (a === 127) return true;                        // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true;           // 169.254.0.0/16 link-local (cloud metadata!)
  if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true;           // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0) return true;             // 192.0.0.0/24 & 192.0.2.0/24 special-use
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a >= 224) return true;                         // 224+ multicast / reserved / broadcast
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const addr = ip.toLowerCase().split("%")[0]; // strip zone id
  if (addr === "::1" || addr === "::") return true;               // loopback / unspecified
  if (addr.startsWith("fe80")) return true;                       // link-local
  if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // unique-local
  if (addr.startsWith("ff")) return true;                         // multicast
  const mapped = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);       // IPv4-mapped
  if (mapped) return isBlockedIpv4(mapped[1]);
  if (addr === "::ffff:0:0" || addr.startsWith("64:ff9b")) return true; // NAT64
  return false;
}

// Validate a URL string is safe to fetch. Throws SsrfError if not; returns the
// parsed URL if OK. Resolves DNS and checks EVERY resolved IP.
export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
  } catch {
    throw new SsrfError("Invalid URL.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new SsrfError(`Blocked scheme: ${u.protocol}`);
  }
  if (u.username || u.password) throw new SsrfError("Credentials in URL not allowed.");

  const host = u.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new SsrfError("URL points to a private or reserved address.");
    return u;
  }

  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new SsrfError("Could not resolve host.");
  }
  if (!records.length) throw new SsrfError("Host did not resolve.");
  for (const r of records) {
    if (isBlockedIp(r.address)) {
      throw new SsrfError("URL resolves to a private or reserved address.");
    }
  }
  return u;
}

// A fetch() wrapper that enforces the SSRF guard on the initial URL AND on
// every redirect hop (by following redirects manually). Drop-in replacement
// for a plain fetch of a user-supplied URL.
export async function safeFetchGuarded(
  rawUrl: string,
  opts: RequestInit & { timeoutMs?: number; maxRedirects?: number } = {}
): Promise<Response> {
  const { timeoutMs = 30_000, maxRedirects = 5, ...init } = opts;
  let current = rawUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const validated = await assertSafeUrl(current); // throws SsrfError if unsafe
    const res = await fetch(validated.toString(), {
      ...init,
      redirect: "manual", // we follow manually so each hop is re-validated
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      current = new URL(loc, validated).toString();
      continue;
    }
    return res;
  }
  throw new SsrfError("Too many redirects.");
}
