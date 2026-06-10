export function checkAuth(req: {
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
}): boolean {
  const secret = process.env.COMPANION_SECRET;
  if (!secret) return false;
  // Accept secret via header or query param (Vapi doesn't always forward headers)
  const header = req.headers["x-companion-secret"];
  const headerVal = Array.isArray(header) ? header[0] : header;
  if (headerVal === secret) return true;
  const query = req.query?.["secret"];
  const queryVal = Array.isArray(query) ? query[0] : query;
  return queryVal === secret;
}
