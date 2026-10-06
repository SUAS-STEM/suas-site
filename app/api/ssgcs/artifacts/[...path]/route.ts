import { createHash, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// This storage root is intentionally runtime-configurable and lives outside the
// application bundle. Tell Turbopack not to trace the dynamic filesystem path
// back into the project during standalone output-file tracing.
const ROOT = resolve(
    /* turbopackIgnore: true */ process.env.SSGCS_ARTIFACT_ROOT || "/data/ssgcs-artifacts",
);
// Keep this aligned with next.config.ts proxyClientMaxBodySize. Release
// binaries live on GitHub Releases; this endpoint is for installer/support
// assets that should remain small enough to pass through the site proxy.
// Keep support assets comfortably below the site's 90 MB proxy body limit.
// Release binaries themselves are published through GitHub Releases.
const MAX_BYTES = 64 * 1024 * 1024;
const CHANNELS = new Set(["development", "candidate", "production"]);
const NO_INDEX = "noindex, nofollow, noarchive, nosnippet";

type RouteContext = { params: Promise<{ path: string[] }> };

function safeSegment(value: string, kind: "version" | "file"): string | null {
    if (!value || value === "." || value === "..") return null;
    if (value.includes("/") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value))
        return null;
    const pattern =
        kind === "version"
            ? /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/
            : /^[A-Za-z0-9][A-Za-z0-9._+() -]{0,255}$/;
    return pattern.test(value) ? value : null;
}

async function artifactPath(
    context: RouteContext,
): Promise<{ channel: string; version: string; file: string; absolute: string } | null> {
    const parts = (await context.params).path;
    if (!Array.isArray(parts) || parts.length !== 3) return null;
    const [channel, rawVersion, rawFile] = parts;
    const version = safeSegment(rawVersion, "version");
    const file = safeSegment(rawFile, "file");
    if (!CHANNELS.has(channel) || !version || !file || basename(file) !== file) return null;
    const absolute = resolve(
        /* turbopackIgnore: true */ join(
            /* turbopackIgnore: true */ ROOT,
            channel,
            version,
            file,
        ),
    );
    if (!absolute.startsWith(`${ROOT}/`)) return null;
    return { channel, version, file, absolute };
}

function authorized(request: NextRequest): boolean {
    const secret = process.env.SSGCS_ARTIFACT_UPLOAD_TOKEN || "";
    const submitted = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!secret || !submitted) return false;
    const a = Buffer.from(secret);
    const b = Buffer.from(submitted);
    return a.length === b.length && timingSafeEqual(a, b);
}

function contentType(file: string): string {
    const lower = file.toLowerCase();
    if (lower.endsWith(".exe")) return "application/vnd.microsoft.portable-executable";
    if (lower.endsWith(".msi")) return "application/x-msi";
    if (lower.endsWith(".zip")) return "application/zip";
    if (lower.endsWith(".json")) return "application/json; charset=utf-8";
    if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
    return "application/octet-stream";
}

function publicHeaders(file: string, size: number): HeadersInit {
    return {
        "Content-Type": contentType(file),
        "Content-Length": String(size),
        "Content-Disposition": `attachment; filename="${file.replace(/"/g, "")}"`,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Robots-Tag": NO_INDEX,
        "X-Content-Type-Options": "nosniff",
    };
}

async function lookup(context: RouteContext) {
    const artifact = await artifactPath(context);
    if (!artifact) return null;
    try {
        const info = await stat(/* turbopackIgnore: true */ artifact.absolute);
        return info.isFile() ? { ...artifact, size: info.size } : null;
    } catch {
        return null;
    }
}

export async function GET(_request: NextRequest, context: RouteContext) {
    const artifact = await lookup(context);
    if (!artifact)
        return new NextResponse("Not Found", {
            status: 404,
            headers: { "X-Robots-Tag": NO_INDEX },
        });
    const stream = Readable.toWeb(createReadStream(artifact.absolute)) as ReadableStream;
    return new NextResponse(stream, { headers: publicHeaders(artifact.file, artifact.size) });
}

export async function HEAD(_request: NextRequest, context: RouteContext) {
    const artifact = await lookup(context);
    if (!artifact)
        return new NextResponse(null, { status: 404, headers: { "X-Robots-Tag": NO_INDEX } });
    return new NextResponse(null, { headers: publicHeaders(artifact.file, artifact.size) });
}

export async function PUT(request: NextRequest, context: RouteContext) {
    if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const artifact = await artifactPath(context);
    if (!artifact || !request.body)
        return NextResponse.json({ error: "Invalid artifact path or body" }, { status: 400 });

    const declared = Number(request.headers.get("content-length") || "0");
    if (declared > MAX_BYTES)
        return NextResponse.json({ error: "Artifact too large" }, { status: 413 });

    await mkdir(
        /* turbopackIgnore: true */ join(
            /* turbopackIgnore: true */ ROOT,
            artifact.channel,
            artifact.version,
        ),
        { recursive: true },
    );
    const temporary = `${artifact.absolute}.${process.pid}.${Date.now()}.upload`;
    const hash = createHash("sha256");
    let bytes = 0;
    const meter = new Transform({
        transform(chunk, _encoding, callback) {
            bytes += chunk.length;
            if (bytes > MAX_BYTES) return callback(new Error("Artifact too large"));
            hash.update(chunk);
            callback(null, chunk);
        },
    });

    try {
        await pipeline(
            Readable.fromWeb(request.body as never),
            meter,
            createWriteStream(temporary, { mode: 0o644 }),
        );
        await rename(temporary, artifact.absolute);
    } catch (error) {
        await rm(temporary, { force: true }).catch(() => undefined);
        const message = error instanceof Error ? error.message : "Upload failed";
        return NextResponse.json(
            { error: message },
            { status: message === "Artifact too large" ? 413 : 500 },
        );
    }

    return NextResponse.json(
        {
            ok: true,
            channel: artifact.channel,
            version: artifact.version,
            file: artifact.file,
            size: bytes,
            sha256: hash.digest("hex"),
        },
        { status: 201, headers: { "Cache-Control": "no-store", "X-Robots-Tag": NO_INDEX } },
    );
}

export async function DELETE(request: NextRequest, context: RouteContext) {
    if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const artifact = await artifactPath(context);
    if (!artifact) return NextResponse.json({ error: "Invalid artifact path" }, { status: 400 });
    try {
        await rm(artifact.absolute);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return new NextResponse(null, { status: 404, headers: { "X-Robots-Tag": NO_INDEX } });
        }
        throw error;
    }
    return new NextResponse(null, {
        status: 204,
        headers: { "Cache-Control": "no-store", "X-Robots-Tag": NO_INDEX },
    });
}
