"use client";
/* eslint-disable @next/next/no-img-element -- uploaded image previews are served by the authenticated file route */

import { useEffect, useState } from "react";

type UploadedFile = {
  name: string;
  originalName: string;
  size: number;
  type: string;
  modifiedAt: string;
};

function formatBytes(value: number) {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

export default function UploadsTab() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading uploaded files…");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const response = await fetch("/api/dev-files", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Could not load files (${response.status})`);
      setFiles(result as UploadedFile[]);
      setMessage(result.length ? `${result.length} file${result.length === 1 ? "" : "s"} stored` : "No files uploaded yet");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load uploaded files");
      setMessage("");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

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
        const response = await fetch("/api/dev-files", { method: "POST", body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `Upload failed (${response.status})`);
        setMessage(`Uploaded ${index + 1} of ${chosen.length}…`);
      }
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed");
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  async function removeFile(file: UploadedFile) {
    if (!window.confirm(`Delete ${file.originalName}?`)) return;
    setError(null);
    const response = await fetch(`/api/dev-files?name=${encodeURIComponent(file.name)}`, { method: "DELETE" });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.error || "Could not delete file");
      return;
    }
    await refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-mono text-teal-200/70 uppercase tracking-widest mb-2">File intake</p>
        <h2 className="!mb-1 !mt-1 !text-left">Upload files</h2>
        <p className="!m-0 max-w-2xl text-sm text-white/55">
          Add photos, documents, datasets, or other project files to the dev server. Files are private to this internal dashboard and are limited to 100 MB each.
        </p>
      </div>

      <label
        htmlFor="dev-file-upload"
        className={`flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center transition ${dragging ? "border-teal-200 bg-teal-200/10" : "border-white/20 bg-white/[0.025] hover:border-white/40 hover:bg-white/[0.05]"} ${busy ? "pointer-events-none opacity-60" : ""}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files); }}
      >
        <input id="dev-file-upload" className="sr-only" type="file" multiple disabled={busy} onChange={(event) => { void upload(event.target.files ?? []); event.currentTarget.value = ""; }} />
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-teal-200/30 bg-teal-200/10 text-2xl text-teal-100">↑</span>
        <span className="font-semibold text-white">Drop files here</span>
        <span className="mt-1 text-sm text-white/45">or click to browse · up to 20 files per batch</span>
      </label>

      {(message || error) && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-red-300/25 bg-red-300/[0.06] text-red-200" : "border-white/10 bg-white/[0.025] text-white/55"}`}>
          {error || message}
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-mono text-white/30 uppercase tracking-widest">Stored files</p>
          {files.length > 0 && <span className="font-mono text-xs text-white/35">{files.length} total</span>}
        </div>
        {files.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-white/35">Uploaded files will appear here.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {files.map((file) => {
              const downloadUrl = `/api/dev-files?name=${encodeURIComponent(file.name)}`;
              const image = file.type.startsWith("image/");
              return (
                <div key={file.name} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.025]">
                  {image ? <img src={downloadUrl} alt="" className="h-36 w-full bg-black/30 object-cover" /> : <div className="flex h-36 items-center justify-center bg-black/20 text-4xl text-white/20">▧</div>}
                  <div className="p-3">
                    <p className="truncate text-sm font-medium text-white" title={file.originalName}>{file.originalName}</p>
                    <p className="mt-1 font-mono text-[11px] text-white/35">{formatBytes(file.size)} · {new Date(file.modifiedAt).toLocaleDateString()}</p>
                    <div className="mt-3 flex items-center gap-3 text-xs">
                      <a href={downloadUrl} className="text-teal-200 underline underline-offset-2 hover:text-teal-100">Download</a>
                      <button type="button" onClick={() => void removeFile(file)} className="text-white/40 underline underline-offset-2 hover:text-red-200">Delete</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
