import { NextRequest, NextResponse } from "next/server";

const REPO = "SUAS-STEM/gcs";
const ASSET_NAMES = new Set(["ssgcs-win32-amd64.exe", "ssgcs-macos-arm64.dmg"]);

export async function GET(req: NextRequest) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return new NextResponse("Not configured", { status: 500 });
  }

  const asset = req.nextUrl.searchParams.get("asset") ?? "";
  const tag = req.nextUrl.searchParams.get("tag") ?? "";

  if (!ASSET_NAMES.has(asset) || !tag) {
    return new NextResponse("Invalid request", { status: 400 });
  }

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
  };

  const releaseRes = await fetch(
    `https://api.github.com/repos/${REPO}/releases/tags/${encodeURIComponent(tag)}`,
    { headers: authHeaders }
  );
  if (!releaseRes.ok) {
    return new NextResponse("Release not found", { status: releaseRes.status });
  }
  const release = await releaseRes.json();
  const assetInfo = (release.assets ?? []).find((a: { name: string }) => a.name === asset);
  if (!assetInfo) {
    return new NextResponse("Asset not found", { status: 404 });
  }

  const assetRes = await fetch(
    `https://api.github.com/repos/${REPO}/releases/assets/${assetInfo.id}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/octet-stream",
      },
    }
  );

  if (!assetRes.ok || !assetRes.body) {
    return new NextResponse("Failed to fetch asset", { status: 502 });
  }

  return new NextResponse(assetRes.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${asset}"`,
    },
  });
}
