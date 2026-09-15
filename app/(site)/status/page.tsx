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
};

const POLL_MS = 10_000;

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

function TeamCard({
  label,
  team,
  qualifier,
}: {
  label: string;
  team: Team | null;
  qualifier?: string;
}) {
  return (
    <div className="spec-card min-h-36">
      <p className="spec-label">{label}</p>
      {team ? (
        <>
          <p className="!mb-1 font-mono text-sm text-teal-200">
            #{team.flight_order} · {team.uid}
          </p>
          <p className="!mb-3 text-lg font-semibold leading-snug text-white">{team.team}</p>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={team.flight_status} />
            {qualifier && <span className="text-xs text-white/50">{qualifier}</span>}
          </div>
        </>
      ) : (
        <p className="!mb-0 text-white/45">Not available yet</p>
      )}
    </div>
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
  const [lastBrowserFetch, setLastBrowserFetch] = useState<Date | null>(null);
  const [, tick] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/status?t=" + Date.now(), { cache: "no-store" });
      if (!response.ok) throw new Error("Status API returned " + String(response.status));
      const next = (await response.json()) as StatusData;
      setData(next);
      setError(null);
      setLastBrowserFetch(new Date());
    } catch (err) {
      console.error(err);
      setError("Could not refresh live status. Showing the last successful snapshot if available.");
    }
  }, []);

  useEffect(() => {
    refresh();
    const poll = window.setInterval(refresh, POLL_MS);
    const clock = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => {
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

  const totalTeams = data?.teams.length ?? 0;
  const allTableTeams = data ? [...data.teams, ...(data.other_teams || [])] : [];
  const currentOrder = data?.current_team ? Number(data.current_team.flight_order) : NaN;
  const progress = totalTeams && data ? Math.min(100, (data.gone_count / totalTeams) * 100) : 0;
  const teslaOrder = data?.tesla ? Number(data.tesla.flight_order) : NaN;
  const goneUids = new Set(data?.gone.map((team) => team.uid) || []);
  const teamsAheadOfTesla = data && Number.isFinite(teslaOrder)
    ? data.teams.filter((team) => {
        const order = Number(team.flight_order);
        return Number.isFinite(order) && order < teslaOrder && !goneUids.has(team.uid);
      }).length
    : null;
  const flightOrderWindow = data && Number.isFinite(teslaOrder)
    ? data.teams.filter((team) => {
        const order = Number(team.flight_order);
        return Number.isFinite(order) && order >= teslaOrder - 5 && order <= teslaOrder + 5;
      })
    : [];
  const safetyCounts = data
    ? data.teams.reduce((acc, team) => {
        const value = (team.safety_inspection || "").trim().toLowerCase();
        if (value === "passed") acc.passed += 1;
        else if (value === "in progress") acc.inProgress += 1;
        else if (value.includes("additional time")) acc.additionalTime += 1;
        else if (value) acc.other += 1;
        else acc.pending += 1;
        return acc;
      }, { passed: 0, inProgress: 0, additionalTime: 0, pending: 0, other: 0 })
    : null;

  return (
    <main className="min-h-full flex-1 px-4 py-8 text-white md:px-24 md:py-16">
      <section className="mx-auto w-full max-w-5xl">
        <div className="mb-8">
          <span className="eyebrow">SUAS 2026 · Mission Operations</span>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="!mb-2 !text-left">Flight Status</h1>
              <p className="!mb-0 max-w-2xl text-gray-300">
                Live competition status from RoboNation&apos;s published team status sheet.
                This page refreshes automatically every 10 seconds.
              </p>
            </div>
            <div className={"rounded-full border px-3 py-1.5 font-mono text-xs uppercase tracking-[0.16em] " + hp[1] + " " + hp[2] + " " + hp[3]}>
              <span className={"mr-2 inline-block h-2 w-2 rounded-full " + (effectiveHealth === "live" ? "bg-emerald-300" : effectiveHealth === "delayed" ? "bg-amber-300" : effectiveHealth === "stale" ? "bg-red-300" : "bg-white/40")} />
              {hp[0]}
            </div>
          </div>
        </div>

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
            <div className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
              <div className="spec-card">
                <p className="spec-value">{Number.isFinite(currentOrder) ? "#" + currentOrder : "—"}</p>
                <p className="spec-label">Current flight-order position</p>
              </div>
              <div className="spec-card">
                <p className="spec-value">{data.gone_count}/{totalTeams}</p>
                <p className="spec-label">Teams flown</p>
              </div>
              <div className="spec-card">
                <p className="spec-value">#{data.tesla?.flight_order || "—"}</p>
                <p className="spec-label">Our flight order</p>
              </div>
              <div className="spec-card">
                <p className="spec-value">{teamsAheadOfTesla ?? "—"}</p>
                <p className="spec-label">Teams ahead of Tesla</p>
              </div>
              <div className="spec-card">
                <p className="spec-value">{relativeAge(liveAge)}</p>
                <p className="spec-label">Last successful poll</p>
              </div>
              <div className="spec-card">
                <p className="spec-value">{data.poll_interval_seconds}s</p>
                <p className="spec-label">Refresh interval</p>
              </div>
            </div>

            <div className="mb-9">
              <div className="mb-2 flex items-center justify-between font-mono text-xs uppercase tracking-[0.12em] text-white/50">
                <span>Flight progress</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-teal-400 transition-[width] duration-500" style={{ width: String(progress) + "%" }} />
              </div>
            </div>

            <div className="mb-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <TeamCard
                label={data.current_is_inferred ? "Current in flight order (inferred)" : "Current in flight order"}
                team={data.current_team}
                qualifier={data.current_is_inferred ? "Earliest non-final holding/ready team" : undefined}
              />
              <TeamCard label="Previous team flown" team={data.last_team_gone} />
              <TeamCard label="Following in flight order" team={data.next_team} />
            </div>

            <div className="mb-10 rounded-lg border border-teal-300/25 bg-teal-300/[0.055] p-5 shadow-[0_0_30px_rgba(79,209,213,0.05)]">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="!mb-1 font-mono text-xs uppercase tracking-[0.16em] text-teal-200">Our team · TSLA</p>
                  <p className="!m-0 text-xl font-semibold">Tesla STEM High School — SUAS@STEM</p>
                </div>
                <StatusBadge value={data.tesla?.flight_status || ""} />
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
                <div><p className="spec-label">Flight order</p><p className="!m-0 font-mono text-lg">#{data.tesla?.flight_order || "—"}</p></div>
                <div><p className="spec-label">Teams ahead</p><p className="!m-0 font-mono text-lg">{teamsAheadOfTesla ?? "—"}</p></div>
                <div><p className="spec-label">Safety</p><p className="!m-0 text-sm">{data.tesla?.safety_inspection || "Pending"}</p></div>
                <div><p className="spec-label">Rapid response</p><p className="!m-0 text-sm">{data.tesla?.design_for_rapid_response || "Pending"}</p></div>
                <div><p className="spec-label">Location</p><p className="!m-0 text-sm">{data.tesla?.location || "Not reported"}</p></div>
                <div><p className="spec-label">Notes</p><p className="!m-0 text-sm">{data.tesla?.notes || "—"}</p></div>
              </div>
            </div>

            <section className="mb-10" aria-labelledby="our-flight-order-heading">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <span className="eyebrow">Flight order · our position</span>
                  <h2 id="our-flight-order-heading" className="!mb-0 !mt-2 !text-left">Around Tesla STEM</h2>
                </div>
                <span className="font-mono text-xs text-white/45">Ordered exactly by official flight order</span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {flightOrderWindow.map((team) => {
                  const isTesla = team.uid === "TSLA";
                  const isCurrent = team.uid === data.current_team?.uid;
                  const isGone = goneUids.has(team.uid);
                  return (
                    <div
                      key={team.uid}
                      className={
                        "grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 rounded-lg border px-4 py-3 " +
                        (isTesla
                          ? "border-teal-300/50 bg-teal-300/10"
                          : isCurrent
                            ? "border-sky-300/35 bg-sky-300/[0.07]"
                            : "border-white/10 bg-white/[0.025]")
                      }
                    >
                      <div className="font-mono text-lg font-semibold">#{team.flight_order}</div>
                      <div className="min-w-0">
                        <p className={(isTesla ? "text-teal-100 " : "") + "!mb-0 truncate font-semibold"}>{team.team}</p>
                        <p className="!mb-0 font-mono text-xs text-white/45">{team.uid}{isTesla ? " · OUR TEAM" : isCurrent ? " · CURRENT / NEXT" : isGone ? " · FLOWN" : ""}</p>
                      </div>
                      <StatusBadge value={team.flight_status} />
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mb-10" aria-labelledby="safety-inspection-heading">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <span className="eyebrow">Pre-flight gate</span>
                  <h2 id="safety-inspection-heading" className="!mb-0 !mt-2 !text-left">Safety Inspection</h2>
                </div>
                <StatusBadge value={data.tesla?.safety_inspection || "Pending"} />
              </div>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="spec-card"><p className="spec-value">{safetyCounts?.passed ?? 0}</p><p className="spec-label">Passed</p></div>
                <div className="spec-card"><p className="spec-value">{safetyCounts?.inProgress ?? 0}</p><p className="spec-label">In progress</p></div>
                <div className="spec-card"><p className="spec-value">{safetyCounts?.additionalTime ?? 0}</p><p className="spec-label">Additional time</p></div>
                <div className="spec-card"><p className="spec-value">{safetyCounts?.pending ?? 0}</p><p className="spec-label">Pending / blank</p></div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.025] p-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div><p className="spec-label">Tesla inspection</p><p className="!m-0 text-lg font-semibold">{data.tesla?.safety_inspection || "Pending"}</p></div>
                  <div><p className="spec-label">Tesla location</p><p className="!m-0 text-lg font-semibold">{data.tesla?.location || "Not reported"}</p></div>
                  <div><p className="spec-label">Teams passed</p><p className="!m-0 text-lg font-semibold">{safetyCounts?.passed ?? 0}/{totalTeams}</p></div>
                </div>
                <p className="!mb-0 !mt-4 text-sm text-white/55">Safety inspection is required before mission flight. This mirrors the official live sheet and never infers a pass from flight order alone.</p>
              </div>
            </section>

            <div className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-white/[0.025] p-5">
                <p className="spec-label">Data freshness</p>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4"><dt className="text-white/50">Last successful poll</dt><dd className="text-right">{formatTime(data.updated_at)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-white/50">Last status change</dt><dd className="text-right">{formatTime(data.state_changed_at)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-white/50">Poll age</dt><dd className="text-right">{relativeAge(liveAge)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-white/50">Page fetched</dt><dd className="text-right">{lastBrowserFetch ? formatTime(lastBrowserFetch.toISOString()) : "—"}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-white/50">Health</dt><dd className="text-right capitalize">{effectiveHealth}</dd></div>
                </dl>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.025] p-5">
                <p className="spec-label">Interpretation</p>
                <p className="!mb-2 text-sm text-white/65">
                  A team is counted as flown once RoboNation gives it a terminal flight status such as Completed or Crashed/Collision.
                </p>
                <p className="!m-0 text-sm text-white/65">
                  When no explicit active status exists, the current/next team is marked as inferred rather than presented as certain.
                </p>
              </div>
            </div>

            <div>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <span className="eyebrow">Flight order</span>
                  <h2 className="!mb-0 !mt-2 !text-left">All teams</h2>
                </div>
                <span className="font-mono text-xs text-white/45">{totalTeams} scheduled · {data.other_teams?.length || 0} not attending/canceled</span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="!m-0 min-w-[1280px] text-sm">
                  <thead>
                    <tr>
                      <th className="text-left">Order</th>
                      <th className="text-left">UID</th>
                      <th className="text-left">Team</th>
                      <th className="text-left">Safety Inspection</th>
                      <th className="text-left">Design for Rapid Response</th>
                      <th className="text-left">Location</th>
                      <th className="text-left">Flight Status</th>
                      <th className="text-left">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allTableTeams.map((team) => {
                      const isTesla = team.uid === "TSLA";
                      const isCurrent = team.uid === data.current_team?.uid;
                      const rowClass = isTesla
                        ? "!bg-teal-300/15 outline outline-1 -outline-offset-1 outline-teal-300/50"
                        : isCurrent
                          ? "!bg-sky-300/[0.08]"
                          : undefined;
                      return (
                        <tr key={team.uid} className={rowClass}>
                          <td className="font-mono font-semibold">#{team.flight_order}</td>
                          <td className="font-mono text-white/60">{team.uid}</td>
                          <td className={isTesla ? "font-semibold text-teal-100" : undefined}>{team.team}</td>
                          <td>{team.safety_inspection || "—"}</td>
                          <td>{team.design_for_rapid_response || "—"}</td>
                          <td>{team.location || "—"}</td>
                          <td><StatusBadge value={team.flight_status} /></td>
                          <td className="max-w-72 whitespace-normal text-white/65">{team.notes || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
