// app/seo/page.tsx — internal team entry. Full report, no lead gate, nothing blurred.
// Reached via the secret path (e.g. /seo). Keep this URL internal.
import { Landing } from "@/components/Landing";

export default function InternalHome() {
  return <Landing internal={true} />;
}
