import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { isDevAuthorized } from "@/lib/devAdminAuth";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isDevAuthorized())) return new NextResponse("Unauthorized", { status: 401 });
  try {
    const source = await readFile("/home/pi/ardupilot-sitl/sitl-connect.py", "utf8");
    return new NextResponse(source, {
      headers: {
        "Content-Type": "text/x-python; charset=utf-8",
        "Content-Disposition": "attachment; filename=sitl-connect.py",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse("Connector is not available", { status: 503 });
  }
}
