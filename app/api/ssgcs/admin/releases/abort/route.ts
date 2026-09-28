import { NextRequest, NextResponse } from "next/server";
import { isInstallerHost } from "@/lib/ssgcsInstaller";
import { abortReleaseUpload, releaseAdminAuthorized } from "@/lib/ssgcsReleaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    if (!isInstallerHost(req.headers.get("host")))
        return new NextResponse("Not Found", { status: 404 });
    if (!releaseAdminAuthorized(req.headers))
        return new NextResponse("Unauthorized", { status: 401 });
    const body = (await req.json().catch(() => ({}))) as { id?: unknown };
    try {
        const result = await abortReleaseUpload(String(body.id || ""));
        return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (cause) {
        return NextResponse.json(
            { error: cause instanceof Error ? cause.message : "Could not abort release upload" },
            { status: 400, headers: { "Cache-Control": "no-store" } },
        );
    }
}
