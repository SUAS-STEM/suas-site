import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

function makeToken(password: string): string {
  return createHmac("sha256", password)
    .update("dev-auth")
    .digest("base64url");
}

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({ password: "" }));
  const correct = process.env.PASSWORD ?? "";

  if (!correct) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const a = Buffer.alloc(correct.length);
  const b = Buffer.from(correct);
  Buffer.from(password ?? "").copy(a, 0, 0, correct.length);
  const match =
    timingSafeEqual(a, b) &&
    (password ?? "").length === correct.length;

  if (!match) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = makeToken(correct);
  const res = NextResponse.json({ ok: true });
  res.cookies.set("dev_auth", token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
