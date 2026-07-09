// app/[site]/page.tsx — public entry with the audited site in the path,
// e.g. /ranktomorrow/welcometomorrow.io. Reached either directly (prefills the
// input) or via history.replaceState once an audit starts (see AuditApp).
// Next.js matches static routes (audit, seo, api, …) before this catch-all
// segment, so it never shadows them.
import { Landing } from "@/components/Landing";

export default function SiteAudit({ params }: { params: { site: string } }) {
  return <Landing internal={false} initialUrl={params.site} />;
}
