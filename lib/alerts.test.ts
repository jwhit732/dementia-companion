/**
 * Unit tests for `sendAlert` debounce behaviour.
 *
 * We mock the `resend` package so no network calls are made. The mock's
 * `emails.send` is asserted against to verify whether an email was sent.
 */

const mockSend = jest.fn().mockResolvedValue({ id: "mocked" });

jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

import { sendAlert, _resetDebounce } from "./alerts";

describe("sendAlert (debounce)", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-06-10T00:00:00Z"));

    process.env = {
      ...ORIGINAL_ENV,
      RESEND_API_KEY: "test-key",
      ALERT_FROM: "alerts@example.com",
      ALERT_TO: "carer@example.com",
    };

    mockSend.mockClear();
    _resetDebounce();
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = ORIGINAL_ENV;
  });

  test("first call sends the email", async () => {
    await sendAlert("stale");
    expect(mockSend).toHaveBeenCalledTimes(1);

    const arg = mockSend.mock.calls[0]![0] as {
      from: string;
      to: string;
      subject: string;
      text: string;
    };
    expect(arg.from).toBe("alerts@example.com");
    expect(arg.to).toBe("carer@example.com");
    expect(arg.subject).toBe("Companion alert: schedule not updated");
    expect(arg.text).toContain("not been updated");
  });

  test("second call within 6h is suppressed", async () => {
    await sendAlert("stale");
    expect(mockSend).toHaveBeenCalledTimes(1);

    // Advance 5h59m — still inside debounce window.
    jest.setSystemTime(new Date("2026-06-10T05:59:00Z"));
    await sendAlert("stale");

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test("call after 6h sends again", async () => {
    await sendAlert("stale");
    expect(mockSend).toHaveBeenCalledTimes(1);

    // Advance 6h1m — outside debounce window.
    jest.setSystemTime(new Date("2026-06-10T06:01:00Z"));
    await sendAlert("stale");

    expect(mockSend).toHaveBeenCalledTimes(2);
  });
});
