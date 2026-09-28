import { NextRequest, NextResponse } from "next/server";
import { installerAuthHeaders, isInstallerHost, releaseManifest } from "@/lib/ssgcsInstaller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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
    const channel = req.nextUrl.searchParams.get("channel") || "production";
    const release = await releaseManifest(channel);
    if (!release)
        return new NextResponse("No release available", {
            status: 404,
            headers: { "Cache-Control": "no-store" },
        });
    return NextResponse.json(
        {
            channel: release.channel,
            version: release.version,
            manifest: release.manifest.toString("base64"),
            signature: release.signature,
        },
        { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
    );
}
