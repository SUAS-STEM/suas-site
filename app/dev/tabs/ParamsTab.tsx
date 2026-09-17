"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type Version = {
  name: string;
  originalName: string;
  size: number;
  uploadedAt: string;
  uploaderName: string;
  versionName: string;
  notes: string | null;
  parameterCount: number;
  cloudStatus: "uploaded" | "pending" | "failed" | "local" | "not_configured";
};
type Change = { name: string; from: string | null; to: string | null; change: "added" | "removed" | "changed" };
type StorageStatus = { cloud: { provider: string; remaining: number | null } };

function formatBytes(value: number | null) {
  if (value == null) return "—";
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GiB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

export default function ParamsTab() {
  const [versions, setVersions] = useState<Version[]>([]);
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [versionName, setVersionName] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function refresh() {
    try {
      const response = await fetch("/api/dev-params", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load parameter versions");
      setVersions(result.versions || []);
      setStorage(result.storage || null);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load parameter versions");
    }
  }

  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (!versions.length) return;
    setTo((current) => current && versions.some((version) => version.name === current) ? current : versions[0].name);
    setFrom((current) => current && versions.some((version) => version.name === current) ? current : versions[1]?.name || versions[0].name);
  }, [versions]);

  const selectedFrom = useMemo(() => versions.find((version) => version.name === from), [from, versions]);
  const selectedTo = useMemo(() => versions.find((version) => version.name === to), [to, versions]);

  async function compare() {
    if (!from || !to || from === to) return;
    setError(null);
    const response = await fetch(`/api/dev-params?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) { setError(result.error || "Could not compare versions"); return; }
    setChanges(result.comparison?.changes || []);
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !versionName.trim() || busy) return;
    setBusy(true); setError(null); setMessage("Uploading and indexing parameters…");
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      form.append("versionName", versionName);
      form.append("notes", notes);
      const response = await fetch("/api/dev-params", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Parameter upload failed");
      setFile(null); setVersionName(""); setNotes(""); setMessage("Parameter version uploaded.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Parameter upload failed");
      setMessage("");
    } finally { setBusy(false); }
  }

  async function remove(version: Version) {
    if (!window.confirm(`Delete parameter version “${version.versionName}”?`)) return;
    const response = await fetch(`/api/dev-params?name=${encodeURIComponent(version.name)}`, { method: "DELETE" });
    if (!response.ok) { const result = await response.json().catch(() => ({})); setError(result.error || "Could not delete version"); return; }
    setChanges(null); await refresh();
  }

  return (
    <section aria-labelledby="params-heading" className="space-y-5 border-t border-white/10 pt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="!mb-2 font-mono text-xs uppercase tracking-widest text-white/40">Flight configuration</p><h2 id="params-heading" className="!mb-1 !mt-0 !text-left">ArduPilot parameters</h2><p className="!m-0 text-sm text-white/55">Upload named snapshots and see exactly what changed between them.</p></div>
        {storage && <span className="text-xs text-white/40">{formatBytes(storage.cloud.remaining)} left in {storage.cloud.provider}</span>}
      </div>

      <form onSubmit={upload} className="grid gap-3 rounded border border-white/10 bg-white/[0.025] p-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="text-xs text-white/50">Version name<input value={versionName} onChange={(event) => setVersionName(event.target.value)} maxLength={120} placeholder="e.g. Pre-flight 2026-09-17" className="mt-1.5 block w-full rounded border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-teal-200/60" /></label>
        <label className="text-xs text-white/50">Parameter file<input type="file" accept=".param,.parm,.params,.txt,text/plain" onChange={(event) => { const next = event.target.files?.[0] || null; setFile(next); if (next && !versionName) setVersionName(next.name.replace(/\.(?:param|parm|params|txt)$/i, "")); }} className="mt-1 block w-full text-xs text-white/65 file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1.5 file:text-xs file:text-white" /></label>
        <button type="submit" disabled={busy || !file || !versionName.trim()} className="button-main !px-3 !py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Uploading…" : "Upload version"}</button>
        <label className="text-xs text-white/50 md:col-span-2">Notes <span className="text-white/25">(optional)</span><input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} placeholder="What changed or which aircraft this is for" className="mt-1.5 block w-full rounded border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-teal-200/60" /></label>
      </form>
      {message && <p className="!m-0 text-sm text-teal-200/80">{message}</p>}
      {error && <p role="alert" className="!m-0 text-sm text-red-200">{error}</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="min-w-0 rounded border border-white/10">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2"><h3 className="!m-0 text-sm text-white">Version history</h3><span className="font-mono text-[11px] text-white/35">{versions.length} snapshot{versions.length === 1 ? "" : "s"}</span></div>
          <div className="max-h-[28rem] overflow-y-auto">
            {versions.length === 0 ? <p className="p-4 text-sm text-white/40">No parameter versions yet.</p> : versions.map((version) => <VersionRow key={version.name} version={version} onDelete={() => void remove(version)} />)}
          </div>
        </div>

        <div className="min-w-0 rounded border border-white/10">
          <div className="border-b border-white/10 px-3 py-2"><h3 className="!m-0 text-sm text-white">Compare snapshots</h3></div>
          <div className="grid gap-2 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="text-xs text-white/45">From<select value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 block w-full rounded border border-white/15 bg-[#11151a] px-2 py-2 text-xs text-white">{versions.map((version) => <option key={version.name} value={version.name}>{version.versionName}</option>)}</select></label>
            <label className="text-xs text-white/45">To<select value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 block w-full rounded border border-white/15 bg-[#11151a] px-2 py-2 text-xs text-white">{versions.map((version) => <option key={version.name} value={version.name}>{version.versionName}</option>)}</select></label>
            <button type="button" onClick={() => void compare()} disabled={!selectedFrom || !selectedTo || from === to} className="button-main !px-3 !py-2 text-xs disabled:opacity-40">Compare</button>
          </div>
          {changes != null && <ChangeTable changes={changes} from={selectedFrom?.versionName || ""} to={selectedTo?.versionName || ""} />}
          {changes == null && <p className="px-3 pb-4 text-sm text-white/40">Choose two snapshots to see added, removed, and changed parameter values.</p>}
        </div>
      </div>
    </section>
  );
}

function VersionRow({ version, onDelete }: { version: Version; onDelete: () => void }) {
  return <div className="flex items-center gap-3 border-b border-white/10 px-3 py-2.5 last:border-b-0"><span className="material-symbols-outlined shrink-0 text-lg text-teal-200/70" aria-hidden="true">tune</span><div className="min-w-0 flex-1"><p className="truncate text-sm text-white" title={version.versionName}>{version.versionName}</p><p className="truncate text-[11px] text-white/40">{version.parameterCount} params · {formatBytes(version.size)} · {version.uploaderName} · {new Date(version.uploadedAt).toLocaleDateString()}</p>{version.notes && <p className="truncate text-[11px] text-white/30" title={version.notes}>{version.notes}</p>}</div><a href={`/api/dev-params?name=${encodeURIComponent(version.name)}`} download={version.originalName} className="text-white/40 hover:text-white" title="Download snapshot" aria-label={`Download ${version.versionName}`}><span className="material-symbols-outlined text-lg" aria-hidden="true">download</span></a><button type="button" onClick={onDelete} className="text-white/40 hover:text-red-200" title="Delete snapshot" aria-label={`Delete ${version.versionName}`}><span className="material-symbols-outlined text-lg" aria-hidden="true">delete</span></button></div>;
}

function ChangeTable({ changes, from, to }: { changes: Change[]; from: string; to: string }) {
  const counts = { added: changes.filter((change) => change.change === "added").length, removed: changes.filter((change) => change.change === "removed").length, changed: changes.filter((change) => change.change === "changed").length };
  return <div className="border-t border-white/10"><div className="flex flex-wrap gap-3 px-3 py-2 text-[11px] text-white/45"><span>{from} → {to}</span><span className="text-amber-200/80">{counts.changed} changed</span><span className="text-teal-200/80">{counts.added} added</span><span className="text-red-200/80">{counts.removed} removed</span></div>{changes.length === 0 ? <p className="px-3 pb-4 text-sm text-teal-200/80">No parameter values changed.</p> : <div className="max-h-[23rem] overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-[#11151a] text-white/40"><tr><th className="px-3 py-2 font-normal">Parameter</th><th className="px-3 py-2 font-normal">From</th><th className="px-3 py-2 font-normal">To</th></tr></thead><tbody>{changes.map((change) => <tr key={change.name} className="border-t border-white/5"><td className="px-3 py-2 font-mono text-white/75">{change.name}</td><td className="max-w-[10rem] truncate px-3 py-2 text-red-200/70" title={change.from || "—"}>{change.from || "—"}</td><td className="max-w-[10rem] truncate px-3 py-2 text-teal-200/80" title={change.to || "—"}>{change.to || "—"}</td></tr>)}</tbody></table></div>}</div>;
}
