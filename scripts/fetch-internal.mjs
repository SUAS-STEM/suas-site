import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import path from "path";

const REPO = "SUAS-STEM/suas-internal";
const REF = process.env.INTERNAL_REF || "main";
const TARGET = path.resolve(process.cwd(), "internal");
const token = process.env.GITHUB_TOKEN;

if (!token) {
  console.warn(
    "[fetch-internal] GITHUB_TOKEN not set — skipping. Pages that import from internal/ will fail to build."
  );
  process.exit(0);
}

const res = await fetch(`https://api.github.com/repos/${REPO}/tarball/${REF}`, {
  headers: { Authorization: `Bearer ${token}` },
});

if (!res.ok) {
  console.error(`[fetch-internal] Failed to fetch tarball: ${res.status} ${res.statusText}`);
  process.exit(1);
}

const buf = Buffer.from(await res.arrayBuffer());
const tmpTar = path.join(process.cwd(), ".internal-fetch.tar.gz");
writeFileSync(tmpTar, buf);

if (existsSync(TARGET)) {
  rmSync(TARGET, { recursive: true, force: true });
}
mkdirSync(TARGET, { recursive: true });

execSync(`tar -xzf "${tmpTar}" -C "${TARGET}" --strip-components=1`, { stdio: "inherit" });
rmSync(tmpTar);

console.log(`[fetch-internal] Fetched suas-internal@${REF} into internal/`);
