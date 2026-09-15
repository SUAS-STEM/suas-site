"use client";
/* eslint-disable @next/next/no-img-element -- live no-store previews should bypass Next image caching */

import { useEffect, useMemo, useState } from "react";
import exifr from "exifr";
import Link from "next/link";

const POLL_MS = 3000;
const STAGES = [
  ["queued", "Queued"], ["runner", "Runner starting"], ["downloaded", "Images downloaded"],
  ["image", "ODM image pulled"], ["extract", "Feature extraction"], ["match", "Feature matching"],
  ["reconstruct", "Reconstruction"], ["geo", "Georeferencing"], ["ortho", "Orthophoto generation"], ["complete", "Complete"],
] as const;

type StitchData = {
  jobId?: string | null; runId?: number | null;
  status: string; progress: number; stage: string; runner?: string | null; cpus?: number | null;
  images?: number | null; datasetSizeMB?: number | null; elapsedSeconds?: number | null; currentStep?: string | null;
  webodm?: { ready?: boolean; readySeconds?: number | null };
  odm?: { status?: string; stage?: string | null; processingSeconds?: number | null };
  orthophoto?: { ready?: boolean; sizeBytes?: number | null };
  timing?: { startupSeconds?: number | null; processingSeconds?: number | null };
  timestamps?: { queuedAt?: string | null; startedAt?: string | null; completedAt?: string | null };
  logs?: string[]; failure?: unknown; artifact?: { name?: string; sizeBytes?: number | null; url?: string | null; githubName?: string; previewName?: string } | null;
  updatedAt?: string;
};

type UploadExif = {
  hasExif: boolean;
  hasGps: boolean;
  latitude?: number;
  longitude?: number;
  make?: string;
  model?: string;
  capturedAt?: string;
};

type SelectedImage = { file: File; exif: UploadExif };

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

async function inspectExif(file: File): Promise<UploadExif> {
  try {
    const [raw, gps] = await Promise.all([
      exifr.parse(file).catch(() => null),
      exifr.gps(file).catch(() => null),
    ]);
    const tags = (raw || {}) as Record<string, unknown>;
    const loc = (gps || {}) as Record<string, unknown>;
    const latitude = Number(loc.latitude);
    const longitude = Number(loc.longitude);
    const captured = tags.DateTimeOriginal ?? tags.CreateDate ?? tags.DateTime;
    return {
      hasExif: Boolean(raw),
      hasGps: Number.isFinite(latitude) && Number.isFinite(longitude),
      latitude: Number.isFinite(latitude) ? latitude : undefined,
      longitude: Number.isFinite(longitude) ? longitude : undefined,
      make: typeof tags.Make === "string" ? tags.Make : undefined,
      model: typeof tags.Model === "string" ? tags.Model : undefined,
      capturedAt: captured instanceof Date ? captured.toISOString() : typeof captured === "string" ? captured : undefined,
    };
  } catch {
    return { hasExif: false, hasGps: false };
  }
}

export default function StitchPage() {
  const [data, setData] = useState<StitchData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [selected, setSelected] = useState<SelectedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadDone, setUploadDone] = useState(0);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [localJobId, setLocalJobId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/stitch/status?t=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const next = await r.json() as StitchData;
        if (!cancelled) {
          setData(next); setFetchedAt(new Date()); setError(null);
          if (next.jobId) window.localStorage.setItem("suas-stitch-job", next.jobId);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Status unavailable");
      }
    };
    load(); const timer = window.setInterval(load, POLL_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    setLocalJobId(window.localStorage.getItem("suas-stitch-job"));
    fetch("/api/stitch/auth", { cache: "no-store" })
      .then((r) => r.json())
      .then((v) => setAuthorized(Boolean(v.authorized)))
      .catch(() => setAuthorized(false));
  }, []);

  async function chooseFiles(files: FileList | null) {
    if (!files) return;
    setActionError(null);
    setActionMessage("Reading EXIF metadata…");
    const candidates = Array.from(files).filter((f) => /\.(jpe?g|tiff?|png)$/i.test(f.name));
    if (candidates.length !== files.length) setActionError("Only JPEG, TIFF, and PNG files can be stitched.");
    const inspected: SelectedImage[] = [];
    for (const file of candidates) inspected.push({ file, exif: await inspectExif(file) });
    setSelected(inspected);
    setUploadDone(0);
    setActionMessage(inspected.length ? `${inspected.length} images ready to upload` : null);
  }

  function chooseDropped(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void chooseFiles(event.dataTransfer.files);
  }

  async function startUploadJob() {
    if (selected.length < 2 || busy) return;
    setBusy(true); setUploadDone(0); setActionError(null); setActionMessage("Creating stitch job…");
    setData(null);
    try {
      const create = await fetch("/api/stitch/jobs", { method: "POST" });
      const created = await create.json();
      if (!create.ok) throw new Error(created.error || `Create failed (${create.status})`);
      const id = String(created.id);
      setLocalJobId(id);
      window.localStorage.setItem("suas-stitch-job", id);

      for (let i = 0; i < selected.length; i += 1) {
        setActionMessage(`Uploading ${i + 1} / ${selected.length}: ${selected[i].file.name}`);
        const form = new FormData();
        form.append("file", selected[i].file, selected[i].file.name);
        form.append("exif", JSON.stringify(selected[i].exif));
        const upload = await fetch(`/api/stitch/jobs/${id}/images`, { method: "POST", body: form });
        const result = await upload.json();
        if (!upload.ok) throw new Error(result.error || `Upload failed (${upload.status})`);
        setUploadDone(i + 1);
      }

      setActionMessage("Packaging originals and starting GitHub Actions…");
      const start = await fetch(`/api/stitch/jobs/${id}/start`, { method: "POST" });
      const started = await start.json();
      if (!start.ok) throw new Error(started.error || `Start failed (${start.status})`);
      setActionMessage(`Job ${id.slice(0, 8)} dispatched`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not start stitch job");
    } finally {
      setBusy(false);
    }
  }

  async function runTest() {
    if (busy) return;
    setBusy(true); setActionError(null); setActionMessage("Starting Brighton test action…");
    try {
      const r = await fetch("/api/stitch/test", { method: "POST" });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || `Test dispatch failed (${r.status})`);
      setLocalJobId(null);
      window.localStorage.removeItem("suas-stitch-job");
      setData(null);
      setActionMessage(`Test ${String(result.jobId).slice(0, 13)} dispatched`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not start test action");
    } finally {
      setBusy(false);
    }
  }

  const current = useMemo(() => stageIndex(data), [data]);
  const progress = Math.max(0, Math.min(100, Number(data?.progress || 0)));
  const logs = data?.logs || [];
  const gpsCount = selected.filter((item) => item.exif.hasGps).length;
  const exifCount = selected.filter((item) => item.exif.hasExif).length;
  const selectedBytes = selected.reduce((sum, item) => sum + item.file.size, 0);
  const activeJobId = localJobId || (data?.jobId && !data.jobId.startsWith("test-") ? data.jobId : null);
  const running = data?.status === "queued" || data?.status === "starting" || data?.status === "processing";

  return (
    <main className="min-h-full flex-1 px-4 py-8 text-white md:px-16 md:py-14">
      <section className="mx-auto w-full max-w-5xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div><span className="eyebrow">SUAS@STEM · internal infrastructure</span><h1 className="!mb-1 !mt-2 !text-left">ODM Stitch Monitor</h1><p className="!m-0 text-white/55">GitHub Actions → WebODM / ODM → orthophoto</p></div>
          <div className={`rounded-full border px-3 py-1.5 font-mono text-xs ${error ? "border-red-300/30 bg-red-300/10 text-red-200" : "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"}`}>{error ? `API ${error}` : `Live · ${POLL_MS / 1000}s refresh`}</div>
        </div>

        <div className="spec-card !mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="spec-label">Operations</p>
              <h2 className="!mb-1 !mt-1 !text-left">Upload & stitch</h2>
              <p className="!m-0 max-w-2xl text-sm text-white/55">Original files are uploaded unchanged so camera EXIF and GPS tags reach ODM intact. Metadata is inspected locally in your browser before upload.</p>
            </div>
            <div className={`rounded-full border px-3 py-1.5 font-mono text-xs ${authorized ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200" : "border-amber-300/25 bg-amber-300/10 text-amber-200"}`}>{authorized ? "Controls unlocked" : "Read-only"}</div>
          </div>

          {!authorized ? (
            <div className="mt-5 rounded-lg border border-amber-300/20 bg-amber-300/[0.06] p-4 text-sm text-amber-50">
              Uploading and starting Actions requires the existing SUAS admin session. Status, previews, and completed outputs remain visible here.
              <a href="/dev-login?redirect=/stitch" className="ml-2 font-semibold text-amber-200 underline">Unlock controls →</a>
            </div>
          ) : (
            <>
              <div className="mt-5 flex flex-wrap gap-3">
                <label className={`cursor-pointer rounded-lg border border-teal-300/30 bg-teal-300/10 px-4 py-2.5 text-sm font-semibold text-teal-100 transition hover:bg-teal-300/15 ${running || busy ? "pointer-events-none opacity-40" : ""}`}>
                  Choose images
                  <input className="hidden" type="file" accept="image/jpeg,image/tiff,image/png" multiple disabled={running || busy} onChange={(e) => void chooseFiles(e.target.files)} />
                </label>
                <button type="button" onClick={() => void startUploadJob()} disabled={selected.length < 2 || running || busy} className="rounded-lg border border-teal-300/30 bg-teal-300 px-4 py-2.5 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-35">{busy && selected.length ? "Working…" : "Start stitch"}</button>
                <button type="button" onClick={() => void runTest()} disabled={running || busy} className="rounded-lg border border-white/15 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-35">Run Brighton test</button>
              </div>

              <div
                className={`mt-4 rounded-lg border border-dashed p-5 text-center text-sm transition ${dragging ? "border-teal-200 bg-teal-300/10 text-teal-100" : "border-white/15 bg-white/[0.02] text-white/45"} ${running || busy ? "opacity-40" : ""}`}
                onDragOver={(event) => { event.preventDefault(); if (!running && !busy) setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={chooseDropped}
              >
                Drop original JPEG, TIFF, or PNG images here
              </div>

              {selected.length > 0 && (
                <div className="mt-5">
                  <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3"><p className="spec-label">Selected</p><p className="!m-0 font-mono text-lg font-semibold">{selected.length}</p></div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3"><p className="spec-label">Size</p><p className="!m-0 font-mono text-lg font-semibold">{bytes(selectedBytes)}</p></div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3"><p className="spec-label">EXIF</p><p className="!m-0 font-mono text-lg font-semibold">{exifCount}/{selected.length}</p></div>
                    <div className={`rounded-lg border p-3 ${gpsCount === selected.length ? "border-emerald-300/20 bg-emerald-300/[0.06]" : "border-amber-300/20 bg-amber-300/[0.06]"}`}><p className="spec-label">GPS</p><p className="!m-0 font-mono text-lg font-semibold">{gpsCount}/{selected.length}</p></div>
                  </div>
                  {gpsCount < selected.length && <p className="!mb-3 !mt-0 text-xs text-amber-200">{selected.length - gpsCount} image{selected.length - gpsCount === 1 ? "" : "s"} do not expose GPS EXIF. ODM can still run, but georeferencing may be incomplete or fail.</p>}
                  <div className="max-h-64 overflow-auto rounded-lg border border-white/10">
                    <table className="!m-0 min-w-[700px] text-xs">
                      <thead><tr><th className="text-left">File</th><th className="text-left">Size</th><th className="text-left">EXIF</th><th className="text-left">Camera</th><th className="text-left">Captured</th><th className="text-left">GPS</th></tr></thead>
                      <tbody>{selected.map(({ file, exif }) => <tr key={`${file.name}-${file.size}-${file.lastModified}`}><td className="max-w-64 truncate font-mono">{file.name}</td><td>{bytes(file.size)}</td><td className={exif.hasExif ? "text-emerald-200" : "text-amber-200"}>{exif.hasExif ? "Present" : "Missing"}</td><td>{[exif.make, exif.model].filter(Boolean).join(" ") || "—"}</td><td>{exif.capturedAt ? time(exif.capturedAt) : "—"}</td><td className={exif.hasGps ? "text-emerald-200" : "text-amber-200"}>{exif.hasGps ? `${exif.latitude?.toFixed(6)}, ${exif.longitude?.toFixed(6)}` : "Missing"}</td></tr>)}</tbody>
                    </table>
                  </div>
                </div>
              )}

              {(busy || uploadDone > 0) && selected.length > 0 && (
                <div className="mt-4"><div className="mb-1 flex justify-between font-mono text-xs text-white/50"><span>Upload</span><span>{uploadDone}/{selected.length}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-teal-300 transition-[width]" style={{ width: `${selected.length ? (uploadDone / selected.length) * 100 : 0}%` }} /></div></div>
              )}
            </>
          )}

          {actionMessage && <p className="!mb-0 !mt-4 font-mono text-xs text-white/55">{actionMessage}</p>}
          {actionError && <p className="!mb-0 !mt-4 rounded-lg border border-red-300/25 bg-red-300/10 px-3 py-2 text-sm text-red-100">{actionError}</p>}
        </div>

        <div className="spec-card !mb-6">
          <div className="flex items-start justify-between gap-4"><div><p className="spec-label">Overall status</p><h2 className="!mb-1 !mt-1 !text-left">{data?.stage || "Loading…"}</h2><p className="!m-0 text-white/55">{data?.currentStep || "Waiting for status data"}</p>{data?.jobId && <p className="!mb-0 !mt-2 font-mono text-[10px] text-white/35">Job {data.jobId}</p>}</div><div className="font-mono text-4xl font-bold text-teal-200">{Math.round(progress)}%</div></div>
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

        {(data?.orthophoto?.ready || activeJobId) && (
          <div className="spec-card !mb-6">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="spec-label">Image</p>
                <h2 className="!mb-0 !mt-1 !text-left">{data?.orthophoto?.ready ? "Stitched orthophoto" : "Input preview"}</h2>
              </div>
              {data?.orthophoto?.ready && (
                <Link href="/api/stitch/output/download" prefetch={false} className="rounded-lg border border-teal-300/30 bg-teal-300/10 px-4 py-2 text-sm font-semibold text-teal-100 hover:bg-teal-300/15">Download GeoTIFF</Link>
              )}
            </div>
            <div className="overflow-hidden rounded-lg border border-white/10 bg-black/30">
              {data?.orthophoto?.ready ? (
                <img key={data.updatedAt || "output"} src={`/api/stitch/output/preview?t=${encodeURIComponent(data.updatedAt || "")}`} alt="Generated stitched orthophoto preview" className="max-h-[620px] w-full object-contain" />
              ) : activeJobId ? (
                <img src={`/api/stitch/jobs/${activeJobId}/preview`} alt="First uploaded source image preview" className="max-h-[520px] w-full object-contain" />
              ) : null}
            </div>
            <p className="!mb-0 !mt-2 text-xs text-white/40">{data?.orthophoto?.ready ? "Browser preview is JPEG; download preserves the full ODM GeoTIFF." : "This source image remains visible while the stitch processes; the orthophoto replaces it when ready."}</p>
          </div>
        )}

        <div className="mb-6 grid gap-3 md:grid-cols-2">
          <div className="spec-card"><p className="spec-label">Output</p><p className="!mb-1 font-mono text-lg font-semibold">{data?.artifact?.name || (data?.orthophoto?.ready ? "Orthophoto ready" : "Waiting")}</p><p className="!m-0 text-sm text-white/55">{bytes(data?.artifact?.sizeBytes ?? data?.orthophoto?.sizeBytes)}</p><div className="mt-2 flex flex-wrap gap-3">{data?.orthophoto?.ready && <Link className="text-sm text-teal-200 underline" href="/api/stitch/output/download" prefetch={false}>Download stitch</Link>}{data?.artifact?.url && <a className="text-sm text-teal-200 underline" href={data.artifact.url} target="_blank" rel="noreferrer">Open Actions run ↗</a>}</div>{data?.artifact?.githubName && <p className="!mb-0 !mt-2 break-all font-mono text-[10px] text-white/35">Artifact {data.artifact.githubName}</p>}</div>
          <div className="spec-card"><p className="spec-label">Timing</p><div className="grid gap-1 font-mono text-xs text-white/60"><span>Queued: {time(data?.timestamps?.queuedAt)}</span><span>Started: {time(data?.timestamps?.startedAt)}</span><span>Completed: {time(data?.timestamps?.completedAt)}</span></div></div>
        </div>

        {data?.failure ? <div className="mb-6 rounded-lg border border-red-300/30 bg-red-300/10 p-4 text-red-100"><p className="spec-label !text-red-200">Failure</p><pre className="whitespace-pre-wrap text-xs">{typeof data.failure === "string" ? data.failure : JSON.stringify(data.failure, null, 2)}</pre></div> : null}

        <div className="spec-card"><p className="spec-label">Recent events</p><div className="mt-3 space-y-1 font-mono text-xs text-white/55">{logs.length ? logs.slice(-20).map((line, i) => <div key={`${i}-${line}`}>{line}</div>) : <div>No events yet.</div>}</div></div>
      </section>
    </main>
  );
}
