// lib/leadmatch.ts
// Pure helper (safe on client + server) that checks whether a work email's
// domain matches the domain being audited. Used to ensure a lead's company
// email belongs to the site they're auditing (e.g. auditing ecopulse.co.ke
// requires an @ecopulse.co.ke email). Tolerates www. and sub-domains
// (blog.acme.com vs joe@acme.com) without needing a full public-suffix list.

export function siteHost(siteUrl: string): string | null {
  try {
    const h = new URL(siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`).hostname.toLowerCase();
    return h.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function emailDomain(email: string): string | null {
  const d = email.split("@")[1]?.toLowerCase().trim();
  if (!d) return null;
  return d.replace(/^www\./, "");
}

/**
 * True when the email's domain belongs to the audited site.
 * Matches exact domain, or either being a sub-domain of the other.
 */
export function emailMatchesSite(email: string, siteUrl: string): boolean {
  const host = siteHost(siteUrl);
  const ed = emailDomain(email);
  if (!host || !ed) return false;
  if (ed === host) return true;
  if (host.endsWith("." + ed)) return true; // email @acme.com, site blog.acme.com
  if (ed.endsWith("." + host)) return true; // email @mail.acme.com, site acme.com
  return false;
}
