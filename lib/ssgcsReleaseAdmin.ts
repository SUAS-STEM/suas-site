import { createHash, randomUUID, sign, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, truncate, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const RELEASE_ROOT = path.resolve(
    process.env.SSGCS_RELEASE_ROOT || "/home/pi/ssgcs-private/releases",
);
const STAGING_ROOT = path.resolve(
    process.env.SSGCS_RELEASE_STAGING_ROOT || "/home/pi/ssgcs-private/staging",
);
const SIGNING_KEY =
    process.env.SSGCS_RELEASE_SIGNING_KEY || "/home/pi/ssgcs-private/keys/release-signing.pem";
const CHUNK_SIZE = 8 * 1024 * 1024;
const MAX_ARCHIVE_SIZE = 8 * 1024 * 1024 * 1024;
const CHANNELS = new Set(["development", "production"]);

type UploadMeta = {
    id: string;
    channel: "development" | "production";
    version: string;
    sourceSha: string;
    size: number;
    sha256: string;
    createdAt: string;
};

function hash(value: string | Buffer) {
    return createHash("sha256").update(value).digest("hex");
}

export function releaseAdminAuthorized(headers: Headers) {
    const secret = process.env.SSGCS_RELEASE_DEPLOY_TOKEN || "";
    const submitted = (headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!secret || !submitted) return false;
    const a = Buffer.from(hash(secret), "hex");
    const b = Buffer.from(hash(submitted), "hex");
    return timingSafeEqual(a, b);
}

function validVersion(value: string) {
    return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]{0,63})?$/.test(value);
}

function uploadDir(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid upload id");
    const resolved = path.resolve(STAGING_ROOT, id);
    if (!resolved.startsWith(STAGING_ROOT + path.sep)) throw new Error("Invalid upload id");
    return resolved;
}

async function loadMeta(id: string): Promise<UploadMeta> {
    return JSON.parse(await readFile(path.join(uploadDir(id), "meta.json"), "utf8")) as UploadMeta;
}

async function withLock<T>(id: string, work: () => Promise<T>) {
    const lock = path.join(uploadDir(id), ".lock");
    const handle = await import("node:fs/promises").then(({ open }) => open(lock, "wx", 0o600));
    try {
        return await work();
    } finally {
        await handle.close().catch(() => undefined);
        await rm(lock, { force: true }).catch(() => undefined);
    }
}

export async function startReleaseUpload(input: Record<string, unknown>) {
    const channel = String(input.channel || "");
    const version = String(input.version || "");
    const sourceSha = String(input.sourceSha || "").toLowerCase();
    const size = Number(input.size);
    const sha256 = String(input.sha256 || "").toLowerCase();
    if (!CHANNELS.has(channel)) throw new Error("Invalid release channel");
    if (!validVersion(version)) throw new Error("Invalid release version");
    if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error("Invalid source commit SHA");
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_ARCHIVE_SIZE)
        throw new Error("Invalid payload size");
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("Invalid payload SHA-256");

    await mkdir(STAGING_ROOT, { recursive: true, mode: 0o700 });
    await mkdir(RELEASE_ROOT, { recursive: true, mode: 0o700 });
    const existing = path.join(RELEASE_ROOT, channel, version);
    try {
        await stat(existing);
        throw new Error("That release version already exists");
    } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    }

    const id = randomUUID();
    const dir = uploadDir(id);
    await mkdir(dir, { mode: 0o700 });
    const meta: UploadMeta = {
        id,
        channel: channel as UploadMeta["channel"],
        version,
        sourceSha,
        size,
        sha256,
        createdAt: new Date().toISOString(),
    };
    await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta), { mode: 0o600 });
    await writeFile(path.join(dir, "payload.zip.part"), Buffer.alloc(0), { mode: 0o600 });
    return { id, chunkSize: CHUNK_SIZE };
}

export async function appendReleaseChunk(
    id: string,
    expectedOffset: number,
    body: ReadableStream<Uint8Array>,
) {
    return withLock(id, async () => {
        const meta = await loadMeta(id);
        const archive = path.join(uploadDir(id), "payload.zip.part");
        const current = await stat(archive);
        if (!Number.isSafeInteger(expectedOffset) || expectedOffset !== current.size)
            throw new Error("Upload offset mismatch");
        if (current.size >= meta.size) throw new Error("Payload upload is already complete");

        const temp = path.join(uploadDir(id), `.chunk-${randomUUID()}`);
        let bytes = 0;
        const meter = new Transform({
            transform(chunk, _encoding, callback) {
                bytes += chunk.length;
                if (bytes > CHUNK_SIZE) return callback(new Error("Chunk exceeds maximum size"));
                if (current.size + bytes > meta.size)
                    return callback(new Error("Payload exceeds declared size"));
                callback(null, chunk);
            },
        });
        try {
            await pipeline(
                Readable.fromWeb(body as never),
                meter,
                createWriteStream(temp, { flags: "wx", mode: 0o600 }),
            );
            if (bytes <= 0) throw new Error("Empty chunk");
            try {
                await pipeline(
                    createReadStream(temp),
                    createWriteStream(archive, { flags: "a", mode: 0o600 }),
                );
            } catch (cause) {
                await truncate(archive, current.size).catch(() => undefined);
                throw cause;
            }
        } finally {
            await rm(temp, { force: true }).catch(() => undefined);
        }
        return { receivedBytes: current.size + bytes, expectedBytes: meta.size };
    });
}

async function sha256File(file: string) {
    const digest = createHash("sha256");
    for await (const chunk of createReadStream(file)) digest.update(chunk as Buffer);
    return digest.digest("hex");
}

function releaseManifest(meta: UploadMeta) {
    return Buffer.from(
        JSON.stringify({
            product: "SSGCS",
            channel: meta.channel,
            version: meta.version,
            path: "payload.zip",
            sha256: meta.sha256,
            size: meta.size,
            sourceSha: meta.sourceSha,
            publishedAt: new Date().toISOString(),
        }),
    );
}

export async function finalizeReleaseUpload(id: string) {
    return withLock(id, async () => {
        const dir = uploadDir(id);
        const meta = await loadMeta(id);
        const archive = path.join(dir, "payload.zip.part");
        const archiveInfo = await stat(archive);
        if (archiveInfo.size !== meta.size) throw new Error("Payload upload is incomplete");
        const actualSha = await sha256File(archive);
        if (actualSha !== meta.sha256) throw new Error("Payload SHA-256 verification failed");

        const signingKey = await readFile(SIGNING_KEY, "utf8");
        const manifest = releaseManifest(meta);
        const signature = sign("sha256", manifest, { key: signingKey, dsaEncoding: "ieee-p1363" });
        if (signature.length !== 64) throw new Error("Unexpected P-256 signature format");

        const channelDir = path.join(RELEASE_ROOT, meta.channel);
        await mkdir(channelDir, { recursive: true, mode: 0o700 });
        const finalDir = path.join(channelDir, meta.version);
        const tempDir = path.join(channelDir, `.${meta.version}.${id}.tmp`);
        try {
            await stat(finalDir);
            throw new Error("That release version already exists");
        } catch (cause) {
            if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
        }
        await mkdir(tempDir, { mode: 0o700 });
        try {
            await rename(archive, path.join(tempDir, "payload.zip"));
            await writeFile(path.join(tempDir, "manifest.json"), manifest, { mode: 0o600 });
            await writeFile(path.join(tempDir, "manifest.sig"), signature.toString("base64url"), {
                mode: 0o600,
            });
            await rename(tempDir, finalDir);
        } catch (cause) {
            await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
            throw cause;
        }

        const currentTemp = path.join(channelDir, `.current.${id}.tmp`);
        await writeFile(currentTemp, JSON.stringify({ version: meta.version }), { mode: 0o600 });
        await rename(currentTemp, path.join(channelDir, "current.json"));
        await rm(dir, { recursive: true, force: true });
        return {
            channel: meta.channel,
            version: meta.version,
            sha256: actualSha,
            size: meta.size,
            sourceSha: meta.sourceSha,
        };
    });
}

export async function abortReleaseUpload(id: string) {
    const dir = uploadDir(id);
    await rm(dir, { recursive: true, force: true });
    return { ok: true };
}
