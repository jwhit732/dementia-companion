import { computeTimeFacts, timeToMinutes } from "../lib/timeFacts";
import type { ScheduleItem } from "../lib/schema";

// Frozen clocks (UTC values that land at specific Brisbane times)
// Brisbane = UTC+10, no DST

// Friday 20 June 2026 — various times
const brisbane = (h: number, m = 0) =>
  new Date(Date.UTC(2026, 5, 20, h - 10, m, 0)); // subtract 10h to get UTC

const T_0830 = brisbane(8, 30);   // 8:30 AM Brisbane
const T_1000 = brisbane(10, 0);   // 10:00 AM
const T_1015 = brisbane(10, 15);  // 10:15 AM
const T_1200 = brisbane(12, 0);   // noon exactly
const T_1430 = brisbane(14, 30);  // 2:30 PM
const T_1900 = brisbane(19, 0);   // 7:00 PM

const ITEMS: ScheduleItem[] = [
  { time: "9:00 AM", title: "Blood test", location: "Mater Pathology" },
  { time: "10:30 AM", title: "Physio", location: "City Physio" },
  { time: "2:00 PM", title: "Dr Patel", location: "Townsville Medical" },
];

describe("timeToMinutes", () => {
  test("12:00 AM → 0", () => expect(timeToMinutes("12:00 AM")).toBe(0));
  test("9:00 AM → 540", () => expect(timeToMinutes("9:00 AM")).toBe(540));
  test("12:00 PM → 720", () => expect(timeToMinutes("12:00 PM")).toBe(720));
  test("2:00 PM → 840", () => expect(timeToMinutes("2:00 PM")).toBe(840));
  test("All day → -1", () => expect(timeToMinutes("All day")).toBe(-1));
});

describe("computeTimeFacts — mid-morning, items ahead", () => {
  const facts = computeTimeFacts(T_0830, ITEMS);

  test("daySegment is morning", () => expect(facts.daySegment).toBe("morning"));
  test("nowTimePhrase is populated and includes AM", () => {
    expect(facts.nowTimePhrase).toMatch(/AM/i);
  });
  test("not allPassed", () => expect(facts.allPassed).toBe(false));
  test("not nothingScheduled", () => expect(facts.nothingScheduled).toBe(false));
  test("all items in remaining (nothing past yet)", () => expect(facts.remainingItems).toHaveLength(3));
  test("nextItem is blood test at 9:00 AM", () => {
    expect(facts.nextItem?.title).toBe("Blood test");
  });
  test("nextRelativePhrase is populated", () => {
    expect(facts.nextRelativePhrase.length).toBeGreaterThan(0);
  });
  test("nextAbsolutePhrase includes 'this morning'", () => {
    expect(facts.nextAbsolutePhrase).toContain("this morning");
  });
});

describe("computeTimeFacts — item in progress (started 30 min ago)", () => {
  // 10:15 AM — blood test started at 9:00 AM (75 min ago → past), physio at 10:30 is still upcoming
  const facts = computeTimeFacts(T_1015, ITEMS);

  test("blood test is past (started > 45 min ago)", () => {
    expect(facts.pastItems.some((it) => it.title === "Blood test")).toBe(true);
  });
  test("physio and Dr Patel in remaining", () => {
    const names = facts.remainingItems.map((it) => it.title);
    expect(names).toContain("Physio");
    expect(names).toContain("Dr Patel");
  });
  test("nextItem is Physio (starts in ~15 min)", () => {
    expect(facts.nextItem?.title).toBe("Physio");
  });
  test("relative phrase for physio is about 10 minutes", () => {
    // 10:30 - 10:15 = 15 min → "in about 10 minutes"
    expect(facts.nextRelativePhrase).toBe("in about 10 minutes");
  });
});

describe("computeTimeFacts — all events passed", () => {
  // 2:30 PM — all three items are past (last one at 2:00 PM, 30 min ago, within threshold)
  // Wait — 2:00 PM is 30 min ago from 2:30 PM; threshold is 45 min so Dr Patel is NOT past yet
  // Let's use 7:00 PM instead
  const facts = computeTimeFacts(T_1900, ITEMS);

  test("allPassed is true", () => expect(facts.allPassed).toBe(true));
  test("remainingItems is empty", () => expect(facts.remainingItems).toHaveLength(0));
  test("pastItems has all 3", () => expect(facts.pastItems).toHaveLength(3));
  test("nextItem is null", () => expect(facts.nextItem).toBeNull());
  test("daySegment is evening", () => expect(facts.daySegment).toBe("evening"));
});

describe("computeTimeFacts — nothing scheduled", () => {
  const facts = computeTimeFacts(T_1000, []);

  test("nothingScheduled is true", () => expect(facts.nothingScheduled).toBe(true));
  test("allPassed is false", () => expect(facts.allPassed).toBe(false));
  test("nextItem is null", () => expect(facts.nextItem).toBeNull());
});

describe("computeTimeFacts — noon boundary (morning → afternoon)", () => {
  const facts = computeTimeFacts(T_1200, ITEMS);

  test("daySegment is afternoon at exactly noon", () => {
    expect(facts.daySegment).toBe("afternoon");
  });
  test("blood test and physio are past by noon", () => {
    expect(facts.pastItems.some((it) => it.title === "Blood test")).toBe(true);
    expect(facts.pastItems.some((it) => it.title === "Physio")).toBe(true);
  });
  test("Dr Patel (2 PM) is upcoming", () => {
    expect(facts.nextItem?.title).toBe("Dr Patel");
  });
  test("nextAbsolutePhrase includes 'this afternoon'", () => {
    expect(facts.nextAbsolutePhrase).toContain("this afternoon");
  });
});

describe("computeTimeFacts — all-day event", () => {
  const itemsWithAllDay: ScheduleItem[] = [
    { time: "All day", title: "Public holiday" },
    ...ITEMS,
  ];
  const facts = computeTimeFacts(T_1900, itemsWithAllDay); // evening, everything else past

  test("all-day event stays in remaining even when everything else is past", () => {
    expect(facts.remainingItems.some((it) => it.title === "Public holiday")).toBe(true);
  });
  test("allPassed is false because all-day item remains", () => {
    expect(facts.allPassed).toBe(false);
  });
});
