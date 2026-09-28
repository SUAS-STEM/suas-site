import { NextRequest, NextResponse } from "next/server";
import { startInstallRequest, isInstallerHost } from "@/lib/ssgcsInstaller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    if (!isInstallerHost(req.headers.get("host")))
        return new NextResponse("Not Found", { status: 404 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    try {
        const request = startInstallRequest(body);
        return NextResponse.json(
            {
                requestId: request.id,
                pollToken: request.pollToken,
                expiresAt: request.expiresAt,
                authorizeUrl: `https://dev.suasstem.org/install/authorize?request=${encodeURIComponent(request.id)}`,
            },
            { status: 201, headers: { "Cache-Control": "no-store" } },
        );
    } catch (cause) {
        return NextResponse.json(
            { error: cause instanceof Error ? cause.message : "Invalid install request" },
            { status: 400, headers: { "Cache-Control": "no-store" } },
        );
    }
}
