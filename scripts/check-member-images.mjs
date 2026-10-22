import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const portraits = path.join(root, "public", "images", "members");
const manifestSource = await fs.readFile(path.join(root, "lib", "memberPhotos.generated.ts"), "utf8");
const match = manifestSource.match(/= (\{[\s\S]*\});\s*$/);
assert.ok(match, "Expected a generated member image manifest");
const images = JSON.parse(match[1]);
const pngFiles = (await fs.readdir(portraits)).filter((f) => f.endsWith(".png")).sort();
assert.deepEqual(Object.keys(images).sort(), pngFiles, "Every original portrait must have optimized variants");

let total = 0;
for (const png of pngFiles) {
    for (const [key, expectedWidth] of [["small", 256], ["large", 640]]) {
        const uri = images[png][key];
        assert.match(uri, /^\/images\/members\/optimized\/[a-zA-Z0-9_.%()\-]+\.webp$/);
        assert.ok(uri.includes(`.${expectedWidth}.webp`));
        const file = path.join(root, "public", decodeURIComponent(uri).slice(1));
        const stat = await fs.stat(file);
        assert.ok(stat.size > 0 && stat.size <= 256 * 1024, `${uri} size ${stat.size}`);
        const metadata = await sharp(file).metadata();
        assert.equal(metadata.format, "webp", `Wrong content type: ${uri}`);
        assert.ok(metadata.width <= expectedWidth && metadata.width > 0, `Wrong width: ${uri}`);
        total += stat.size;
    }
}

console.log(`Verified ${pngFiles.length} member portraits / ${pngFiles.length * 2} WebP variants (${(total / 1024).toFixed(1)} KiB).`);
