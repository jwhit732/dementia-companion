import type { Doc } from "./schema";
import { deterministicNormalise } from "./normaliser";

export { normaliseTime } from "./normaliser";

export type ParseResult =
  | { ok: true; data: Doc }
  | { ok: false; reason: "stale" | "parse_error" | "unavailable" };

// Backward-compatible wrapper for existing tests and consumers.
// Use deterministicNormalise directly to access the diagnostics field.
export function parseDoc(raw: string, now: Date = new Date()): ParseResult {
  const r = deterministicNormalise(raw, now);
  if (r.ok) return r;
  return { ok: false, reason: r.reason };
}
