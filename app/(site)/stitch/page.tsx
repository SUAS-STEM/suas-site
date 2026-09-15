"use client";

import { useEffect, useMemo, useState } from "react";

const POLL_MS = 3000;
const STAGES = [
  ["queued", "Queued"], ["runner", "Runner starting"], ["downloaded", "Images downloaded"],
  ["image", "ODM image pulled"], ["extract", "Feature extraction"], ["match", "Feature matching"],
  ["reconstruct", "Reconstruction"], ["geo", "Georeferencing"], ["ortho", "Orthophoto generation"], ["complete", "Complete"],
] as const;

type StitchData = {
  status: string; progress: number; stage: string; runner?: string | null; cpus?: number | null;
  images?: number | null; datasetSizeMB?: number | null; elapsedSeconds?: number | null; currentStep?: string | null;
  webodm?: { ready?: boolean; readySeconds?: number | null };
  odm?: { status?: string; stage?: string | null; processingSeconds?: number | null };
  orthophoto?: { ready?: boolean; sizeBytes?: number | null };
  timing?: { startupSeconds?: number | null; processingSeconds?: number | null };
  timestamps?: { queuedAt?: string | null; startedAt?: string | null; completedAt?: string | null };
  logs?: string[]; failure?: unknown; artifact?: { name?: string; sizeBytes?: number | null; url?: string | null } | null;
  updatedAt?: string;
};

function duration(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const total = Math.max(0, Math.round(Number(value)));
  const m = Math.floor(total / 60), s = total % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}
function bytes(value?: number | null) {
  if (value == null) return "—";
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}
function time(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}
function stageIndex(data: StitchData | null) {
  if (!data) return 0;
  if (data.status === "complete") return STAGES.length - 1;
  const h = `${data.stage || ""} ${data.currentStep || ""} ${data.odm?.stage || ""}`.toLowerCase();
  const terms: [string, string[]][] = [
    ["runner", ["runner", "starting"]], ["downloaded", ["download", "dataset"]], ["image", ["pull", "image"]],
    ["extract", ["extract"]], ["match", ["match"]], ["reconstruct", ["reconstruct", "opensfm"]],
    ["geo", ["georef"]], ["ortho", ["orthophoto"]],
  ];
  let out = 0;
  for (const [key, needles] of terms) if (needles.some((x) => h.includes(x))) out = Math.max(out, STAGES.findIndex(([k]) => k === key));
  return out;
}

export default function StitchPage() {
  const [data, setData] = useState<StitchData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/stitch/status?t=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const next = await r.json() as StitchData;
        if (!cancelled) { setData(next); setFetchedAt(new Date()); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Status unavailable");
      }
    };
    load(); const timer = window.setInterval(load, POLL_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const current = useMemo(() => stageIndex(data), [data]);
  const progress = Math.max(0, Math.min(100, Number(data?.progress || 0)));
  const logs = data?.logs || [];

  return (
    <main className="min-h-full flex-1 px-4 py-8 text-white md:px-16 md:py-14">
      <section className="mx-auto w-full max-w-5xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div><span className="eyebrow">SUAS@STEM · internal infrastructure</span><h1 className="!mb-1 !mt-2 !text-left">ODM Stitch Monitor</h1><p className="!m-0 text-white/55">GitHub Actions → WebODM / ODM → orthophoto</p></div>
          <div className={`rounded-full border px-3 py-1.5 font-mono text-xs ${error ? "border-red-300/30 bg-red-300/10 text-red-200" : "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"}`}>{error ? `API ${error}` : `Live · ${POLL_MS / 1000}s refresh`}</div>
        </div>

        <div className="spec-card !mb-6">
          <div className="flex items-start justify-between gap-4"><div><p className="spec-label">Overall status</p><h2 className="!mb-1 !mt-1 !text-left">{data?.stage || "Loading…"}</h2><p className="!m-0 text-white/55">{data?.currentStep || "Waiting for status data"}</p></div><div className="font-mono text-4xl font-bold text-teal-200">{Math.round(progress)}%</div></div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-teal-300 transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-white/45"><span>Elapsed {duration(data?.elapsedSeconds)}</span><span>Updated {time(data?.updatedAt)}</span>{fetchedAt && <span>Fetched {fetchedAt.toLocaleTimeString()}</span>}</div>
        </div>

        <div className="spec-card !mb-6">
          <p className="spec-label">Pipeline</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{STAGES.map(([key, label], i) => { const done = data?.status === "complete" || i < current; const active = data?.status !== "complete" && i === current; return <div key={key} className={`rounded-lg border px-3 py-3 text-sm ${done ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : active ? "border-teal-300/40 bg-teal-300/10 text-teal-100" : "border-white/10 bg-white/[0.02] text-white/40"}`}><span className="mr-2 font-mono">{done ? "✓" : active ? "●" : "·"}</span>{label}</div>; })}</div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="spec-card"><p className="spec-label">Runner</p><p className="!m-0 font-mono text-xl font-semibold">{data?.runner || "—"}</p><p className="!m-0 mt-1 text-xs text-white/45">{data?.cpus ? `${data.cpus} CPUs` : "CPU unknown"}</p></div>
          <div className="spec-card"><p className="spec-label">Images</p><p className="!m-0 font-mono text-xl font-semibold">{data?.images ?? "—"}</p><p className="!m-0 mt-1 text-xs text-white/45">{data?.datasetSizeMB != null ? `${data.datasetSizeMB} MB dataset` : "Dataset unknown"}</p></div>
          <div className="spec-card"><p className="spec-label">WebODM startup</p><p className="!m-0 font-mono text-xl font-semibold">{duration(data?.timing?.startupSeconds ?? data?.webodm?.readySeconds)}</p><p className="!m-0 mt-1 text-xs text-white/45">{data?.webodm?.ready ? "Ready" : "Waiting"}</p></div>
          <div className="spec-card"><p className="spec-label">ODM processing</p><p className="!m-0 font-mono text-xl font-semibold">{duration(data?.timing?.processingSeconds ?? data?.odm?.processingSeconds)}</p><p className="!m-0 mt-1 text-xs text-white/45">{data?.odm?.status || "Idle"}</p></div>
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-2">
          <div className="spec-card"><p className="spec-label">Output</p><p className="!mb-1 font-mono text-lg font-semibold">{data?.artifact?.name || (data?.orthophoto?.ready ? "Orthophoto ready" : "Waiting")}</p><p className="!m-0 text-sm text-white/55">{bytes(data?.artifact?.sizeBytes ?? data?.orthophoto?.sizeBytes)}</p>{data?.artifact?.url && <a className="mt-2 inline-block text-sm text-teal-200 underline" href={data.artifact.url} target="_blank" rel="noreferrer">Open Actions run ↗</a>}</div>
          <div className="spec-card"><p className="spec-label">Timing</p><div className="grid gap-1 font-mono text-xs text-white/60"><span>Queued: {time(data?.timestamps?.queuedAt)}</span><span>Started: {time(data?.timestamps?.startedAt)}</span><span>Completed: {time(data?.timestamps?.completedAt)}</span></div></div>
        </div>

        {data?.failure ? <div className="mb-6 rounded-lg border border-red-300/30 bg-red-300/10 p-4 text-red-100"><p className="spec-label !text-red-200">Failure</p><pre className="whitespace-pre-wrap text-xs">{typeof data.failure === "string" ? data.failure : JSON.stringify(data.failure, null, 2)}</pre></div> : null}

        <div className="spec-card"><p className="spec-label">Recent events</p><div className="mt-3 space-y-1 font-mono text-xs text-white/55">{logs.length ? logs.slice(-20).map((line, i) => <div key={`${i}-${line}`}>{line}</div>) : <div>No events yet.</div>}</div></div>
      </section>
    </main>
  );
}
