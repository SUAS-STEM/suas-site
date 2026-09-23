import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORAGE_ORIGIN = (process.env.RELEASE_STORE_ORIGIN || "http://host.docker.internal:18080").replace(/\/$/, "");

type RouteContext = { params: Promise<{ path: string[] }> };

function forwardedHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  for (const name of ["authorization", "x-storage-token", "content-type", "content-length", "if-none-match"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function responseHeaders(response: Response): Headers {
  const headers = new Headers();
  for (const name of ["content-type", "content-length", "content-disposition", "etag", "cache-control", "accept-ranges", "retry-after"]) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("cache-control", "private, no-store");
  return headers;
}

async function forward(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  if (!path?.length) return NextResponse.json({ error: "file name is required" }, { status: 400 });

  const upstreamPath = path[0] === "_jobs" && path.length === 2
    ? `/v1/jobs/${encodeURIComponent(path[1])}`
    : `/v1/files/${path.map((segment) => encodeURIComponent(segment)).join("/")}`;
  const upstream = await fetch(`${STORAGE_ORIGIN}${upstreamPath}${request.nextUrl.search}`, {
    method: request.method,
    headers: forwardedHeaders(request),
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    ...(request.method === "GET" || request.method === "HEAD" ? {} : { duplex: "half" as const }),
    cache: "no-store",
  });

  const headers = responseHeaders(upstream);
  if (upstream.headers.get("content-type")?.includes("application/json")) {
    const payload = await upstream.json() as Record<string, unknown>;
    for (const key of ["statusUrl"] as const) {
      if (typeof payload[key] === "string" && payload[key].startsWith("/v1/jobs/")) payload[key] = `/storage/_jobs/${payload[key].slice("/v1/jobs/".length)}`;
    }
    headers.delete("content-length");
    headers.set("content-type", "application/json; charset=utf-8");
    return new NextResponse(JSON.stringify(payload), { status: upstream.status, headers });
  }
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  return forward(request, context);
}

export async function HEAD(request: NextRequest, context: RouteContext) {
  return forward(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return forward(request, context);
}
