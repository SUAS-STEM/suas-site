"use client";
/* eslint-disable @next/next/no-img-element -- authenticated files are served by the dev file route */

import { useEffect, useMemo, useRef, useState } from "react";

type UploadCategory = "work" | "thirdparty" | "gallery";
type UploadedFile = {
  name: string;
  originalName: string;
  size: number;
  type: string;
  modifiedAt: string;
  uploadedAt: string;
  uploaderName: string;
  status: "ready" | "pending" | "error";
  category: UploadCategory;
};

type StorageStatus = {
  configured: boolean;
  used: number | null;
  limit: number | null;
  remaining: number | null;
  message: string | null;
};

const CATEGORIES: Array<{ id: UploadCategory; label: string }> = [
  { id: "work", label: "Work" },
  { id: "thirdparty", label: "3rdparty" },
  { id: "gallery", label: "Gallery" },
];

function formatBytes(value: number) {
  if (value >= 1000 * 1000 * 1000) return `${(value / 1000 / 1000 / 1000).toFixed(1)} GB`;
  if (value >= 1000 * 1000) return `${(value / 1000 / 1000).toFixed(1)} MB`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)} KB`;
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
  const [propertiesFile, setPropertiesFile] = useState<UploadedFile | null>(null);
  const [renameTarget, setRenameTarget] = useState<UploadedFile | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const refreshInFlight = useRef(false);

  const visibleFiles = useMemo(
    () => files.filter((file) => file.category === category && file.originalName.toLowerCase().includes(query.trim().toLowerCase())),
    [category, files, query],
  );
  const galleryFiles = category === "gallery"
    ? visibleFiles.filter((file) => file.type.startsWith("image/"))
    : [];
  const viewerFile = viewerIndex == null ? null : galleryFiles[viewerIndex] || null;

  async function refresh(initial = false) {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    if (initial) setLoading(true);
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
      refreshInFlight.current = false;
      if (initial) setLoading(false);
    }
  }

  useEffect(() => {
    void refresh(true);
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
        const duplicates = Array.isArray(result.duplicates) ? result.duplicates as Array<{ incomingName: string }> : [];
        setMessage(duplicates.length ? `Skipped duplicate: ${duplicates[0].incomingName}` : `Uploaded ${index + 1} of ${chosen.length}…`);
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

  function startRename(file: UploadedFile) {
    setRenameTarget(file);
    setRenameValue(file.originalName);
  }

  async function renameFile() {
    if (!renameTarget || !renameValue.trim() || renameBusy) return;
    setRenameBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/dev-files", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameTarget.name, displayName: renameValue }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; file?: UploadedFile };
      if (!response.ok || !result.file) throw new Error(result.error || "Could not rename file");
      setFiles((current) => current.map((file) => file.name === result.file!.name ? result.file! : file));
      setPropertiesFile((current) => current?.name === result.file!.name ? result.file! : current);
      setRenameTarget(null);
      setMessage("Display name updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not rename file");
    } finally {
      setRenameBusy(false);
    }
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
              <span className="mt-1 block text-xs text-white/45">Drop files here or click to browse · storage is managed automatically</span>
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
        <div className="max-h-[42rem] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {galleryFiles.map((file, index) => (
            <GalleryCard key={file.name} file={file} index={index} onView={() => setViewerIndex(index)} onDelete={removeFile} onRename={startRename} onProperties={setPropertiesFile} />
          ))}
          {visibleFiles.filter((file) => !file.type.startsWith("image/")).map((file) => (
            <FileRow key={file.name} file={file} onDelete={removeFile} onRename={startRename} onProperties={setPropertiesFile} />
          ))}
          </div>
        </div>
      ) : (
        <div className="max-h-[42rem] overflow-y-auto divide-y divide-white/10 border-y border-white/10 pr-1">
          {visibleFiles.map((file) => <FileRow key={file.name} file={file} onDelete={removeFile} onRename={startRename} onProperties={setPropertiesFile} />)}
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
          <figure className="flex max-h-[90vh] max-w-5xl flex-col items-center gap-3 overflow-auto" onClick={(event) => event.stopPropagation()}>
            <img src={fileUrl(viewerFile)} alt={viewerFile.originalName} className="max-h-[78vh] max-w-full object-contain" />
            <figcaption className="text-sm text-white/65">{viewerFile.originalName}</figcaption>
          </figure>
          <button type="button" className="absolute right-4 text-white/70 hover:text-white sm:right-8" onClick={(event) => { event.stopPropagation(); setViewerIndex((index) => index == null ? null : (index + 1) % galleryFiles.length); }} aria-label="Next image">
            <span className="material-symbols-outlined text-4xl" aria-hidden="true">chevron_right</span>
          </button>
        </div>
      )}

      {propertiesFile && <PropertiesDialog file={propertiesFile} onClose={() => setPropertiesFile(null)} onRename={() => { setPropertiesFile(null); startRename(propertiesFile); }} />}
      {renameTarget && <RenameDialog value={renameValue} busy={renameBusy} onChange={setRenameValue} onClose={() => setRenameTarget(null)} onSubmit={() => void renameFile()} />}
    </section>
  );
}

function GalleryCard({ file, onView, onDelete, onRename, onProperties }: { file: UploadedFile; index: number; onView: () => void; onDelete: (file: UploadedFile) => Promise<void>; onRename: (file: UploadedFile) => void; onProperties: (file: UploadedFile) => void }) {
  return (
    <article className="overflow-hidden rounded border border-white/10 bg-white/[0.02] transition hover:border-white/30">
      <button type="button" onClick={onView} className="group block w-full text-left" aria-label={`View ${file.originalName}`}>
        <img src={fileUrl(file)} alt={file.originalName} className="aspect-square w-full object-cover transition group-hover:scale-[1.02]" />
      </button>
      <div className="flex items-center gap-2 px-2.5 py-2">
        <p className="min-w-0 flex-1 truncate text-xs text-white/75" title={file.originalName}>{file.originalName}</p>
        <button type="button" onClick={() => onProperties(file)} className="text-white/40 hover:text-white" title="File properties" aria-label={`Properties for ${file.originalName}`}><span className="material-symbols-outlined text-[1rem]" aria-hidden="true">info</span></button>
        <button type="button" onClick={() => onRename(file)} className="text-white/40 hover:text-white" title="Rename display name" aria-label={`Rename ${file.originalName}`}><span className="material-symbols-outlined text-[1rem]" aria-hidden="true">edit</span></button>
        <a href={fileUrl(file)} download className="text-white/40 hover:text-white" title="Download" aria-label={`Download ${file.originalName}`}><span className="material-symbols-outlined text-[1rem]" aria-hidden="true">download</span></a>
        <button type="button" onClick={() => void onDelete(file)} className="text-white/40 hover:text-red-200" title="Delete" aria-label={`Delete ${file.originalName}`}><span className="material-symbols-outlined text-[1rem]" aria-hidden="true">delete</span></button>
      </div>
      <p className="truncate px-2.5 pb-2 text-[11px] text-white/35">{formatBytes(file.size)} · {file.uploaderName}</p>
    </article>
  );
}

function FileRow({ file, onDelete, onRename, onProperties }: { file: UploadedFile; onDelete: (file: UploadedFile) => Promise<void>; onRename: (file: UploadedFile) => void; onProperties: (file: UploadedFile) => void }) {
  const image = file.type.startsWith("image/");
  const url = fileUrl(file);
  return (
    <div className="flex items-center gap-2.5 px-1 py-2.5 sm:gap-3">
      <span className="material-symbols-outlined shrink-0 text-xl text-white/35" aria-hidden="true">{image ? "image" : "description"}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-white" title={file.originalName}>{file.originalName}</p>
        <p className="mt-0.5 truncate text-xs text-white/35">{formatBytes(file.size)} · {file.uploaderName} · {new Date(file.uploadedAt).toLocaleDateString()}</p>
      </div>
      {file.status !== "ready" && <span className={`hidden shrink-0 rounded-full border px-2 py-0.5 text-[10px] sm:inline ${file.status === "error" ? "border-red-200/20 text-red-200" : "border-white/10 text-white/35"}`}>{file.status === "pending" ? "Processing" : "Unavailable"}</span>}
      {image && <a href={url} target="_blank" rel="noreferrer" className="text-white/40 hover:text-white" title="View" aria-label={`View ${file.originalName}`}><span className="material-symbols-outlined text-[1.05rem]" aria-hidden="true">open_in_new</span></a>}
      <button type="button" onClick={() => onProperties(file)} className="text-white/40 hover:text-white" title="File properties" aria-label={`Properties for ${file.originalName}`}><span className="material-symbols-outlined text-[1.05rem]" aria-hidden="true">info</span></button>
      <button type="button" onClick={() => onRename(file)} className="text-white/40 hover:text-white" title="Rename display name" aria-label={`Rename ${file.originalName}`}><span className="material-symbols-outlined text-[1.05rem]" aria-hidden="true">edit</span></button>
      <a href={url} download className="text-white/40 hover:text-white" title="Download" aria-label={`Download ${file.originalName}`}><span className="material-symbols-outlined text-[1.05rem]" aria-hidden="true">download</span></a>
      <button type="button" onClick={() => void onDelete(file)} className="text-white/40 hover:text-red-200" title="Delete" aria-label={`Delete ${file.originalName}`}><span className="material-symbols-outlined text-[1.05rem]" aria-hidden="true">delete</span></button>
    </div>
  );
}
function PropertiesDialog({ file, onClose, onRename }: { file: UploadedFile; onClose: () => void; onRename: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="file-properties-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-lg border border-white/15 bg-[#11151a] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div><p className="!m-0 font-mono text-[10px] uppercase tracking-widest text-white/40">File details</p><h3 id="file-properties-title" className="!mb-0 !mt-1 truncate text-lg text-white">{file.originalName}</h3></div>
          <button type="button" onClick={onClose} className="text-white/45 hover:text-white" aria-label="Close file properties"><span className="material-symbols-outlined" aria-hidden="true">close</span></button>
        </div>
        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-sm">
          <Property label="Uploaded by" value={file.uploaderName} />
          <Property label="Size" value={formatBytes(file.size)} />
          <Property label="Type" value={file.type || "Unknown"} />
          <Property label="Category" value={CATEGORIES.find((item) => item.id === file.category)?.label || file.category} />
          <Property label="Uploaded" value={new Date(file.uploadedAt).toLocaleString()} />
          <Property label="Last updated" value={new Date(file.modifiedAt).toLocaleString()} />
          <Property label="Status" value={file.status === "ready" ? "Available" : file.status === "pending" ? "Processing" : "Unavailable"} />
        </dl>
        <div className="mt-5 flex justify-end gap-2 border-t border-white/10 pt-4">
          <button type="button" onClick={onRename} className="button-main !px-3 !py-2 text-xs">Rename display name</button>
          <button type="button" onClick={onClose} className="rounded border border-white/15 px-3 py-2 text-xs text-white/65 hover:text-white">Close</button>
        </div>
      </div>
    </div>
  );
}

function Property({ label, value }: { label: string; value: string }) {
  return <><dt className="text-white/40">{label}</dt><dd className="min-w-0 truncate text-right text-white/75" title={value}>{value}</dd></>;
}

function RenameDialog({ value, busy, onChange, onClose, onSubmit }: { value: string; busy: boolean; onChange: (value: string) => void; onClose: () => void; onSubmit: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="rename-file-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="w-full max-w-md rounded-lg border border-white/15 bg-[#11151a] p-5 shadow-2xl" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <div className="flex items-start justify-between gap-4"><div><p className="!m-0 font-mono text-[10px] uppercase tracking-widest text-white/40">Edit file</p><h3 id="rename-file-title" className="!mb-0 !mt-1 text-lg text-white">Rename display name</h3></div><button type="button" onClick={onClose} className="text-white/45 hover:text-white" aria-label="Close rename dialog"><span className="material-symbols-outlined" aria-hidden="true">close</span></button></div>
        <label className="mt-5 block text-sm text-white/60">Display name<input autoFocus value={value} maxLength={160} onChange={(event) => onChange(event.target.value)} className="mt-2 block w-full rounded border border-white/15 bg-white/[0.04] px-3 py-2.5 text-white outline-none focus:border-teal-200/60" /></label>
        <p className="mt-2 text-xs text-white/35">This changes the name people see and download. The cloud object stays safely addressable.</p>
        <div className="mt-5 flex justify-end gap-2 border-t border-white/10 pt-4"><button type="button" onClick={onClose} className="rounded border border-white/15 px-3 py-2 text-xs text-white/65 hover:text-white">Cancel</button><button type="submit" disabled={busy || !value.trim()} className="button-main !px-3 !py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Saving…" : "Save name"}</button></div>
      </form>
    </div>
  );
}

function StorageStatusView({ storage }: { storage: StorageStatus }) {
  const percent = storage.limit && storage.used != null ? Math.min(100, storage.used / storage.limit * 100) : null;
  return <QuotaCard label="Storage" used={storage.used} limit={storage.limit} remaining={storage.remaining} percent={percent} message={storage.message || undefined} />;
}
function QuotaCard({ label, used, limit, remaining, percent, message }: { label: string; used: number | null; limit: number | null; remaining: number | null; percent: number | null; message?: string }) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.025] px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-sm"><span className="text-white/65">{label}</span><span className="font-mono text-xs text-white/45">{remaining == null ? "Unavailable" : `${formatBytes(remaining)} remaining`}</span></div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${percent != null && percent >= 90 ? "bg-red-300" : "bg-teal-200"}`} style={{ width: `${percent ?? 0}%` }} /></div>
      <p className="!m-0 mt-2 text-xs text-white/35">{used == null || limit == null ? message || "Storage status unavailable." : `${formatBytes(used)} used of ${formatBytes(limit)}`}</p>
    </div>
  );
}
