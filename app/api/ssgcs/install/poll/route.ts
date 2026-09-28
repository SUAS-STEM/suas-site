import { NextRequest, NextResponse } from "next/server";
import { pollInstallRequest, isInstallerHost } from "@/lib/ssgcsInstaller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    if (!isInstallerHost(req.headers.get("host")))
        return new NextResponse("Not Found", { status: 404 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = pollInstallRequest(String(body.requestId || ""), String(body.pollToken || ""));
    if (!result)
        return NextResponse.json(
            { error: "Invalid request" },
            { status: 401, headers: { "Cache-Control": "no-store" } },
        );
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
