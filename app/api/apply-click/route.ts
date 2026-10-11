import { NextRequest, NextResponse } from "next/server";
import {
  APPLICATION_FORM_URL,
  APPLY_VISITOR_COOKIE,
  recordApplyClick,
} from "@/lib/applyClickAnalytics";
import { ANALYTICS_VISITOR_COOKIE } from "@/lib/siteAnalytics";
import { checkRateLimit, readBoundedText, requestClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

// Backward compatibility for old, cached application pages. Recording must
// never interfere with reaching the actual Microsoft application form.
export function GET(request: NextRequest) {
  let visitorId: string | null = null;
  try {
    if (checkRateLimit("apply-get", requestClientIp(request), 120, 3600000).allowed) {
      visitorId = recordApplyClick(
        request,
        request.nextUrl.searchParams.get("source"),
      ).visitorId;
    }
  } catch (error) {
    console.error("Application click analytics failed", error);
  }
  const response = noStore(NextResponse.redirect(APPLICATION_FORM_URL, 302));
  response.headers.set("Referrer-Policy", "no-referrer");
  if (visitorId) {
    for (const name of [APPLY_VISITOR_COOKIE, ANALYTICS_VISITOR_COOKIE]) {
      response.cookies.set(name, visitorId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
  }
  return response;
}

// New CTAs open Microsoft Forms directly; the browser sends this best-effort
// beacon independently, so missing analytics can NEVER break applications.
export async function POST(request: NextRequest) {
  const host = request.headers.get("host")?.replace(/:\d+$/, "") || "";
  if (host !== "suasstem.org" && host !== "www.suasstem.org") {
    return new NextResponse("Not Found", { status: 404 });
  }
  if (!checkRateLimit("apply-post", requestClientIp(request), 120, 3600000).allowed) {
    return noStore(new NextResponse(null, { status: 204 }));
  }
  const raw = await readBoundedText(request, 1024);
  if (raw === null) return noStore(new NextResponse(null, { status: 413 }));
  try {
    const body = JSON.parse(raw) as { source?: unknown };
    if (typeof body.source !== "string" || !body.source.trim()) {
      return noStore(new NextResponse(null, { status: 400 }));
    }
    recordApplyClick(request, body.source);
  } catch (error) {
    // A malformed or failed analytics request must not impact the form link.
    console.error("Application click beacon failed", error);
  }
  return noStore(new NextResponse(null, { status: 204 }));
}
