import { NextRequest, NextResponse } from "next/server";
import { isInstallerHost } from "@/lib/ssgcsInstaller";
import { appendReleaseChunk, releaseAdminAuthorized } from "@/lib/ssgcsReleaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    if (!isInstallerHost(req.headers.get("host")))
        return new NextResponse("Not Found", { status: 404 });
    if (!releaseAdminAuthorized(req.headers))
        return new NextResponse("Unauthorized", { status: 401 });
    if (!req.body) return NextResponse.json({ error: "Missing chunk body" }, { status: 400 });
    const offset = Number(req.headers.get("x-upload-offset"));
    try {
        const { id } = await context.params;
        const result = await appendReleaseChunk(id, offset, req.body);
        return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Could not append release chunk";
        const status = message.includes("offset") ? 409 : 400;
        return NextResponse.json(
            { error: message },
            { status, headers: { "Cache-Control": "no-store" } },
        );
    }
}
