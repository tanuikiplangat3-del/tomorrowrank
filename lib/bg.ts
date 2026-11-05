// lib/bg.ts
// Run a promise as background work that survives the response.
//
// On Cloudflare Workers the isolate is destroyed as soon as the Response is
// returned, which silently kills floating promises. ctx.waitUntil() keeps the
// isolate alive until the promise settles. On Node the process is long-lived,
// so a floating promise is already safe and we just let it run.
export async function runInBackground(task: Promise<unknown>): Promise<void> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = getCloudflareContext?.()?.ctx as
      | { waitUntil?: (p: Promise<unknown>) => void }
      | undefined;
    if (typeof ctx?.waitUntil === "function") {
      ctx.waitUntil(task);
      return;
    }
  } catch {
    // Not on Cloudflare.
  }
  void task; // Node: process stays alive
}
