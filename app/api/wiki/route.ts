import { NextRequest, NextResponse } from "next/server";

const REPO = "SUAS-STEM/suas-internal";

export async function GET(req: NextRequest) {
  const page = req.nextUrl.searchParams.get("page") ?? "home";

  if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(page)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return new NextResponse("Not configured", { status: 500 });
  }

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/wiki/${page}.md`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.raw+json",
      },
      next: { revalidate: 60 },
    }
  );

  if (!res.ok) {
    return new NextResponse("Not found", { status: 404 });
  }

  const text = await res.text();
  return new NextResponse(text, { headers: { "Content-Type": "text/plain" } });
}
