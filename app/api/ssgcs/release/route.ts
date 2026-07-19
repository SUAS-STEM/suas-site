import { NextResponse } from "next/server";

const WORKER_URL = "https://gcs-license.esamuelchan.workers.dev/release-info";

export async function GET() {
  const res = await fetch(WORKER_URL, { next: { revalidate: 60 } });
  if (!res.ok) {
    return new NextResponse("Failed to fetch release", { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json({
    tag: data?.tag ?? "",
    date: data?.date ?? "",
    url: "",
    assets: data?.assets ?? [],
  });
}
