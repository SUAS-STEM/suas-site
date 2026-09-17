import { NextRequest } from "next/server";

const ALLOWED_HOSTNAMES = new Set(["dev.suasstem.org", "suasstem.org", "www.suasstem.org", "localhost", "127.0.0.1"]);

export function requestOrigin(req: NextRequest): string {
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const requestHost = forwardedHost || req.headers.get("host") || "dev.suasstem.org";
  const hostname = requestHost.replace(/^\[([^\]]+)\](?::\d+)?$/, "$1").replace(/:\d+$/, "").toLowerCase();
  const host = ALLOWED_HOSTNAMES.has(hostname) ? requestHost : "dev.suasstem.org";
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const proto = forwardedProto === "http" && (hostname === "localhost" || hostname === "127.0.0.1") ? "http" : "https";
  return `${proto}://${host}`;
}
