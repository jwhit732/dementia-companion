import { merge } from "../lib/merge";
import type { SheetData } from "../lib/sources/sheetSource";
import type { ScheduleItem } from "../lib/schema";

// Fixed now: Friday 20 June 2026 10:00 AM Brisbane (UTC 00:00)
const NOW = new Date(Date.UTC(2026, 5, 20, 0, 0, 0));

const SHEET: SheetData = {
  name: "Margaret Thompson",
  preferredName: "Marg",
  reminders: ["Take blood pressure tablet at 8am"],
  contacts: [{ name: "James Thompson", relationship: "son", phone: "0400 000 000" }],
  personaKnobs: {
    preferred_name: "Marg",
    persona_name: "Companion",
    greeting_style: "warm",
    redirect_contact: "James",
  },
};

const CAL_ITEMS: ScheduleItem[] = [
  { time: "9:00 AM", title: "Blood test", location: "Mater Pathology" },
  { time: "2:00 PM", title: "Dr Patel", location: "Townsville Medical" },
];

test("merge produces valid Doc with today's Brisbane date", () => {
  const doc = merge(SHEET, CAL_ITEMS, NOW);
  expect(doc.scheduleDate).toBe("2026-06-20");
  expect(doc.name).toBe("Margaret Thompson");
  expect(doc.preferredName).toBe("Marg");
  expect(doc.reminders).toHaveLength(1);
  expect(doc.contacts).toHaveLength(1);
});

test("merge sorts calendar items by time", () => {
  const shuffled: ScheduleItem[] = [
    { time: "2:00 PM", title: "Dr Patel" },
    { time: "9:00 AM", title: "Blood test" },
  ];
  const doc = merge(SHEET, shuffled, NOW);
  expect(doc.schedule[0]?.time).toBe("9:00 AM");
  expect(doc.schedule[1]?.time).toBe("2:00 PM");
});

test("merge deduplicates identical time+title entries", () => {
  const dup: ScheduleItem[] = [
    { time: "9:00 AM", title: "Blood test", location: "Mater" },
    { time: "9:00 AM", title: "Blood test", location: "Mater" }, // duplicate
    { time: "2:00 PM", title: "Dr Patel" },
  ];
  const doc = merge(SHEET, dup, NOW);
  expect(doc.schedule).toHaveLength(2);
});

test("merge deduplicates case-insensitively", () => {
  const dup: ScheduleItem[] = [
    { time: "9:00 AM", title: "Blood Test" },
    { time: "9:00 AM", title: "blood test" },
  ];
  const doc = merge(SHEET, dup, NOW);
  expect(doc.schedule).toHaveLength(1);
});

test("merge with empty calendar items yields empty schedule", () => {
  const doc = merge(SHEET, [], NOW);
  expect(doc.schedule).toHaveLength(0);
  expect(doc.reminders).toHaveLength(1); // sheet reminders unaffected
});

test("merge with all-day event sorts it first (minutes = -1)", () => {
  const items: ScheduleItem[] = [
    { time: "9:00 AM", title: "Blood test" },
    { time: "All day", title: "Public holiday" },
  ];
  const doc = merge(SHEET, items, NOW);
  expect(doc.schedule[0]?.time).toBe("All day");
  expect(doc.schedule[1]?.time).toBe("9:00 AM");
});
