import type { IncomingMessage, ServerResponse } from "http";
import { checkAuth } from "../lib/auth";
import { getSheetData } from "../lib/sources/sheetSource";
import { readBody, vapiOk, vapiError, formatPerson } from "../lib/vapiAdapter";
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
    const result = await getSheetData();

    if (!result.ok) {
      void sendAlert(result.reason, result.diagnostics);
      vapiError(res, toolCallId, "Person information is unavailable right now. James needs to check it.");
      return;
    }

    const { name, preferredName, contacts } = result.data;
    vapiOk(res, toolCallId, formatPerson(name, preferredName, contacts));
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    console.error(`[person] unexpected error: ${msg}`);
    void sendAlert("unknown", msg);
    vapiError(res, toolCallId, "Person information is unavailable right now. [unknown]");
  }
}
