export function checkAuth(req: {
  headers: Record<string, string | string[] | undefined>;
}): boolean {
  const secret = process.env.COMPANION_SECRET;
  if (!secret) return false;
  const header = req.headers["x-companion-secret"];
  const value = Array.isArray(header) ? header[0] : header;
  return value === secret;
}
