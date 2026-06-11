import { EventEmitter } from "events";
import type { IncomingMessage, ServerResponse } from "http";
import { extractToolInfo, calcDuration, toAest } from "../api/call-report";

// ─── pure-function tests ──────────────────────────────────────────────────────

describe("extractToolInfo", () => {
  test("returns 'none' and empty status for empty messages", () => {
    expect(extractToolInfo([])).toEqual({ fired: "none", status: "" });
  });

  test("extracts a single tool name from assistant toolCalls", () => {
    const { fired } = extractToolInfo([
      { role: "assistant", toolCalls: [{ id: "tc1", function: { name: "get_today_schedule" } }] },
    ]);
    expect(fired).toBe("get_today_schedule");
  });

  test("extracts multiple tool names across messages", () => {
    const { fired } = extractToolInfo([
      { role: "assistant", toolCalls: [{ id: "tc1", function: { name: "get_today_schedule" } }] },
      { role: "assistant", toolCalls: [{ id: "tc2", function: { name: "get_reminders" } }] },
    ]);
    expect(fired).toBe("get_today_schedule, get_reminders");
  });

  test("marks tool result as ok when content is non-empty", () => {
    const { status } = extractToolInfo([
      { role: "tool", toolCallId: "tc1", content: "Today Marg has: 10:00 AM: Dr Patel." },
    ]);
    expect(status).toBe("tc1: ok");
  });

  test("marks tool result as error when content is empty", () => {
    const { status } = extractToolInfo([
      { role: "tool", toolCallId: "tc1", content: "" },
    ]);
    expect(status).toBe("tc1: error");
  });

  test("handles a full realistic conversation", () => {
    const { fired, status } = extractToolInfo([
      { role: "system", content: "You are a companion..." },
      { role: "user", content: "What's on today?" },
      { role: "assistant", toolCalls: [{ id: "tc1", function: { name: "get_today_schedule" } }] },
      { role: "tool", toolCallId: "tc1", content: "Today Marg has: 10:00 AM: Dr Patel." },
      { role: "assistant", content: "You have a doctor's appointment at ten." },
      { role: "user", content: "And my reminders?" },
      { role: "assistant", toolCalls: [{ id: "tc2", function: { name: "get_reminders" } }] },
      { role: "tool", toolCallId: "tc2", content: "Reminders: Don't drive." },
    ]);
    expect(fired).toBe("get_today_schedule, get_reminders");
    expect(status).toBe("tc1: ok, tc2: ok");
  });

  test("ignores non-tool, non-assistant messages", () => {
    const { fired, status } = extractToolInfo([
      { role: "system", content: "system prompt" },
      { role: "user", content: "hello" },
    ]);
    expect(fired).toBe("none");
    expect(status).toBe("");
  });
});

describe("calcDuration", () => {
  test("returns 0 when timestamps are missing", () => {
    expect(calcDuration(undefined, undefined)).toBe(0);
    expect(calcDuration("2026-06-11T02:00:00Z", undefined)).toBe(0);
    expect(calcDuration(undefined, "2026-06-11T02:05:00Z")).toBe(0);
  });

  test("calculates correct duration in seconds", () => {
    expect(calcDuration("2026-06-11T02:00:00Z", "2026-06-11T02:05:00Z")).toBe(300);
  });

  test("rounds to nearest second", () => {
    expect(calcDuration("2026-06-11T02:00:00.000Z", "2026-06-11T02:00:00.600Z")).toBe(1);
  });
});

// ─── handler integration tests ────────────────────────────────────────────────

const mockAppend = jest.fn().mockResolvedValue(undefined);
jest.mock("../lib/journal", () => ({ appendJournalRow: (...args: unknown[]) => mockAppend(...args) }));

import handler from "../api/call-report";

function makeReq(body: string, query: Record<string, string> = {}): IncomingMessage & { query: typeof query } {
  const req = new EventEmitter() as IncomingMessage & { query: typeof query };
  req.headers = {};
  req.query = query;
  process.nextTick(() => {
    req.emit("data", Buffer.from(body));
    req.emit("end");
  });
  return req;
}

function makeRes(): ServerResponse & { body: () => string } {
  const chunks: string[] = [];
  const res = new EventEmitter() as unknown as ServerResponse & { body: () => string };
  (res as unknown as { statusCode: number }).statusCode = 200;
  res.setHeader = () => res;
  res.end = (data?: unknown) => { if (data) chunks.push(String(data)); return res; };
  res.body = () => chunks.join("");
  return res;
}

describe("call-report handler", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, COMPANION_SECRET: "test-secret" };
    mockAppend.mockClear();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  test("rejects requests with wrong secret", async () => {
    const req = makeReq("{}", { secret: "wrong" });
    const res = makeRes();
    await handler(req, res as unknown as ServerResponse);
    expect((res as unknown as { statusCode: number }).statusCode).toBe(401);
  });

  test("ignores non-report event types", async () => {
    const req = makeReq(
      JSON.stringify({ message: { type: "status-update" } }),
      { secret: "test-secret" }
    );
    const res = makeRes();
    await handler(req, res as unknown as ServerResponse);
    expect(mockAppend).not.toHaveBeenCalled();
    expect(JSON.parse(res.body())).toEqual({ ok: true });
  });

  test("appends a journal row for a valid end-of-call-report", async () => {
    const payload = {
      message: {
        type: "end-of-call-report",
        summary: "Margaret asked about her schedule.",
        messages: [
          { role: "assistant", toolCalls: [{ id: "tc1", function: { name: "get_today_schedule" } }] },
          { role: "tool", toolCallId: "tc1", content: "Today Marg has: 10:00 AM: Dr Patel." },
        ],
        call: {
          id: "call-abc",
          startedAt: "2026-06-11T02:00:00Z",
          endedAt: "2026-06-11T02:05:00Z",
          customer: { number: "+61412345678" },
        },
      },
    };

    const req = makeReq(JSON.stringify(payload), { secret: "test-secret" });
    const res = makeRes();
    await handler(req, res as unknown as ServerResponse);

    expect(mockAppend).toHaveBeenCalledTimes(1);
    const row = mockAppend.mock.calls[0]![0] as Record<string, unknown>;
    expect(row.callId).toBe("call-abc");
    expect(row.caller).toBe("+61412345678");
    expect(row.durationSecs).toBe(300);
    expect(row.toolsFired).toBe("get_today_schedule");
    expect(row.toolStatus).toBe("tc1: ok");
    expect(row.summary).toBe("Margaret asked about her schedule.");
    expect(row.transcriptLink).toBe("https://dashboard.vapi.ai/calls/call-abc");
    expect(JSON.parse(res.body())).toEqual({ ok: true });
  });
});
