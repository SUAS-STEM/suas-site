import { NextResponse } from "next/server";
import { isStitchAdmin } from "@/lib/stitchAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { authorized: await isStitchAdmin() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
