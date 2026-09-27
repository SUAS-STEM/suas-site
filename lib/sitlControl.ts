import { execFile, spawn } from "node:child_process";
import { closeSync, existsSync, openSync, readdirSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SITL_DIR = "/home/pi/ardupilot-sitl";
const RUNNER = path.join(SITL_DIR, "run-sitl.sh");
const REPO_DIR = process.env.ARDUPILOT_ROOT || "/home/pi/ardupilot";
const BINARY = path.join(REPO_DIR, "build/docker-sitl/sitl/bin/arduplane");
const HWDEF_DIR = path.join(REPO_DIR, "libraries/AP_HAL_ChibiOS/hwdef");
const LOG_FILE = path.join(SITL_DIR, "runtime/web-control.log");
const PROJECT = "ardupilot-sitl";
const TARGET = process.env.SITL_CUSTOM_TARGET || "EH5";
const FIRMWARE = process.env.SITL_CUSTOM_FIRMWARE_STRING || `${TARGET}-SITL`;

type Operation = { kind: "start" | "stop"; startedAt: string };
type DockerContainer = {
  id: string;
  name: string;
  status: string;
  state: string;
  ports: string;
};

let activeOperation: Operation | null = null;

function listCustomTargets() {
  try {
    return readdirSync(HWDEF_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^EH\d+$/i.test(entry.name))
      .map((entry) => entry.name.toUpperCase())
      .sort();
  } catch {
    return [];
  }
}

async function dockerContainer(): Promise<{ container: DockerContainer | null; error: string | null }> {
  try {
    const { stdout } = await execFileAsync(
      "docker",
      [
        "ps",
        "-a",
        "--filter",
        `label=com.docker.compose.project=${PROJECT}`,
        "--filter",
        "label=com.docker.compose.service=sitl",
        "--format",
        "{{json .}}",
      ],
      { timeout: 3000, maxBuffer: 1024 * 1024 },
    );
    const first = stdout.split("\n").map((line) => line.trim()).find(Boolean);
    if (!first) return { container: null, error: null };
    const parsed = JSON.parse(first) as Record<string, unknown>;
    return {
      container: {
        id: String(parsed.ID || ""),
        name: String(parsed.Names || ""),
        status: String(parsed.Status || ""),
        state: String(parsed.State || "").toLowerCase(),
        ports: String(parsed.Ports || ""),
      },
      error: null,
    };
  } catch {
    return { container: null, error: "Docker is not available to the dev service." };
  }
}

function probePort(port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      finish(true);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      finish(false);
    });
  });
}

async function runBuildIdentity() {
  try {
    const { stdout } = await execFileAsync("git", ["-C", REPO_DIR, "rev-parse", "--short", "HEAD"], { timeout: 1500 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function getSITLStatus() {
  const [docker, tcp5760, tcp5762, commit] = await Promise.all([
    dockerContainer(),
    probePort(5760),
    probePort(5762),
    runBuildIdentity(),
  ]);
  const running = docker.container?.state === "running";
  const targetAvailable = listCustomTargets().includes(TARGET.toUpperCase());
  const binaryPresent = existsSync(BINARY);
  const state = activeOperation?.kind === "start" && !running
    ? "starting"
    : activeOperation?.kind === "stop"
      ? "stopping"
      : running && tcp5760
        ? "running"
        : running
          ? "degraded"
          : "stopped";

  return {
    state,
    target: TARGET,
    firmware: FIRMWARE,
    commit,
    targetAvailable,
    binaryPresent,
    availableTargets: listCustomTargets(),
    eh4Available: listCustomTargets().includes("EH4"),
    container: docker.container,
    dockerError: docker.error,
    mavlink: {
      tcp5760,
      tcp5762,
      udp5501: running,
    },
    remoteAccess: {
      origin: process.env.SITL_PUBLIC_ORIGIN || "https://dev.suasstem.org",
      websocketPath: "/api/sitl/ws",
      localEndpoint: "tcp://127.0.0.1:5760",
      connectorDownload: "/api/sitl-connect",
    },
    operation: activeOperation,
    logAvailable: existsSync(LOG_FILE),
  } as const;
}

export async function startSITL() {
  const current = await getSITLStatus();
  if (current.state === "running" || current.state === "degraded" || current.state === "starting") return current;
  if (activeOperation) return current;
  if (!current.targetAvailable || !current.binaryPresent) {
    throw new Error("The configured custom SITL target or binary is not available.");
  }

  const startedAt = new Date().toISOString();
  activeOperation = { kind: "start", startedAt };
  const logFd = openSync(LOG_FILE, "a");
  try {
    const child = spawn(RUNNER, ["start"], {
      cwd: SITL_DIR,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: { ...process.env, AP_CUSTOM_TARGET: TARGET, AP_CUSTOM_FIRMWARE_STRING: FIRMWARE },
    });
    child.once("error", () => {
      activeOperation = null;
    });
    child.unref();
    setTimeout(() => {
      if (activeOperation?.kind === "start" && activeOperation.startedAt === startedAt) activeOperation = null;
    }, 10 * 60 * 1000).unref();
  } catch (error) {
    activeOperation = null;
    throw error;
  } finally {
    // The child process owns its duplicated descriptors after spawn returns.
    // Closing this descriptor avoids leaking one into the Next.js worker.
    try { closeSync(logFd); } catch { /* best effort */ }
  }
  return getSITLStatus();
}

export async function stopSITL() {
  if (activeOperation?.kind === "stop") return getSITLStatus();
  activeOperation = { kind: "stop", startedAt: new Date().toISOString() };
  try {
    await execFileAsync(RUNNER, ["stop"], { cwd: SITL_DIR, timeout: 15000, maxBuffer: 1024 * 1024 });
    return getSITLStatus();
  } finally {
    activeOperation = null;
  }
}
