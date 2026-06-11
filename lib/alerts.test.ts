const mockSendMail = jest.fn().mockResolvedValue({ messageId: "mocked" });
const mockCreateTransport = jest.fn().mockReturnValue({ sendMail: mockSendMail });

jest.mock("nodemailer", () => ({
  createTransport: (...args: unknown[]) => mockCreateTransport(...args),
}));

import { sendAlert, _resetDebounce } from "./alerts";

describe("sendAlert (debounce)", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-06-10T00:00:00Z"));

    process.env = {
      ...ORIGINAL_ENV,
      GMAIL_USER: "carer@gmail.com",
      GMAIL_APP_PASSWORD: "test-app-password",
      ALERT_TO: "carer@gmail.com",
    };

    mockSendMail.mockClear();
    mockCreateTransport.mockClear();
    _resetDebounce();
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = ORIGINAL_ENV;
  });

  test("first call sends the email", async () => {
    await sendAlert("stale");
    expect(mockSendMail).toHaveBeenCalledTimes(1);

    const arg = mockSendMail.mock.calls[0]![0] as {
      from: string; to: string; subject: string; text: string;
    };
    expect(arg.from).toBe("carer@gmail.com");
    expect(arg.to).toBe("carer@gmail.com");
    expect(arg.subject).toBe("Companion alert: schedule not updated");
    expect(arg.text).toContain("not been updated for today");
  });

  test("second call within 6h is suppressed", async () => {
    await sendAlert("stale");
    expect(mockSendMail).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date("2026-06-10T05:59:00Z"));
    await sendAlert("stale");

    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  test("call after 6h sends again", async () => {
    await sendAlert("stale");
    expect(mockSendMail).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date("2026-06-10T06:01:00Z"));
    await sendAlert("stale");

    expect(mockSendMail).toHaveBeenCalledTimes(2);
  });

  test("detail string is appended to email body", async () => {
    await sendAlert("fetch_403", "Drive 403: The caller does not have permission");
    const arg = mockSendMail.mock.calls[0]![0] as { subject: string; text: string };
    expect(arg.subject).toBe("Companion alert: document access denied (403)");
    expect(arg.text).toContain("Detail: Drive 403: The caller does not have permission");
  });

  test("missing env vars suppress send without throwing", async () => {
    delete process.env.GMAIL_APP_PASSWORD;
    await sendAlert("stale");
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});
