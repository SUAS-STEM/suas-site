"use client";

import { useCallback, useEffect, useState } from "react";

type SITLStatus = {
  state: "starting" | "running" | "degraded" | "stopping" | "stopped";
  target: string;
  firmware: string;
  commit: string | null;
  targetAvailable: boolean;
  binaryPresent: boolean;
  availableTargets: string[];
  eh4Available: boolean;
  mavlink: { tcp5760: boolean; tcp5762: boolean; udp5501: boolean };
  remoteAccess: { origin: string; websocketPath: string; localEndpoint: string; connectorDownload: string };
  canControl: boolean;
  container: { name: string; status: string } | null;
  dockerError: string | null;
  operation: { kind: "start" | "stop"; startedAt: string } | null;
};

type MissionPlannerAccess = {
  mode: "websocket";
  leaseSeconds: number;
  clientIp: string | null;
  enabled: boolean;
  websocketUrl?: string;
  lease: {
    principalId: string;
    principalName: string;
    clientIp: string;
    createdAt: string;
    expiresAt: string;
    lastConnectedAt: string | null;
    connectionCount: number;
  } | null;
};

const stateLabels: Record<SITLStatus["state"], string> = {
  starting: "Starting",
  running: "Running",
  degraded: "Needs attention",
  stopping: "Stopping",
  stopped: "Stopped",
};

export default function SitlTab() {
  const [status, setStatus] = useState<SITLStatus | null>(null);
  const [missionAccess, setMissionAccess] = useState<MissionPlannerAccess | null>(null);
  const [websocketUrl, setWebsocketUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accessBusy, setAccessBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [statusResponse, accessResponse] = await Promise.all([
        fetch("/api/dev-sitl", { cache: "no-store" }),
        fetch("/api/sitl-access", { cache: "no-store" }),
      ]);
      const data = await statusResponse.json() as SITLStatus & { error?: string };
      const access = await accessResponse.json() as MissionPlannerAccess & { error?: string };
      if (!statusResponse.ok) throw new Error(data.error || "Could not read SITL status.");
      if (!accessResponse.ok) throw new Error(access.error || "Could not read Mission Planner access.");
      setStatus(data);
      setMissionAccess(access);
      if (!access.enabled) setWebsocketUrl("");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read SITL status.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function control(action: "start" | "stop") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/dev-sitl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json() as SITLStatus & { error?: string };
      if (!response.ok) throw new Error(data.error || `Could not ${action} SITL.`);
      setStatus(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not ${action} SITL.`);
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  async function setMissionPlannerConnection(enabled: boolean) {
    setAccessBusy(true);
    setError("");
    try {
      const response = await fetch("/api/sitl-access", {
        method: enabled ? "POST" : "DELETE",
      });
      const data = await response.json() as MissionPlannerAccess & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not update Mission Planner access.");
      setMissionAccess(data);
      setWebsocketUrl(enabled ? data.websocketUrl || "" : "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update Mission Planner access.");
    } finally {
      setAccessBusy(false);
    }
  }

  const state = status?.state || "stopped";
  const active = state === "running" || state === "degraded";
  const statusClass = active ? "bg-emerald-400" : state === "starting" || state === "stopping" ? "bg-amber-300" : "bg-white/35";

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-mono uppercase tracking-[0.18em] text-white/35">Simulation control</p>
            <h2 className="!m-0 text-2xl">ArduPlane SITL</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
              A private Docker-hosted fixed-wing simulator for flight-control and parameter testing.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-sm text-white/75" role="status" aria-live="polite">
            <span className={`h-2 w-2 rounded-full ${statusClass}`} aria-hidden="true" />
            {stateLabels[state]}
          </div>
        </div>

        {error && <p className="mt-4 rounded border border-red-300/25 bg-red-300/10 px-3 py-2 text-sm text-red-100">{error}</p>}
        {status?.dockerError && <p className="mt-4 rounded border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">{status.dockerError}</p>}

        <div className="mt-5 flex flex-wrap gap-2">
          {status?.canControl ? (
            <>
              <button type="button" onClick={() => void control("start")} disabled={busy || active || state === "starting"} className="rounded bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-40">Start simulator</button>
              <button type="button" onClick={() => void control("stop")} disabled={busy || (!active && state !== "starting")} className="rounded border border-white/15 px-4 py-2 text-sm text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40">Stop simulator</button>
            </>
          ) : (
            <p className="m-0 text-sm text-white/45">Administrator access is required to start or stop the simulator.</p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-mono uppercase tracking-[0.18em] text-white/35">Mission Planner</p>
            <h3 className="!m-0 text-xl">Encrypted WebSocket connection</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
              No helper program, VPN, or port forwarding. Generate a short-lived link for your current public IP and paste it directly into Mission Planner.
            </p>
          </div>
          <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
            missionAccess?.enabled ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-white/10 text-white/55"
          }`}>
            <span className={`h-2 w-2 rounded-full ${missionAccess?.enabled ? "bg-emerald-300" : "bg-white/30"}`} aria-hidden="true" />
            {missionAccess?.enabled ? "Authorized" : "Not authorized"}
          </span>
        </div>

        {websocketUrl && (
          <div className="mt-5 rounded-lg border border-emerald-300/20 bg-emerald-300/[0.06] p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-emerald-100/55">Mission Planner URL</p>
            <code className="mt-2 block break-all rounded bg-black/25 px-3 py-2 text-sm text-teal-100">{websocketUrl}</code>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(websocketUrl)}
              className="mt-3 rounded border border-white/15 px-3 py-1.5 text-xs text-white/75 transition hover:bg-white/10"
            >
              Copy URL
            </button>
          </div>
        )}

        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm leading-6 text-white/55">
          <li>In Mission Planner, open the connection-type dropdown and choose <strong className="font-medium text-white/80">WS</strong>.</li>
          <li>Click Connect and paste the generated <strong className="font-medium text-white/80">wss://</strong> URL.</li>
          <li>Mission Planner connects directly to SITL over the encrypted web connection.</li>
        </ol>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {missionAccess?.enabled ? (
            <>
              <button type="button" onClick={() => void setMissionPlannerConnection(true)} disabled={accessBusy || !active} className="rounded bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/85 disabled:opacity-40">
                Generate new link
              </button>
              <button type="button" onClick={() => void setMissionPlannerConnection(false)} disabled={accessBusy} className="rounded border border-white/15 px-4 py-2 text-sm text-white transition hover:bg-white/10 disabled:opacity-40">
                Disable
              </button>
              <span className="text-xs text-white/40">
                Expires {missionAccess.lease ? new Date(missionAccess.lease.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "soon"}
              </span>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void setMissionPlannerConnection(true)}
              disabled={accessBusy || !active}
              className="rounded bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Generate Mission Planner link
            </button>
          )}
        </div>
        <p className="mt-2 text-xs leading-5 text-white/35">
          The URL is tied to your current public IP and expires automatically. Generate a new one if you change networks.
        </p>
        {!active && <p className="mt-2 text-xs text-white/35">Start SITL before generating a Mission Planner link.</p>}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="!m-0 text-base">Build identity</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-white/45">Custom target</dt><dd className="font-mono text-white/85">{status?.firmware || "—"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-white/45">Source commit</dt><dd className="font-mono text-white/85">{status?.commit || "—"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-white/45">Binary</dt><dd className={status?.binaryPresent ? "text-emerald-200" : "text-red-200"}>{status?.binaryPresent ? "Available" : "Missing"}</dd></div>
          </dl>
          {status?.target === "EH5" && <p className="mt-4 border-t border-white/10 pt-4 text-sm leading-6 text-white/45">This simulator uses the EH5 custom firmware identity with the ArduPilot SITL board runtime.</p>}
        </section>

        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="!m-0 text-base">MAVLink endpoints</h3>
          <p className="mt-2 text-sm leading-6 text-white/45">SITL and its MAVLink proxy stay loopback-only. Remote Mission Planner traffic enters through an authenticated WSS connection on dev.suasstem.org; no raw MAVLink port is exposed to the Internet.</p>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="font-mono text-white/55">TCP 5760</dt><dd className={status?.mavlink.tcp5760 ? "text-emerald-200" : "text-white/35"}>{status?.mavlink.tcp5760 ? "Reachable" : "Offline"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="font-mono text-white/55">TCP 5762</dt><dd className={status?.mavlink.tcp5762 ? "text-emerald-200" : "text-white/35"}>{status?.mavlink.tcp5762 ? "Reachable" : "Offline"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="font-mono text-white/55">UDP 5501</dt><dd className={status?.mavlink.udp5501 ? "text-emerald-200" : "text-white/35"}>{status?.mavlink.udp5501 ? "Published" : "Offline"}</dd></div>
          </dl>
          <div className="mt-5 border-t border-white/10 pt-4">
            <p className="text-xs font-mono uppercase tracking-[0.16em] text-white/35">Legacy connector</p>
            <code className="mt-2 block break-all rounded bg-black/25 px-3 py-2 text-sm text-teal-100">{status?.remoteAccess.localEndpoint || "tcp://127.0.0.1:5760"}</code>
            <p className="mt-2 text-xs leading-5 text-white/45">The older local TCP connector remains available for tools that cannot open WebSockets directly.</p>
            <a href={status?.remoteAccess.connectorDownload || "/api/sitl-connect"} download className="mt-3 inline-block text-sm text-teal-200 underline decoration-teal-200/30 underline-offset-4">Download sitl-connect.py</a>
          </div>
        </section>
      </div>
    </div>
  );
}
