import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const imagesDir = path.join(process.cwd(), "public", "images", "gallery");
    const files = fs.readdirSync(imagesDir);
    const exts = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
    const images = files
      .filter((f) => exts.has(path.extname(f).toLowerCase()))
      .map((f) => `/images/gallery/${f}`);

    return new Response(JSON.stringify(images), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}
