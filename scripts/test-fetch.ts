import { getDocText } from "../lib/docReader";

/**
 * Smoke test for `getDocText()`:
 *   1. First call should fetch from Drive (cache miss).
 *   2. Second call within 60s should hit the in-memory cache.
 */
async function main(): Promise<void> {
  console.log("[test-fetch] first call \u2014 expecting cache miss");
  const first = await getDocText();
  console.log(`[test-fetch] first 200 chars:\n${first.slice(0, 200)}`);

  console.log("[test-fetch] second call \u2014 expecting cache hit");
  const second = await getDocText();
  console.log(`[test-fetch] second call returned ${second.length} chars`);
}

main().catch((err: unknown) => {
  console.error("[test-fetch] error:", err);
  process.exit(1);
});
