import { NextRequest, NextResponse } from "next/server";
import { verifyAccessReviewToken } from "@/lib/accessReviewToken";
import { reviewDeviceAccessRequest } from "@/lib/devAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function allowedHost(req: NextRequest) {
  const host = (req.headers.get("host") || "").replace(/:\d+$/, "").toLowerCase();
  return host === "dev.suasstem.org" || host === "localhost" || host === "127.0.0.1";
}

function page(title: string, message: string, status = 200) {
  const safeTitle = title.replace(/[<>&\"']/g, "");
  const safeMessage = message.replace(/[<>&\"']/g, "");
  return new NextResponse(`<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title></head><body style="font-family:system-ui,sans-serif;max-width:42rem;margin:4rem auto;padding:0 1rem;background:#111;color:#eee"><h1>${safeTitle}</h1><p>${safeMessage}</p><p><a style="color:#9de3d6" href="/dev#access-requests">Open access requests</a></p></body></html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function confirmationPage(action: "approve" | "deny", token: string) {
  const label = action === "approve" ? "Approve access" : "Deny access";
  const safeToken = token.replace(/[^A-Za-z0-9._-]/g, "");
  return new NextResponse(`<!doctype html><html><head><meta charset="utf-8"><title>Confirm ${label}</title></head><body style="font-family:system-ui,sans-serif;max-width:42rem;margin:4rem auto;padding:0 1rem;background:#111;color:#eee"><h1>Confirm ${label}</h1><p>This link is valid for one request and expires after seven days.</p><form method="post"><input type="hidden" name="token" value="${safeToken}"><button style="padding:.7rem 1rem;cursor:pointer" type="submit">${label}</button></form><p><a style="color:#9de3d6" href="/dev#access-requests">Open access requests</a></p></body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(req: NextRequest) {
  if (!allowedHost(req)) return page("Not found", "This link is not available on this host.", 404);
  const token = req.nextUrl.searchParams.get("token") || "";
  const review = verifyAccessReviewToken(token);
  if (!review) return page("Link expired", "This approval link is invalid or has expired.", 400);
  return confirmationPage(review.action, token);
}

export async function POST(req: NextRequest) {
  if (!allowedHost(req)) return page("Not found", "This link is not available on this host.", 404);
  const form = await req.formData();
  const token = typeof form.get("token") === "string" ? String(form.get("token")) : "";
  const review = verifyAccessReviewToken(token);
  if (!review) return page("Link expired", "This approval link is invalid or has expired.", 400);
  if (!reviewDeviceAccessRequest(review.id, review.action)) {
    return page("Already handled", "This access request was already reviewed, denied, or removed.", 409);
  }
  return page(review.action === "approve" ? "Access approved" : "Access denied", review.action === "approve" ? "The device can now sign in to the SUAS site." : "The device request was denied.");
}
