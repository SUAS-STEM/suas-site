import { NextRequest, NextResponse } from "next/server";
import { requestOrigin } from "@/lib/requestOrigin";

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/dev-login", requestOrigin(req)), 302);
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
