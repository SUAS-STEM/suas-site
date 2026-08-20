import "dotenv/config";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import path from "path";

const REPO = "SUAS-STEM/suas-internal";
const REF = process.env.INTERNAL_REF || "main";
const TARGET = path.resolve(process.cwd(), "internal");
const token = process.env.GITHUB_TOKEN;

// Pages that re-export from internal/ (e.g. app/dev/tabs/SsgcsTab.tsx) need
// the module to exist for the build to compile, even without real content.
function writeStub() {
  const pagesDir = path.join(TARGET, "pages");
  mkdirSync(pagesDir, { recursive: true });
  writeFileSync(
    path.join(pagesDir, "Ssgcs.tsx"),
    `export default function Ssgcs() {\n` +
      `  return <div className="p-8 text-white/60">SSGCS content unavailable in this build.</div>;\n` +
      `}\n`
  );
}

if (!token) {
  console.warn(
    "[fetch-internal] GITHUB_TOKEN not set — writing stub internal/ so the build can still compile."
  );
  writeStub();
  process.exit(0);
}

const res = await fetch(`https://api.github.com/repos/${REPO}/tarball/${REF}`, {
  headers: { Authorization: `Bearer ${token}` },
});

if (!res.ok) {
  console.warn(
    `[fetch-internal] Failed to fetch tarball: ${res.status} ${res.statusText} — writing stub internal/ so the build can still compile.`
  );
  writeStub();
  process.exit(0);
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
