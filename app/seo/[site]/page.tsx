// app/seo/[site]/page.tsx — internal entry with the audited site in the path,
// e.g. /ranktomorrow/seo/welcometomorrow.io. Mirrors app/[site]/page.tsx but
// for the internal (ungated) tool at /seo.
import { Landing } from "@/components/Landing";

export default function InternalSiteAudit({ params }: { params: { site: string } }) {
  return <Landing internal={true} initialUrl={params.site} />;
}
