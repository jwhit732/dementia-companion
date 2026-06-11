import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deterministicNormalise } from "../lib/normaliser";

// Brisbane Wednesday 11 June 2026, 1:00 PM (UTC 03:00)
const NOW = new Date("2026-06-11T03:00:00Z");

function load(name: string): string {
  return readFileSync(resolve(__dirname, "fixtures", name), "utf8");
}

describe("deterministicNormalise — messy fixtures (all must parse)", () => {
  test("various bullet glyphs (•, ·, →)", () => {
    const r = deterministicNormalise(load("messy-bullets.txt"), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.schedule).toHaveLength(3);
    expect(r.data.reminders).toHaveLength(2);
  });

  test("'today' keyword as date", () => {
    const r = deterministicNormalise(load("messy-date-today.txt"), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.scheduleDate).toBe("2026-06-11");
  });

  test("day + month without year defaults to current year", () => {
    const r = deterministicNormalise(load("messy-date-no-year.txt"), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.scheduleDate).toBe("2026-06-11");
  });

  test("numeric DD/MM/YYYY date", () => {
    const r = deterministicNormalise(load("messy-date-numeric.txt"), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.scheduleDate).toBe("2026-06-11");
  });

  test("all headers lowercase", () => {
    const r = deterministicNormalise(load("messy-lowercase-headers.txt"), NOW);
    expect(r.ok).toBe(true);
  });

  test("'Preferred:' shorthand accepted", () => {
    const r = deterministicNormalise(load("messy-preferred-shorthand.txt"), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.preferredName).toBe("Marg");
  });

  test("bare hour numbers inferred (10 → 10:00 AM, 14 → 2:00 PM)", () => {
    const r = deterministicNormalise(load("messy-bare-times.txt"), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.schedule[0]?.time).toBe("10:00 AM");
    expect(r.data.schedule[1]?.time).toBe("2:00 PM");
  });

  test("en dash as bullet, mixed separator types", () => {
    const r = deterministicNormalise(load("messy-mixed-dashes.txt"), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.schedule).toHaveLength(2);
  });
});

describe("deterministicNormalise — failure cases with diagnostics", () => {
  test("unparseable schedule line returns diagnostics naming the line", () => {
    const doc = [
      "Name: Margaret Thompson",
      "Preferred name: Marg",
      "",
      "Today (Wednesday 11 June 2026):",
      "- just words not a schedule item",
      "",
      "Reminders:",
      "- Don't drive",
      "",
      "Contacts:",
      "- James (son): 0400 000 000",
    ].join("\n");

    const r = deterministicNormalise(doc, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("parse_error");
    expect(r.diagnostics).toContain("just words not a schedule item");
    expect(r.diagnostics).toContain("Expected");
  });

  test("missing Contacts section returns diagnostics naming absence", () => {
    const doc = [
      "Name: Margaret Thompson",
      "Preferred name: Marg",
      "",
      "Today (Wednesday 11 June 2026):",
      "",
      "Reminders:",
      "- Don't drive",
    ].join("\n");

    const r = deterministicNormalise(doc, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("parse_error");
    expect(r.diagnostics).toContain("Contacts");
  });

  test("date-only header with no parseable date returns diagnostics", () => {
    const doc = [
      "Name: Margaret Thompson",
      "Preferred name: Marg",
      "",
      "Today (Thursday):",
      "",
      "Reminders:",
      "- Don't drive",
      "",
      "Contacts:",
      "- James (son): 0400 000 000",
    ].join("\n");

    const r = deterministicNormalise(doc, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("parse_error");
    expect(r.diagnostics).toContain("date");
  });
});

describe("deterministicNormalise — needs-ai fixtures (deferred until LLM normaliser)", () => {
  test.skip("freeform natural language schedule", () => {
    const r = deterministicNormalise(load("needs-ai/freeform-schedule.txt"), NOW);
    expect(r.ok).toBe(true);
  });

  test.skip("casual prose update style", () => {
    const r = deterministicNormalise(load("needs-ai/casual-update.txt"), NOW);
    expect(r.ok).toBe(true);
  });
});
