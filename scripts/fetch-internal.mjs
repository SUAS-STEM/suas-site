import "dotenv/config";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import path from "path";

const REPO = "SUAS-STEM/suas-internal";
const REF = process.env.INTERNAL_REF || "main";
const TARGET = path.resolve(process.cwd(), "internal");
const token = process.env.GITHUB_TOKEN;
const actionsRepository = process.env.GITHUB_REPOSITORY;
const buildChannel = (process.env.SUAS_BUILD_CHANNEL || "").trim().toLowerCase();

function installFallback() {
  if (existsSync(TARGET)) {
    rmSync(TARGET, { recursive: true, force: true });
  }
  const fallbackDir = path.join(TARGET, "pages");
  mkdirSync(fallbackDir, { recursive: true });
  writeFileSync(
    path.join(fallbackDir, "Ssgcs.tsx"),
    `export default function SsgcsFallback() {\n  return null;\n}\n`,
  );
}

// Defense in depth: suas-site is public. Private source must never be fetched
// by a workflow running in this repository, because any uploaded build
// artifact from a public Actions run can be downloaded by repository readers.
// The authorized build workflow lives in the private suas-site-builds repo and
// checks this public source out there before invoking the same build scripts.
if (process.env.GITHUB_ACTIONS === "true" && actionsRepository === "SUAS-STEM/suas-site") {
  console.error(
    "[fetch-internal] Refusing to fetch private source from public suas-site GitHub Actions.",
  );
  process.exit(1);
}

// Production must never receive private repository material, even when the
// caller accidentally provides a GitHub token. The public site only needs a
// compile-time placeholder for the private dev-only SSGCS tab.
if (buildChannel === "prod") {
  installFallback();
  console.log("[fetch-internal] Production build — private source intentionally omitted.");
  process.exit(0);
}

if (!token) {
  installFallback();
  console.warn("[fetch-internal] GITHUB_TOKEN not set — using the local SSGCS preview fallback.");
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
