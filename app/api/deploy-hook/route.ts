import { createHmac, timingSafeEqual } from "node:crypto";
import { appendFile, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SOURCE_REPO = "SUAS-STEM/suas-site";
const STUDIO_REPO = "eschan145/website";
const STUDIO_REPO_ID = 1062231149;
const BUILD_REPO = "eschan145/suas-site-builds";
const SOURCE_BRANCH_REF = "refs/heads/master";
const STUDIO_BRANCH_REF = "refs/heads/dev";
const BUILD_WORKFLOWS = new Set([
  "Build SUAS Pi artifact",
  "Build SUAS Pi artifact fallback",
]);
const MAX_BODY_BYTES = 5 * 1024 * 1024;

type JsonObject = Record<string, unknown>;

function json(body: JsonObject, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Cloudflare-CDN-Cache-Control": "no-store",
    },
  });
}

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function validSignature(body: Buffer, signature: string | null, secret: string) {
  if (!signature?.startsWith("sha256=")) return false;
  const hex = signature.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(hex)) return false;

  const received = Buffer.from(hex, "hex");
  const expected = createHmac("sha256", secret).update(body).digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}

async function triggerDeploy(payload: JsonObject, studio = false) {
  const triggerPath = process.env.DEPLOY_TRIGGER_PATH;
  if (!triggerPath) throw new Error("DEPLOY_TRIGGER_PATH is not configured");

  const directory = path.dirname(triggerPath);
  await mkdir(directory, { recursive: true });
  await appendFile(path.join(directory, "events.jsonl"), `${JSON.stringify(payload)}\n`, {
    encoding: "utf8",
    mode: 0o644,
  });
  const destination = studio ? path.join(directory, "studio-webhook.json") : triggerPath;
  const temporaryPath = `${destination}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(payload)}\n`, {
    encoding: "utf8",
    mode: 0o644,
  });
  await rename(temporaryPath, destination);
}

export async function POST(request: NextRequest) {
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "")
    .split(",", 1)[0]
    .trim()
    .replace(/:\d+$/, "");
  if (host !== "suasstem.org") return new NextResponse("Not Found", { status: 404 });

  const suasSecret = process.env.DEPLOY_WEBHOOK_SECRET;
  const studioSecret = process.env.DEPLOY_STUDIO_WEBHOOK_SECRET;
  if (!suasSecret || !studioSecret) return json({ ok: false, error: "not configured" }, 503);

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: "payload too large" }, 413);
  }

  const raw = Buffer.from(await request.arrayBuffer());
  if (raw.length > MAX_BODY_BYTES) return json({ ok: false, error: "payload too large" }, 413);
  const signature = request.headers.get("x-hub-signature-256");
  const signedBySuas = validSignature(raw, signature, suasSecret);
  const signedByStudio = validSignature(raw, signature, studioSecret);
  if (!signedBySuas && !signedByStudio) {
    return json({ ok: false, error: "invalid signature" }, 401);
  }

  let payload: JsonObject;
  try {
    payload = object(JSON.parse(raw.toString("utf8"))) ?? {};
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }

  const event = request.headers.get("x-github-event") ?? "";
  const deliveryId = request.headers.get("x-github-delivery") ?? "";
  const repository = object(payload.repository);
  const repositoryName = string(repository?.full_name);
  const isStudio = repositoryName === STUDIO_REPO && repository?.id === STUDIO_REPO_ID && signedByStudio;
  const isSuas = repositoryName === SOURCE_REPO && signedBySuas;
  const isLegacyBuild = repositoryName === BUILD_REPO && signedBySuas;

  // A signature from one project must never authorize another project's
  // push, even though the URL and HTTP handler are shared.
  if (!isStudio && !isSuas && !isLegacyBuild) {
    return json({ ok: false, error: "unexpected repository" }, 404);
  }

  if (event === "ping") {
    return json({ ok: true, event: "ping" });
  }

  if (event === "push") {
    if (!isSuas && !isStudio) return json({ ok: false, error: "unexpected repository" }, 404);
    if (string(payload.ref) !== (isStudio ? STUDIO_BRANCH_REF : SOURCE_BRANCH_REF)) {
      return json({ ok: true, ignored: true }, 202);
    }
    const sourceCommit = string(payload.after);
    if (!sourceCommit || !/^[0-9a-f]{40}$/.test(sourceCommit)) {
      return json({ ok: false, error: "invalid commit" }, 400);
    }

    await triggerDeploy({
      version: 1,
      event: "push",
      deliveryId,
      receivedAt: new Date().toISOString(),
      repository: repositoryName,
      sourceCommit,
    }, isStudio);
    return json({ ok: true, triggered: true }, 202);
  }

  if (event === "workflow_run") {
    if (!isLegacyBuild) return json({ ok: false, error: "unexpected repository" }, 404);
    if (string(payload.action) !== "completed") return json({ ok: true, ignored: true }, 202);

    const run = object(payload.workflow_run);
    const workflowName = string(run?.name);
    if (!workflowName || !BUILD_WORKFLOWS.has(workflowName)) {
      return json({ ok: true, ignored: true }, 202);
    }

    await triggerDeploy({
      version: 1,
      event: "workflow_run",
      deliveryId,
      receivedAt: new Date().toISOString(),
      repository: repositoryName,
      workflowName,
      workflowRunId: run?.id ?? null,
      workflowConclusion: string(run?.conclusion),
      workflowDisplayTitle: string(run?.display_title),
    });
    return json({ ok: true, triggered: true }, 202);
  }

  return json({ ok: true, ignored: true }, 202);
}

