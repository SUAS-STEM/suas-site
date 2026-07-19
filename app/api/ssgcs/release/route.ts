import { NextResponse } from "next/server";

const REPO = "SUAS-STEM/gcs";

export async function GET() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return new NextResponse("Not configured", { status: 500 });
  }

  const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=1`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    return new NextResponse("Failed to fetch release", { status: res.status });
  }

  // Releases are always published as prereleases (dev-v0.NNN), so
  // /releases/latest (which excludes prereleases) never matches them.
  const [data] = await res.json();
  const assets: { name: string; size: number }[] = (data?.assets ?? []).map(
    (a: { name: string; size: number }) => ({ name: a.name, size: a.size })
  );
  return NextResponse.json({
    tag: data?.tag_name ?? "",
    date: data?.published_at ?? "",
    url: data?.html_url ?? "",
    assets,
  });
}
