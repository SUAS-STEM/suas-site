import { NextRequest, NextResponse } from "next/server";
import {
  ANALYTICS_VISITOR_COOKIE,
  recordSiteAnalyticsEvent,
  type SiteAnalyticsBody,
} from "@/lib/siteAnalytics";
import {
  checkRateLimit,
  readBoundedText,
  requestClientIp,
} from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 8 * 1024;
const PUBLIC_HOSTS = new Set(["suasstem.org", "www.suasstem.org"]);

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
  return response;
}

export async function POST(request: NextRequest) {
  const host = request.headers.get("host")?.replace(/:\d+$/, "") || "";
  const isLocal =
    process.env.NODE_ENV !== "production" &&
    (host === "localhost" || host === "127.0.0.1");
  if (!PUBLIC_HOSTS.has(host) && !isLocal) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const ip = requestClientIp(request);
  const rateLimit = checkRateLimit(
    "site-analytics",
    ip,
    240,
    60 * 60 * 1000,
  );
  if (!rateLimit.allowed) {
    // Analytics is best-effort and must never become a site-availability
    // dependency or cause noisy retry loops in browsers.
    return noStore(new NextResponse(null, { status: 204 }));
  }

  const raw = await readBoundedText(request, MAX_BODY_BYTES);
  if (raw === null) {
    return noStore(
      NextResponse.json({ error: "Request too large" }, { status: 413 }),
    );
  }

  let body: SiteAnalyticsBody;
  try {
    body = JSON.parse(raw) as SiteAnalyticsBody;
  } catch {
    return noStore(
      NextResponse.json({ error: "Invalid JSON" }, { status: 400 }),
    );
  }

  try {
    const result = recordSiteAnalyticsEvent(request, body);
    const response = new NextResponse(null, {
      status: result.accepted ? 204 : 400,
    });
    if (result.visitorId) {
      response.cookies.set(ANALYTICS_VISITOR_COOKIE, result.visitorId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    return noStore(response);
  } catch (cause) {
    console.error("Failed to record site analytics", cause);
    // Fail open: a database problem must not affect the public site.
    return noStore(new NextResponse(null, { status: 204 }));
  }
}
