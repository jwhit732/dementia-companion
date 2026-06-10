import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDoc } from "../lib/parser";

/**
 * The fixtures all use Tuesday 10 June 2025 as "today". We construct a
 * Date that resolves to that calendar date in Australia/Brisbane (UTC+10,
 * no DST). 2025-06-10T03:00:00Z is 1:00 PM Brisbane on 10 June 2025.
 */
const TODAY_BRISBANE = new Date("2025-06-10T03:00:00Z");

function loadFixture(name: string): string {
  return readFileSync(resolve(__dirname, "fixtures", name), "utf8");
}

describe("parseDoc", () => {
  test("well-formed.txt parses into a Doc with correct fields", () => {
    const raw = loadFixture("well-formed.txt");
    const result = parseDoc(raw, TODAY_BRISBANE);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.name).toBe("Margaret Thompson");
    expect(result.data.preferredName).toBe("Marg");
    expect(result.data.scheduleDate).toBe("2025-06-10");

    expect(result.data.schedule).toEqual([
      {
        time: "10:00 AM",
        title: "Dr Patel",
        location: "skin check, Greenslopes Medical",
      },
      {
        time: "12:30 PM",
        title: "Lunch with Sophie",
        location: "home",
      },
      {
        time: "2:00 PM",
        title: "Afternoon tablets",
      },
    ]);

    expect(result.data.reminders).toEqual([
      "Don't drive — licence surrendered March 2026",
      "Sophie is David's daughter",
    ]);

    expect(result.data.contacts).toEqual([
      { name: "James", relationship: "son", phone: "0400 000 000" },
      { name: "Sophie", relationship: "granddaughter", phone: "0411 222 333" },
      { name: "Dr Patel", relationship: "GP" },
    ]);
  });

  test("missing-sections.txt returns parse_error", () => {
    const raw = loadFixture("missing-sections.txt");
    const result = parseDoc(raw, TODAY_BRISBANE);
    expect(result).toEqual({ ok: false, reason: "parse_error" });
  });

  test("malformed-times.txt returns parse_error", () => {
    const raw = loadFixture("malformed-times.txt");
    const result = parseDoc(raw, TODAY_BRISBANE);
    expect(result).toEqual({ ok: false, reason: "parse_error" });
  });

  test("stale-date.txt returns stale", () => {
    const raw = loadFixture("stale-date.txt");
    const result = parseDoc(raw, TODAY_BRISBANE);
    expect(result).toEqual({ ok: false, reason: "stale" });
  });

  test("empty-schedule.txt parses with empty schedule array", () => {
    const raw = loadFixture("empty-schedule.txt");
    const result = parseDoc(raw, TODAY_BRISBANE);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.schedule).toEqual([]);
    expect(result.data.reminders.length).toBeGreaterThan(0);
    expect(result.data.contacts.length).toBeGreaterThan(0);
  });

  test("parser never throws on garbage input", () => {
    const inputs = [
      "",
      "\u0000",
      "random words with no structure",
      "Name: x\nPreferred name: y\nToday (notadate):\nReminders:\nContacts:\n",
    ];
    for (const input of inputs) {
      expect(() => parseDoc(input, TODAY_BRISBANE)).not.toThrow();
      const result = parseDoc(input, TODAY_BRISBANE);
      expect(result.ok).toBe(false);
    }
  });
});
