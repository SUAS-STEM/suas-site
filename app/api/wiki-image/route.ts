import { NextRequest, NextResponse } from "next/server";

const REPO = "SUAS-STEM/suas-internal";

export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get("file") ?? "";

  if (!/^[a-z0-9-]+\.(jpe?g|png|gif|webp|svg)$/i.test(file)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return new NextResponse("Not configured", { status: 500 });
  }

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/wiki-images/${file}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.raw+json",
      },
      next: { revalidate: 300 },
    }
  );

  if (!res.ok) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buf = await res.arrayBuffer();
  const ext = file.split(".").pop()!.toLowerCase();
  const contentType =
    ext === "png" ? "image/png" :
    ext === "gif" ? "image/gif" :
    ext === "webp" ? "image/webp" :
    ext === "svg" ? "image/svg+xml" :
    "image/jpeg";

  return new NextResponse(buf, { headers: { "Content-Type": contentType } });
}
