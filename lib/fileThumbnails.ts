import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

function thumbnailRoot() {
  if (process.env.DEV_FILE_THUMBNAIL_ROOT) return process.env.DEV_FILE_THUMBNAIL_ROOT;
  if (process.env.DEV_FILE_METADATA_DB) {
    return path.join(path.dirname(process.env.DEV_FILE_METADATA_DB), "file-thumbnails");
  }
  if (process.env.NODE_ENV === "production") return "/home/pi/suas-site-dev/data/file-thumbnails";
  return path.join(process.cwd(), "data", "file-thumbnails");
}

function thumbnailPath(name: string) {
  return path.join(thumbnailRoot(), `${name}.jpg`);
}

export async function saveFileThumbnail(name: string, image: Buffer) {
  const destination = thumbnailPath(name);
  const temporary = `${destination}.${randomUUID()}.partial`;
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  try {
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(temporary, { mode: 0o600 });
      output.once("error", reject);
      output.end(image, resolve);
    });
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export async function readFileThumbnail(name: string) {
  return readFile(thumbnailPath(name));
}

export async function deleteFileThumbnail(name: string) {
  await unlink(thumbnailPath(name)).catch(() => undefined);
}

export async function createImageThumbnail(filePath: string) {
  const sharpModule = await import("sharp");
  const sharp = sharpModule.default;
  return sharp(filePath, { failOn: "none", limitInputPixels: 150_000_000 })
    .rotate()
    .resize(640, 480, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
}

export async function createVideoThumbnail(filePath: string) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-ss", "1", "-i", filePath,
      "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1",
    ], { stdio: ["ignore", "pipe", "ignore"] });
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    const timeout = setTimeout(() => child.kill("SIGKILL"), 30_000);
    child.stdout?.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > 4 * 1024 * 1024) child.kill("SIGKILL");
      else chunks.push(chunk);
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      const output = Buffer.concat(chunks);
      if (code === 0 && output.length > 0) resolve(output);
      else reject(new Error("Could not create a video preview."));
    });
  });
}

