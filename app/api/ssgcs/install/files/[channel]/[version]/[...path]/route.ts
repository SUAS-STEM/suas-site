import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { installerAuthHeaders, isInstallerHost, releaseFile } from "@/lib/ssgcsInstaller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ channel: string; version: string; path: string[] }> };

export async function GET(req: NextRequest, context: Context) {
    if (!isInstallerHost(req.headers.get("host")))
        return new NextResponse("Not Found", { status: 404 });
    const auth = installerAuthHeaders(
        req.headers,
        "GET",
        req.nextUrl.pathname + req.nextUrl.search,
    );
    if (!auth)
        return new NextResponse("Unauthorized", {
            status: 401,
            headers: { "Cache-Control": "no-store" },
        });
    const params = await context.params;
    const file = await releaseFile(params.channel, params.version, params.path.join("/"));
    if (!file)
        return new NextResponse("Not Found", {
            status: 404,
            headers: { "Cache-Control": "no-store" },
        });
    const stream = Readable.toWeb(createReadStream(file.absolute)) as ReadableStream;
    return new NextResponse(stream, {
        headers: {
            "Content-Type": "application/octet-stream",
            "Content-Length": String(file.size),
            "Content-Disposition": `attachment; filename="${file.name.replace(/"/g, "")}"`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
        },
    });
}
