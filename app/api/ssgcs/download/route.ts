import { NextRequest, NextResponse } from "next/server";

const WORKER_URL = "https://gcs-license.esamuelchan.workers.dev/release-download";
const ASSET_NAMES = new Set([
  "ssgcs-win32-amd64-cuda.exe",
  "ssgcs-win32-amd64.exe",
  "ssgcs-macos-arm64.dmg",
]);

export async function GET(req: NextRequest) {
  const asset = req.nextUrl.searchParams.get("asset") ?? "";
  if (!ASSET_NAMES.has(asset)) {
    return new NextResponse("Invalid request", { status: 400 });
  }

  return NextResponse.redirect(
    `${WORKER_URL}?asset=${encodeURIComponent(asset)}`,
    307,
  );
}
