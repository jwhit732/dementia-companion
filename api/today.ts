import type { IncomingMessage, ServerResponse } from "http";
import { checkAuth } from "../lib/auth";
import { getDocText, DocReaderError } from "../lib/docReader";
import { parseDoc } from "../lib/parser";
import { readBody, vapiOk, vapiError, formatSchedule } from "../lib/vapiAdapter";
import { sendAlert } from "../lib/alerts";

export default async function handler(
  req: IncomingMessage & { query?: Record<string, string | string[]> },
  res: ServerResponse
): Promise<void> {
  const body = await readBody(req);
  const toolCallId = body.message?.toolCallList?.[0]?.id ?? "unknown";

  if (!checkAuth({ headers: req.headers as Record<string, string | string[] | undefined>, query: req.query })) {
    vapiError(res, toolCallId, "unauthorized");
    return;
  }

  try {
    const raw = await getDocText();
    const result = parseDoc(raw);

    if (!result.ok) {
      void sendAlert(result.reason);
      vapiError(res, toolCallId, result.reason === "stale"
        ? "The schedule has not been updated for today. James needs to update it. [stale]"
        : "The document could not be read. James needs to check it. [parse_error]");
      return;
    }

    vapiOk(res, toolCallId, formatSchedule(result.data.schedule));
  } catch (err) {
    if (err instanceof DocReaderError) {
      console.error(`[today] doc fetch failed: reason=${err.reason} message=${err.message}`);
      void sendAlert(err.reason, err.message);
      vapiError(res, toolCallId, `The schedule is unavailable right now. [${err.reason}]`);
    } else {
      console.error(`[today] unexpected error: ${(err as Error).message ?? String(err)}`);
      void sendAlert("unknown", (err as Error).message);
      vapiError(res, toolCallId, "The schedule is unavailable right now. [unknown]");
    }
  }
}
