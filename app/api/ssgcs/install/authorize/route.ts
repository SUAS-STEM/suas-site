import { NextRequest, NextResponse } from "next/server";
import { userFromSessionToken } from "@/lib/authCore";
import { authorizeInstallRequest, isInstallerHost } from "@/lib/ssgcsInstaller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    if (!isInstallerHost(req.headers.get("host")))
        return new NextResponse("Not Found", { status: 404 });
    const user = userFromSessionToken(req.cookies.get("suas_session")?.value);
    if (!user || user.status !== "approved")
        return new NextResponse("Unauthorized", { status: 401 });
    const form = await req.formData();
    const requestId = String(form.get("request") || "");
    try {
        authorizeInstallRequest(requestId, user);
        return NextResponse.redirect(
            new URL(
                `/install/authorize?request=${encodeURIComponent(requestId)}&approved=1`,
                req.url,
            ),
            303,
        );
    } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Authorization failed";
        return NextResponse.redirect(
            new URL(
                `/install/authorize?request=${encodeURIComponent(requestId)}&error=${encodeURIComponent(message)}`,
                req.url,
            ),
            303,
        );
    }
}
