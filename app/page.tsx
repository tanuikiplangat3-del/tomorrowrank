// app/page.tsx — external entry (public). Lead gate + gated report.
import { Landing } from "@/components/Landing";

export default function Home() {
  return <Landing internal={false} />;
}
