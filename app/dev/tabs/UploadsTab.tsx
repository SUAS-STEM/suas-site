"use client";
/* eslint-disable @next/next/no-img-element -- authenticated files are served by the dev file route */

import { useEffect, useMemo, useState } from "react";

type UploadCategory = "work" | "thirdparty" | "gallery";
type UploadedFile = {
  name: string;
  originalName: string;
  size: number;
  type: string;
  modifiedAt: string;
  uploadedAt: string;
  uploaderName: string;
  cloudStatus: "local" | "pending" | "uploaded" | "failed" | "not_configured";
  cloudError: string | null;
  localAvailable: boolean;
  category: UploadCategory;
};

type StorageStatus = {
  cloud: { configured: boolean; provider: "TeraBox"; used: number | null; limit: number | null; remaining: number | null; message: string | null };
};

const CATEGORIES: Array<{ id: UploadCategory; label: string }> = [
  { id: "work", label: "Work" },
  { id: "thirdparty", label: "3rdparty" },
  { id: "gallery", label: "Gallery" },
];

function formatBytes(value: number) {
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GiB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function fileUrl(file: UploadedFile) {
  return `/api/dev-files?name=${encodeURIComponent(file.name)}&category=${file.category}`;
}

export default function UploadsTab() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [category, setCategory] = useState<UploadCategory>("work");
  const [query, setQuery] = useState("");
  const [showUploader, setShowUploader] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const visibleFiles = useMemo(
    () => files.filter((file) => file.category === category && file.originalName.toLowerCase().includes(query.trim().toLowerCase())),
    [category, files, query],
  );
  const galleryFiles = category === "gallery"
    ? visibleFiles.filter((file) => file.type.startsWith("image/"))
    : [];
  const viewerFile = viewerIndex == null ? null : galleryFiles[viewerIndex] || null;

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch("/api/dev-files", { cache: "no-store" });
      const result = await response.json();
      if (response.status === 401) {
        setFiles([]);
        setError(null);
        setMessage("Sign in on the dev site to view stored files.");
        return;
      }
      if (!response.ok) throw new Error(result.error || `Could not load files (${response.status})`);
      const payload = result as { files: UploadedFile[]; storage: StorageStatus };
      setFiles(payload.files);
      setStorage(payload.storage);
      setMessage("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load uploaded files");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => { void refresh(); }, 10_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (viewerIndex == null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewerIndex(null);
      if (event.key === "ArrowLeft") setViewerIndex((index) => index == null ? null : (index - 1 + galleryFiles.length) % galleryFiles.length);
      if (event.key === "ArrowRight") setViewerIndex((index) => index == null ? null : (index + 1) % galleryFiles.length);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [galleryFiles.length, viewerIndex]);

  async function upload(selected: FileList | File[]) {
    const chosen = Array.from(selected);
    if (!chosen.length || busy) return;
    setBusy(true);
    setError(null);
    setMessage(`Uploading ${chosen.length} file${chosen.length === 1 ? "" : "s"}…`);
    try {
      for (let index = 0; index < chosen.length; index += 1) {
        const form = new FormData();
        form.append("files", chosen[index], chosen[index].name);
        form.append("category", category);
        const response = await fetch("/api/dev-files", { method: "POST", body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `Upload failed (${response.status})`);
        setMessage(`Uploaded ${index + 1} of ${chosen.length}…`);
      }
      setShowUploader(false);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeFile(file: UploadedFile) {
    if (!window.confirm(`Delete ${file.originalName}?`)) return;
    setError(null);
    const response = await fetch(fileUrl(file), { method: "DELETE" });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.error || "Could not delete file");
      return;
    }
    await refresh();
  }

  return (
    <section aria-labelledby="files-heading" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <p className="!mb-2 font-mono text-xs uppercase tracking-widest text-white/40">Team files</p>
          <h2 id="files-heading" className="!mb-1 !mt-0 !text-left">Files</h2>
          <p className="!m-0 text-sm text-white/55">Browse shared files by category.</p>
        </div>
        <button type="button" className="button-main inline-flex items-center gap-2" onClick={() => setShowUploader((open) => !open)}>
          <span className="material-symbols-outlined text-[1.15rem]" aria-hidden="true">{showUploader ? "close" : "add"}</span>
          {showUploader ? "Close" : "Add files"}
        </button>
      </div>

      {storage && <StorageStatusView storage={storage} />}

      <nav aria-label="File categories" className="flex flex-wrap gap-6 border-b border-white/10">
        {CATEGORIES.map((item) => {
          const count = files.filter((file) => file.category === item.id).length;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => { setCategory(item.id); setViewerIndex(null); }}
              className={`border-b-2 pb-3 text-sm font-medium transition ${category === item.id ? "border-white text-white" : "border-transparent text-white/45 hover:text-white"}`}
            >
              {item.label} <span className="ml-1 font-mono text-xs text-white/35">{count}</span>
            </button>
          );
        })}
      </nav>

      <label className="block max-w-md text-sm text-white/50">
        Search files
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by filename" className="mt-2 block w-full rounded border border-white/15 bg-white/[0.03] px-3 py-2.5 text-white outline-none focus:border-teal-200/60" />
      </label>

      {showUploader && (
        <div className="border-b border-white/10 pb-6">
          <div
            className={`flex min-h-32 cursor-pointer items-center justify-center rounded border border-dashed px-6 py-8 text-center transition ${dragging ? "border-teal-200 bg-teal-200/10" : "border-white/20 hover:border-white/45"} ${busy ? "pointer-events-none opacity-60" : ""}`}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files); }}
          >
            <label htmlFor="dev-file-upload" className="cursor-pointer">
              <input id="dev-file-upload" className="sr-only" type="file" multiple disabled={busy} onChange={(event) => { void upload(event.target.files ?? []); event.currentTarget.value = ""; }} />
              <span className="material-symbols-outlined block text-2xl text-teal-200" aria-hidden="true">upload_file</span>
              <span className="mt-2 block text-sm font-medium text-white">Add to {CATEGORIES.find((item) => item.id === category)?.label}</span>
              <span className="mt-1 block text-xs text-white/45">Drop files here or click to browse · streamed directly to TeraBox</span>
            </label>
          </div>
        </div>
      )}

      {message && <p className="!m-0 text-sm text-white/45">{message}</p>}
      {error && <p role="alert" className="!m-0 text-sm text-red-200">{error}</p>}

      {loading ? (
        <p className="!m-0 text-sm text-white/45">Loading files…</p>
      ) : visibleFiles.length === 0 ? (
        <div className="py-8 text-sm text-white/45">
          {category === "gallery" ? "No images in Gallery yet." : `No files in ${CATEGORIES.find((item) => item.id === category)?.label}.`}
        </div>
      ) : category === "gallery" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {galleryFiles.map((file, index) => (
            <button key={file.name} type="button" onClick={() => setViewerIndex(index)} className="group overflow-hidden rounded border border-white/10 bg-white/[0.02] text-left transition hover:border-white/35">
              <img src={fileUrl(file)} alt={file.originalName} className="aspect-square w-full object-cover transition group-hover:scale-[1.02]" />
              <span className="block truncate px-3 py-2 text-xs text-white/70">{file.originalName}</span>
            </button>
          ))}
          {visibleFiles.filter((file) => !file.type.startsWith("image/")).map((file) => (
            <FileRow key={file.name} file={file} onDelete={removeFile} />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-white/10 border-y border-white/10">
          {visibleFiles.map((file) => <FileRow key={file.name} file={file} onDelete={removeFile} />)}
        </div>
      )}

      {viewerFile && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" aria-label="Gallery viewer" onClick={() => setViewerIndex(null)}>
          <button type="button" className="absolute right-5 top-5 text-white/70 hover:text-white" onClick={() => setViewerIndex(null)} aria-label="Close gallery viewer">
            <span className="material-symbols-outlined text-3xl" aria-hidden="true">close</span>
          </button>
          <button type="button" className="absolute left-4 text-white/70 hover:text-white sm:left-8" onClick={(event) => { event.stopPropagation(); setViewerIndex((index) => index == null ? null : (index - 1 + galleryFiles.length) % galleryFiles.length); }} aria-label="Previous image">
            <span className="material-symbols-outlined text-4xl" aria-hidden="true">chevron_left</span>
          </button>
          <figure className="flex max-h-full max-w-5xl flex-col items-center gap-3" onClick={(event) => event.stopPropagation()}>
            <img src={fileUrl(viewerFile)} alt={viewerFile.originalName} className="max-h-[78vh] max-w-full object-contain" />
            <figcaption className="text-sm text-white/65">{viewerFile.originalName}</figcaption>
          </figure>
          <button type="button" className="absolute right-4 text-white/70 hover:text-white sm:right-8" onClick={(event) => { event.stopPropagation(); setViewerIndex((index) => index == null ? null : (index + 1) % galleryFiles.length); }} aria-label="Next image">
            <span className="material-symbols-outlined text-4xl" aria-hidden="true">chevron_right</span>
          </button>
        </div>
      )}
    </section>
  );
}

function FileRow({ file, onDelete }: { file: UploadedFile; onDelete: (file: UploadedFile) => Promise<void> }) {
  const image = file.type.startsWith("image/");
  const url = fileUrl(file);
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="material-symbols-outlined shrink-0 text-xl text-white/35" aria-hidden="true">{image ? "image" : "description"}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-white" title={file.originalName}>{file.originalName}</p>
        <p className="mt-1 text-xs text-white/35">{formatBytes(file.size)} · uploaded by {file.uploaderName} · {new Date(file.uploadedAt).toLocaleDateString()}</p>
      </div>
      <span className={`shrink-0 text-[11px] ${file.cloudStatus === "uploaded" ? "text-teal-200" : file.cloudStatus === "failed" ? "text-red-200" : "text-white/35"}`} title={file.cloudError || undefined}>{file.cloudStatus === "uploaded" ? "TeraBox" : file.cloudStatus === "pending" ? "Syncing" : file.cloudStatus === "failed" ? "Sync failed" : "Local"}</span>
      {image && <a href={url} target="_blank" rel="noreferrer" className="text-xs text-teal-200 hover:text-white">View</a>}
      <a href={url} className="text-xs text-white/45 hover:text-white">Download</a>
      <button type="button" onClick={() => void onDelete(file)} className="text-xs text-white/35 hover:text-red-200">Delete</button>
    </div>
  );
}

function StorageStatusView({ storage }: { storage: StorageStatus }) {
  const cloudPercent = storage.cloud.limit && storage.cloud.used != null ? Math.min(100, storage.cloud.used / storage.cloud.limit * 100) : null;
  return (
    <div className="grid gap-3 md:grid-cols-2" aria-label="Storage status">
      <QuotaCard label="TeraBox cloud" used={storage.cloud.used} limit={storage.cloud.limit} remaining={storage.cloud.remaining} percent={cloudPercent} message={storage.cloud.message || undefined} />
    </div>
  );
}

function QuotaCard({ label, used, limit, remaining, percent, message }: { label: string; used: number | null; limit: number | null; remaining: number | null; percent: number | null; message?: string }) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.025] px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-sm"><span className="text-white/65">{label}</span><span className="font-mono text-xs text-white/45">{remaining == null ? "Unavailable" : `${formatBytes(remaining)} remaining`}</span></div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${percent != null && percent >= 90 ? "bg-red-300" : "bg-teal-200"}`} style={{ width: `${percent ?? 0}%` }} /></div>
      <p className="!m-0 mt-2 text-xs text-white/35">{used == null || limit == null ? message || "Waiting for a verified cloud connection." : `${formatBytes(used)} used of ${formatBytes(limit)}`}</p>
    </div>
  );
}
