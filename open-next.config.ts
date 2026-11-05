// open-next.config.ts
// Minimal configuration: the tool keeps all job state in Upstash Redis over
// HTTP, so we do not need Cloudflare KV/D1/R2 for incremental cache or tags.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
