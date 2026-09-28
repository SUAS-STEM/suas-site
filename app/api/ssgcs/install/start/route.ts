import { NextRequest, NextResponse } from "next/server";
import { startInstallRequest, isInstallerHost } from "@/lib/ssgcsInstaller";
import { clientAddress, consumeRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    if (!isInstallerHost(req.headers.get("host")))
        return new NextResponse("Not Found", { status: 404 });
    const retryAfter = consumeRateLimit([`ssgcs-install-start:${clientAddress(req.headers)}`], 20);
    if (retryAfter) {
        return NextResponse.json(
            { error: "Too many installer authorization requests; try again later" },
            {
                status: 429,
                headers: { "Cache-Control": "no-store", "Retry-After": String(retryAfter) },
            },
        );
    }
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
