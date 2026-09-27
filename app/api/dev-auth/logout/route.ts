import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookies } from "@/lib/authCore";
import { requestOrigin } from "@/lib/requestOrigin";

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/dev-login", requestOrigin(req)), 302);
  // Clear the shared approved-user session as well as the legacy device
  // cookies. This logs the browser out without touching password-manager
  // autofill data.
  clearSessionCookies(res);
  res.cookies.set("dev_auth", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  res.cookies.set("dev_device", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  res.cookies.set("dev_admin", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
