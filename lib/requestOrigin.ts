import { NextRequest } from "next/server";

// Next.js dev mode resolves req.url's origin from the server's own bind
// address (e.g. localhost:3002) rather than the forwarded Host header when
// running behind a reverse proxy/tunnel. Redirects built from req.url alone
// leak that internal origin to the client. Use the forwarded headers instead.
export function requestOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}
