"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Team = {
  flight_order: string;
  uid: string;
  team: string;
  safety_inspection: string;
  design_for_rapid_response: string;
  location: string;
  flight_status: string;
  notes: string;
};

type StatusData = {
  updated_at: string;
  state_changed_at?: string;
  source: string;
  current_team: Team | null;
  current_is_inferred: boolean;
  last_team_gone: Team | null;
  next_team: Team | null;
  gone_count: number;
  gone: Team[];
  tesla: Team | null;
  teams: Team[];
  other_teams?: Team[];
  health: "live" | "delayed" | "stale";
  age_seconds: number;
  stale_after_seconds: number;
  file_mtime: string;
  served_at: string;
  poll_interval_seconds: number;
  mission_timing?: {
    sample_count: number;
    median_duration_minutes: number | null;
    recent_durations_minutes: number[];
    method: string;
    estimated_queue_minutes?: number | null;
    runway_available_in_minutes?: Record<string, number>;
    scheduled_ahead?: Array<{ uid: string; runway: string; start_in_minutes: number }>;
  };
};

const FALLBACK_POLL_MS = 1_000;

function statusTone(status: string) {
  const s = status.toLowerCase();
  if (s.includes("complete")) return "text-emerald-300 border-emerald-300/30 bg-emerald-300/10";
  if (s.includes("crash") || s.includes("collision") || s.includes("dnf"))
    return "text-amber-300 border-amber-300/30 bg-amber-300/10";
  if (s.includes("hold") || s.includes("queue") || s.includes("ready"))
    return "text-sky-300 border-sky-300/30 bg-sky-300/10";
  if (status) return "text-teal-200 border-teal-300/30 bg-teal-300/10";
  return "text-white/45 border-white/10 bg-white/[0.03]";
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span className={"inline-flex rounded-full border px-2.5 py-1 font-mono text-[0.7rem] uppercase tracking-[0.12em] " + statusTone(value)}>
      {value || "Pending"}
    </span>
  );
}

function formatTime(value: string | undefined) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function relativeAge(seconds: number) {
  if (seconds < 5) return "just now";
  if (seconds < 60) return String(seconds) + "s ago";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return String(mins) + "m " + String(seconds % 60) + "s ago";
  const hours = Math.floor(mins / 60);
  return String(hours) + "h " + String(mins % 60) + "m ago";
}

export default function StatusPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/status?t=" + Date.now(), { cache: "no-store" });
      if (!response.ok) throw new Error("Status API returned " + String(response.status));
      const next = (await response.json()) as StatusData;
      setData(next);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Could not refresh live status. Showing the last successful snapshot if available.");
    }
  }, []);

  useEffect(() => {
    refresh();
    const stream = new EventSource("/api/status/stream");
    stream.onmessage = (event) => {
      try {
        const next = JSON.parse(event.data) as StatusData;
        setData(next);
        setError(null);
      } catch (err) {
        console.error("Invalid live status event", err);
      }
    };
    const poll = window.setInterval(() => {
      if (stream.readyState !== EventSource.OPEN) void refresh();
    }, FALLBACK_POLL_MS);
    const clock = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => {
      stream.close();
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [refresh]);

  const liveAge = data
    ? Math.max(0, Math.floor((Date.now() - new Date(data.updated_at).getTime()) / 1000))
    : 0;

  const effectiveHealth = useMemo(() => {
    if (!data) return "loading";
    if (liveAge >= 180) return "stale";
    if (liveAge >= 90) return "delayed";
    return data.health;
  }, [data, liveAge]);

  const healthPresentation: Record<string, [string, string, string, string]> = {
    loading: ["Loading", "text-white/60", "bg-white/10", "border-white/15"],
    live: ["Live", "text-emerald-300", "bg-emerald-300/10", "border-emerald-300/30"],
    delayed: ["Delayed", "text-amber-300", "bg-amber-300/10", "border-amber-300/30"],
    stale: ["Stale", "text-red-300", "bg-red-300/10", "border-red-300/30"],
  };
  const hp = healthPresentation[effectiveHealth];

  const allTableTeams = data ? [...data.teams, ...(data.other_teams || [])] : [];
  const teslaOrder = data?.tesla ? Number(data.tesla.flight_order) : NaN;
  const goneUids = new Set(data?.gone.map((team) => team.uid) || []);
  const teamsAheadOfTesla = data && Number.isFinite(teslaOrder)
    ? data.teams.filter((team) => {
        const order = Number(team.flight_order);
        return Number.isFinite(order) && order < teslaOrder && !goneUids.has(team.uid);
      }).length
    : null;
  const currentMissionOrder = data?.current_team ? Number(data.current_team.flight_order) : NaN;
  const missionQueue = data && Number.isFinite(teslaOrder)
    ? data.teams.filter((team) => {
        const order = Number(team.flight_order);
        const start = Number.isFinite(currentMissionOrder) ? Math.max(1, currentMissionOrder) : Math.max(1, teslaOrder - 8);
        return Number.isFinite(order) && order >= start && order <= teslaOrder + 2;
      })
    : [];
  const fallbackMissionMinutes = 45;
  const observedMissionMinutes = data?.mission_timing?.median_duration_minutes ?? null;
  const modeledEtaMinutes = data?.mission_timing?.estimated_queue_minutes ?? null;
  const missionEtaMinutes = modeledEtaMinutes != null
    ? Math.round(modeledEtaMinutes)
    : teamsAheadOfTesla == null
      ? null
      : Math.round(Math.ceil(teamsAheadOfTesla / 2) * (observedMissionMinutes ?? fallbackMissionMinutes));
  const missionEtaLabel = missionEtaMinutes == null
    ? "—"
    : missionEtaMinutes === 0
      ? "Now / next"
      : `~${missionEtaMinutes} min`;
  const missionEtaBasis = observedMissionMinutes != null
    ? `Two-runway queue model · last ${data?.mission_timing?.sample_count ?? 0} completed mission${data?.mission_timing?.sample_count === 1 ? "" : "s"} · ${observedMissionMinutes.toFixed(1)} min pace`
    : "Two-runway queue model · no completed timing yet · using 45 min maximum";

  return (
    <main className="min-h-full flex-1 px-4 py-8 text-white md:px-24 md:py-16">
      <section className="mx-auto w-full max-w-5xl">
        {error && (
          <div role="alert" className="mb-6 rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            {error}
          </div>
        )}

        {!data ? (
          <div className="spec-card">
            <p className="!m-0 text-white/60">Loading competition status…</p>
          </div>
        ) : (
          <>
            <section className="mb-10" aria-labelledby="mission-order-heading">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <span className="eyebrow">SUAS 2026 · Mission operations</span>
                  <h1 id="mission-order-heading" className="!mb-0 !mt-2 !text-left">Mission Flight Order</h1>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-xs text-white/60">Updated {relativeAge(liveAge)}</div>
                  <div className={"rounded-full border px-3 py-1.5 font-mono text-xs uppercase tracking-[0.16em] " + hp[1] + " " + hp[2] + " " + hp[3]}>
                    <span className={"mr-2 inline-block h-2 w-2 rounded-full " + (effectiveHealth === "live" ? "bg-emerald-300" : effectiveHealth === "delayed" ? "bg-amber-300" : effectiveHealth === "stale" ? "bg-red-300" : "bg-white/40")} />
                    {hp[0]}
                  </div>
                </div>
              </div>

              <div className="mb-4 rounded-xl border border-teal-300/35 bg-teal-300/[0.07] p-5">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="!mb-1 font-mono text-xs uppercase tracking-[0.16em] text-teal-200">Our team · TSLA</p>
                    <p className="!m-0 text-lg font-semibold sm:text-xl">Tesla STEM High School — SUAS@STEM</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="!mb-0 font-mono text-5xl font-bold leading-none text-teal-200">#{data.tesla?.flight_order || "—"}</p>
                    <p className="!m-0 mt-1 text-[10px] uppercase tracking-wider text-white/45">mission order</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5 sm:gap-3">
                  <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-3"><p className="!mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Teams ahead</p><p className="!m-0 font-mono text-2xl font-bold leading-none text-white">{teamsAheadOfTesla ?? "—"}</p></div>
                  <div className="rounded-lg border border-teal-300/20 bg-teal-300/[0.04] px-3 py-3"><p className="!mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-teal-200/60">Queue ETA</p><p className="!m-0 font-mono text-xl font-bold leading-none text-teal-100 sm:text-lg">{missionEtaLabel}</p></div>
                  <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-3"><p className="!mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Safety</p><p className="!m-0 text-base font-semibold leading-tight text-white">{data.tesla?.safety_inspection || "Pending"}</p></div>
                  <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-3"><p className="!mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Rapid Response</p><p className="!m-0 text-base font-semibold leading-tight text-white">{data.tesla?.design_for_rapid_response || "Pending"}</p></div>
                  <div className="col-span-2 rounded-lg border border-white/10 bg-black/10 px-3 py-3 sm:col-span-1"><p className="!mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Location</p><p className="!m-0 text-base font-semibold leading-tight text-white">{data.tesla?.location || "Not reported"}</p></div>
                </div>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="spec-card">
                  <p className="!mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Current / next</p>
                  <p className="!mb-2 font-mono text-2xl font-bold leading-none text-white">#{data.current_team?.flight_order || "—"} {data.current_team?.uid || "—"}</p>
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge value={data.current_team?.flight_status || "Pending"} /><span className="text-xs text-white/45">{data.current_team?.location || ""}</span></div>
                </div>
                <div className="spec-card">
                  <p className="!mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Following</p>
                  <p className="!mb-2 font-mono text-2xl font-bold leading-none text-white">#{data.next_team?.flight_order || "—"} {data.next_team?.uid || "—"}</p>
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge value={data.next_team?.flight_status || "Pending"} /><span className="text-xs text-white/45">{data.next_team?.location || ""}</span></div>
                </div>
              </div>

              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <span className="eyebrow">Live queue</span>
                  <h2 className="!mb-0 !mt-2 !text-left">Current → TSLA</h2>
                </div>
                <span className="font-mono text-xs text-white/45">{teamsAheadOfTesla ?? "—"} ahead</span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="!m-0 min-w-[610px] text-sm">
                  <thead><tr>
                    <th className="text-left">#</th>
                    <th className="text-left">Code</th>
                    <th className="text-left">Location</th>
                    <th className="text-left">Flight</th>
                    <th className="text-left">Safety</th>
                    <th className="text-left">Rapid</th>
                  </tr></thead>
                  <tbody>
                    {missionQueue.map((team) => {
                      const isTesla = team.uid === "TSLA";
                      const isCurrent = team.uid === data.current_team?.uid;
                      const isNext = team.uid === data.next_team?.uid;
                      return (
                        <tr key={team.uid} className={isTesla ? "!bg-teal-300/15 outline outline-1 -outline-offset-1 outline-teal-300/50" : isCurrent ? "!bg-sky-300/[0.10]" : isNext ? "!bg-white/[0.05]" : undefined}>
                          <td className="font-mono text-base font-semibold">#{team.flight_order}</td>
                          <td className={(isTesla ? "text-teal-100 " : "") + "font-mono text-base font-semibold"}>{team.uid}{isTesla ? <span className="ml-1 text-[10px] text-teal-300">US</span> : null}</td>
                          <td className="whitespace-nowrap text-xs text-white/60">{team.location || "—"}</td>
                          <td><StatusBadge value={team.flight_status || (isCurrent ? "Current" : "Pending")} /></td>
                          <td><StatusBadge value={team.safety_inspection || "Pending"} /></td>
                          <td><StatusBadge value={team.design_for_rapid_response || "Pending"} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {teamsAheadOfTesla ? <p className="!mb-0 !mt-3 text-xs text-white/45">ETA models Flight Line 1/A and 2/B separately, including the active mission remaining time and each team already assigned to a flight line. {missionEtaBasis}. It updates automatically as more teams finish.</p> : null}
            </section>

            <section>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <span className="eyebrow">Full live sheet</span>
                  <h2 className="!mb-0 !mt-2 !text-left">All teams</h2>
                </div>
                <span className="font-mono text-xs text-white/45">Updated {relativeAge(liveAge)} · every {data.poll_interval_seconds}s</span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="!m-0 min-w-[920px] text-sm">
                  <thead><tr>
                    <th className="text-left">Order</th><th className="text-left">Code</th><th className="text-left">Location</th><th className="text-left">Flight Status</th><th className="text-left">Safety</th><th className="text-left">Rapid Response</th><th className="text-left">Notes</th>
                  </tr></thead>
                  <tbody>
                    {allTableTeams.map((team) => {
                      const isTesla = team.uid === "TSLA";
                      const isCurrent = team.uid === data.current_team?.uid;
                      return (
                        <tr key={team.uid} className={isTesla ? "!bg-teal-300/15 outline outline-1 -outline-offset-1 outline-teal-300/50" : isCurrent ? "!bg-sky-300/[0.08]" : undefined}>
                          <td className="font-mono font-semibold">#{team.flight_order}</td>
                          <td className={(isTesla ? "text-teal-100 " : "") + "font-mono font-semibold"}>{team.uid}</td>
                          <td>{team.location || "—"}</td>
                          <td><StatusBadge value={team.flight_status} /></td>
                          <td>{team.safety_inspection || "—"}</td>
                          <td>{team.design_for_rapid_response || "—"}</td>
                          <td className="max-w-72 whitespace-normal text-white/65">{team.notes || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="!mb-0 !mt-4 font-mono text-xs text-white/40">Last successful poll: {formatTime(data.updated_at)} · {effectiveHealth}</p>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
