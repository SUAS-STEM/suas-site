import { NextRequest, NextResponse } from "next/server";
import { exchangeInstallRequest, isInstallerHost } from "@/lib/ssgcsInstaller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    if (!isInstallerHost(req.headers.get("host")))
        return new NextResponse("Not Found", { status: 404 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = exchangeInstallRequest(
        String(body.requestId || ""),
        String(body.pollToken || ""),
        String(body.signature || ""),
    );
    if (!result)
        return NextResponse.json(
            { error: "Device proof rejected" },
            { status: 401, headers: { "Cache-Control": "no-store" } },
        );
    return NextResponse.json(
        { installToken: result.token, deviceId: result.deviceId, expiresAt: result.expiresAt },
        { headers: { "Cache-Control": "no-store" } },
    );
}
