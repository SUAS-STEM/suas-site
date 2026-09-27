"use client";
/* eslint-disable @next/next/no-img-element -- authenticated files are served by the dev file route */

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

type UploadCategory = "work" | "media" | "thirdparty" | "gallery";
type UploadedFile = {
  name: string;
  originalName: string;
  size: number;
  type: string;
  modifiedAt: string;
  uploadedAt: string;
  uploaderName: string;
  sha256: string | null;
  status: "ready" | "pending" | "error";
  category: UploadCategory;
  folderPath: string;
};
type Folder = { name: string; path: string };

type StorageStatus = {
  configured: boolean;
  used: number | null;
  limit: number | null;
  remaining: number | null;
  message: string | null;
};

const CATEGORIES: Array<{ id: UploadCategory; label: string }> = [
  { id: "work", label: "Work" },
  { id: "media", label: "Pictures and Videos" },
  { id: "thirdparty", label: "Third-party" },
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

function thumbnailUrl(file: UploadedFile) {
  const version = file.sha256 || file.uploadedAt;
  return `/api/dev-files/thumbnail?name=${encodeURIComponent(file.name)}&category=${file.category}&v=${encodeURIComponent(version)}`;
}

export default function UploadsTab() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [folderLists, setFolderLists] = useState<Record<string, Folder[]>>({});
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [category, setCategory] = useState<UploadCategory>("work");
  const [folderPath, setFolderPath] = useState("");
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [showFolderCreator, setShowFolderCreator] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderBusy, setFolderBusy] = useState(false);
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
  const folderLocation = JSON.stringify([category, folderPath]);
  const folders = folderLists[folderLocation] || [];
  const foldersLoaded = Object.prototype.hasOwnProperty.call(folderLists, folderLocation);

  const visibleFiles = useMemo(
    () => files.filter((file) => file.category === category && file.folderPath === folderPath && file.originalName.toLowerCase().includes(query.trim().toLowerCase())),
    [category, files, folderPath, query],
  );
  const galleryFiles = category === "gallery"
    ? visibleFiles.filter((file) => file.type.startsWith("image/"))
    : [];
  const previewFiles = category === "media"
    ? visibleFiles.filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"))
    : galleryFiles;
  const viewerFile = viewerIndex == null ? null : previewFiles[viewerIndex] || null;
  const prefetchedViewerImages = useRef<HTMLImageElement[]>([]);

  useEffect(() => {
    prefetchedViewerImages.current = [];
    if (viewerIndex == null || !viewerFile || !viewerFile.type.startsWith("image/") || previewFiles.length < 2) return;
    const timer = window.setTimeout(() => {
      const neighborIndices = [
        (viewerIndex + 1) % previewFiles.length,
        (viewerIndex - 1 + previewFiles.length) % previewFiles.length,
      ];
      prefetchedViewerImages.current = neighborIndices
        .map((index) => previewFiles[index])
        .filter((file) => file?.type.startsWith("image/"))
        .map((file) => {
          const image = new window.Image();
          image.decoding = "async";
          image.fetchPriority = "low";
          image.src = fileUrl(file);
          return image;
        });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [previewFiles, viewerFile, viewerIndex]);

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
    let active = true;
    const loadRootFolders = async () => {
      await Promise.all(CATEGORIES.map(async ({ id }) => {
        try {
          const params = new URLSearchParams({ category: id, parentPath: "" });
          const response = await fetch(`/api/dev-folders?${params}`, { cache: "no-store" });
          const result = await response.json().catch(() => ({})) as { folders?: Folder[] };
          if (response.ok && active) {
            setFolderLists((current) => ({ ...current, [JSON.stringify([id, ""])]: result.folders || [] }));
          }
        } catch {
          // The active category request below can report a useful error.
        }
      }));
      if (active) setLoadingFolders(false);
    };
    void loadRootFolders();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const location = JSON.stringify([category, folderPath]);
    const params = new URLSearchParams({ category, parentPath: folderPath });
    const loadFolders = async () => {
      try {
        const response = await fetch(`/api/dev-folders?${params}`, { cache: "no-store" });
        const result = await response.json().catch(() => ({})) as { folders?: Folder[]; error?: string };
        if (!response.ok) throw new Error(result.error || `Could not load folders (${response.status})`);
        if (active) {
          setFolderLists((current) => ({ ...current, [location]: result.folders || [] }));
          setError(null);
        }
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Could not load folders");
          setFolderLists((current) => Object.prototype.hasOwnProperty.call(current, location)
            ? current
            : { ...current, [location]: [] });
        }
      }
    };
    void loadFolders();
    const timer = window.setInterval(() => { void loadFolders(); }, 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [category, folderPath]);

  useEffect(() => {
    const timer = window.setInterval(() => { void refresh(); }, 10_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (viewerIndex == null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewerIndex(null);
      if (event.key === "ArrowLeft") setViewerIndex((index) => index == null ? null : (index - 1 + previewFiles.length) % previewFiles.length);
      if (event.key === "ArrowRight") setViewerIndex((index) => index == null ? null : (index + 1) % previewFiles.length);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewFiles.length, viewerIndex]);

  async function upload(selected: FileList | File[]) {
    const chosen = Array.from(selected);
    if (!chosen.length || busy) return;
    if (chosen.length > 20) {
      setError("You can upload at most 20 files at a time.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(`Uploading ${chosen.length} file${chosen.length === 1 ? "" : "s"}…`);
    try {
      for (let index = 0; index < chosen.length; index += 1) {
        const file = chosen[index];
        const create = await fetch("/api/dev-files/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category, folderPath, name: file.name, size: file.size }),
        });
        const created = await create.json().catch(() => ({})) as { id?: string; chunkSize?: number; error?: string };
        if (!create.ok || !created.id || !created.chunkSize) throw new Error(created.error || `Could not start ${file.name} (${create.status})`);

        let offset = 0;
        while (offset < file.size) {
          const chunk = file.slice(offset, Math.min(file.size, offset + created.chunkSize));
          const data = await chunk.arrayBuffer();
          let saved = false;
          for (let attempt = 0; attempt < 5 && !saved; attempt += 1) {
            try {
              const response = await fetch(`/api/dev-files/chunk?id=${encodeURIComponent(created.id)}&offset=${offset}`, {
                method: "PUT",
                headers: { "Content-Type": "application/octet-stream" },
                body: data,
              });
              const result = await response.json().catch(() => ({})) as { receivedBytes?: number; error?: string };
              if (response.ok && typeof result.receivedBytes === "number") {
                offset = result.receivedBytes;
                saved = true;
              } else {
                const statusResponse = await fetch(`/api/dev-files/upload?id=${encodeURIComponent(created.id)}`, { cache: "no-store" });
                const status = await statusResponse.json().catch(() => ({})) as { receivedBytes?: number; error?: string };
                if (statusResponse.ok && typeof status.receivedBytes === "number" && status.receivedBytes > offset) {
                  offset = status.receivedBytes;
                  saved = true;
                } else if (response.status !== 409 && response.status < 500) {
                  throw new Error(result.error || `Upload failed (${response.status})`);
                } else if (attempt === 4) {
                  throw new Error(result.error || status.error || "The connection kept failing while uploading this file.");
                }
              }
            } catch (cause) {
              if (attempt === 4) throw cause;
              await new Promise((resolve) => window.setTimeout(resolve, Math.min(8000, 500 * 2 ** attempt)));
              const statusResponse = await fetch(`/api/dev-files/upload?id=${encodeURIComponent(created.id)}`, { cache: "no-store" }).catch(() => null);
              if (statusResponse?.ok) {
                const status = await statusResponse.json().catch(() => ({})) as { receivedBytes?: number };
                if (typeof status.receivedBytes === "number" && status.receivedBytes > offset) {
                  offset = status.receivedBytes;
                  saved = true;
                }
              }
            }
          }
          if (!saved && offset < file.size) throw new Error(`Could not continue uploading ${file.name}.`);
          const percent = file.size ? Math.min(100, Math.floor(offset / file.size * 100)) : 100;
          setMessage(`Uploading ${index + 1}/${chosen.length} · ${file.name} · ${percent}%`);
        }

        let completion: Response | null = null;
        let completed: { ok?: boolean; file?: UploadedFile; duplicate?: boolean; error?: string } = {};
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            completion = await fetch("/api/dev-files/upload", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "complete", id: created.id }),
            });
            completed = await completion.json().catch(() => ({}));
            if (completion.ok) break;
            if (completion.status < 500) throw new Error(completed.error || `Could not finalize ${file.name} (${completion.status})`);
          } catch (cause) {
            if (attempt === 2) throw cause;
          }
          if (attempt < 2) {
            await new Promise((resolve) => window.setTimeout(resolve, 1000 * (attempt + 1)));
            const statusResponse = await fetch(`/api/dev-files/upload?id=${encodeURIComponent(created.id)}`, { cache: "no-store" }).catch(() => null);
            if (statusResponse?.ok) {
              const status = await statusResponse.json().catch(() => ({})) as { complete?: boolean; file?: UploadedFile; duplicate?: boolean };
              if (status.complete && status.file) {
                completed = { ok: true, file: status.file, duplicate: status.duplicate };
                completion = new Response(null, { status: 200 });
                break;
              }
            }
          }
        }
        if (!completion?.ok || !completed.file) throw new Error(completed.error || `Could not finish uploading ${file.name}.`);
        setMessage(completed.duplicate ? `Skipped duplicate: ${file.name}` : `Uploaded ${index + 1} of ${chosen.length}…`);
      }
      setShowUploader(false);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (folderBusy || !folderName.trim()) return;
    setFolderBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/dev-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, parentPath: folderPath, name: folderName.trim() }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; folder?: Folder };
      if (!response.ok || !result.folder) throw new Error(result.error || "Could not create folder");
      setFolderLists((current) => ({
        ...current,
        [folderLocation]: [...(current[folderLocation] || []), result.folder!].sort((a, b) => a.name.localeCompare(b.name)),
      }));
      setFolderName("");
      setShowFolderCreator(false);
      setMessage(`Created ${result.folder.name}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create folder");
    } finally {
      setFolderBusy(false);
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
        <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded border border-white/15 px-3 py-2 text-sm text-white/70 transition hover:border-white/35 hover:text-white" onClick={() => setShowFolderCreator((open) => !open)}>
          <span className="material-symbols-outlined mr-1 align-middle text-[1.1rem]" aria-hidden="true">create_new_folder</span>
          {showFolderCreator ? "Close" : "New folder"}
        </button>
        <button type="button" className="button-main inline-flex items-center gap-2" onClick={() => setShowUploader((open) => !open)}>
          <span className="material-symbols-outlined text-[1.15rem]" aria-hidden="true">{showUploader ? "close" : "add"}</span>
          {showUploader ? "Close" : "Add files"}
        </button>
        </div>
      </div>

      {storage && <StorageStatusView storage={storage} />}

      <nav aria-label="File categories" className="flex flex-wrap gap-5 border-b border-white/10 sm:gap-6">
        {CATEGORIES.map((item) => {
          const count = files.filter((file) => file.category === item.id).length;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => { setCategory(item.id); setFolderPath(""); setQuery(""); setViewerIndex(null); }}
              className={`border-b-2 pb-3 text-sm font-medium transition ${category === item.id ? "border-white text-white" : "border-transparent text-white/45 hover:text-white"}`}
              aria-current={category === item.id ? "page" : undefined}
            >
              {item.label} <span className="ml-1 font-mono text-xs text-white/35">{count}</span>
            </button>
          );
        })}
      </nav>

      <nav aria-label="Folder path" className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" onClick={() => { setFolderPath(""); setQuery(""); }} className={`${folderPath ? "text-white/55 hover:text-white" : "font-medium text-white"}`} aria-current={!folderPath ? "page" : undefined}>
          {CATEGORIES.find((item) => item.id === category)?.label}
        </button>
        {folderPath.split("/").filter(Boolean).map((part, index, parts) => {
          const path = parts.slice(0, index + 1).join("/");
          return <span key={path} className="inline-flex items-center gap-2"><span className="text-white/25" aria-hidden="true">/</span><button type="button" onClick={() => { setFolderPath(path); setQuery(""); }} className={index === parts.length - 1 ? "font-medium text-white" : "text-white/55 hover:text-white"} aria-current={index === parts.length - 1 ? "page" : undefined}>{part}</button></span>;
        })}
      </nav>

      {showFolderCreator && (
        <form onSubmit={(event) => void createFolder(event)} className="flex flex-wrap items-end gap-3 rounded border border-white/10 bg-white/[0.025] p-4">
          <label htmlFor="dev-new-folder" className="min-w-56 flex-1 text-sm text-white/60">New folder name
            <input id="dev-new-folder" autoFocus maxLength={80} value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="Folder name" className="mt-2 block w-full rounded border border-white/15 bg-white/[0.04] px-3 py-2.5 text-white outline-none focus:border-teal-200/60" />
          </label>
          <button type="submit" disabled={folderBusy || !folderName.trim()} className="button-main !px-4 !py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50">{folderBusy ? "Creating…" : "Create folder"}</button>
        </form>
      )}

      <label className="block max-w-md text-sm text-white/50">
        Search files in this folder
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
              <span className="mt-2 block text-sm font-medium text-white">Add to {CATEGORIES.find((item) => item.id === category)?.label}{folderPath ? ` / ${folderPath}` : ""}</span>
              <span className="mt-1 block text-xs text-white/45">Large files upload in retryable chunks · storage is managed automatically</span>
            </label>
          </div>
        </div>
      )}

      {message && <p className="!m-0 text-sm text-white/45">{message}</p>}
      {error && <p role="alert" className="!m-0 text-sm text-red-200">{error}</p>}

      {foldersLoaded && folders.length > 0 && !query.trim() && (
        <div aria-label="Folders" className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((folder) => <FolderCard key={folder.path} folder={folder} onOpen={() => setFolderPath(folder.path)} />)}
        </div>
      )}

      {loading || loadingFolders || (!foldersLoaded && visibleFiles.length === 0 && !query.trim()) ? (
        <p className="!m-0 text-sm text-white/45">Loading files…</p>
      ) : visibleFiles.length === 0 && (!folders.length || !!query.trim()) ? (
        <div className="py-8 text-sm text-white/45">
          {query.trim() ? "No matching files in this folder." : category === "gallery" ? "No images in Gallery yet." : `No files in ${CATEGORIES.find((item) => item.id === category)?.label}${folderPath ? ` / ${folderPath}` : ""}.`}
        </div>
      ) : visibleFiles.length === 0 ? null : category === "media" ? (
        <div className="max-h-[42rem] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {previewFiles.map((file, index) => (
              <MediaCard key={file.name} file={file} eager={index < 8} onView={() => setViewerIndex(index)} onDelete={removeFile} onRename={startRename} onProperties={setPropertiesFile} />
            ))}
            {visibleFiles.filter((file) => !file.type.startsWith("image/") && !file.type.startsWith("video/")).map((file) => (
              <FileRow key={file.name} file={file} onDelete={removeFile} onRename={startRename} onProperties={setPropertiesFile} />
            ))}
          </div>
        </div>
      ) : category === "gallery" ? (
        <div className="max-h-[42rem] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {galleryFiles.map((file, index) => (
            <GalleryCard key={file.name} file={file} eager={index < 8} onView={() => setViewerIndex(index)} onDelete={removeFile} onRename={startRename} onProperties={setPropertiesFile} />
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
          <button type="button" className="absolute left-4 text-white/70 hover:text-white sm:left-8" onClick={(event) => { event.stopPropagation(); setViewerIndex((index) => index == null ? null : (index - 1 + previewFiles.length) % previewFiles.length); }} aria-label="Previous file">
            <span className="material-symbols-outlined text-4xl" aria-hidden="true">chevron_left</span>
          </button>
          <figure className="flex max-h-[90vh] max-w-5xl flex-col items-center gap-3 overflow-auto" onClick={(event) => event.stopPropagation()}>
            {viewerFile.type.startsWith("video/") ? (
              <video src={fileUrl(viewerFile)} controls autoPlay playsInline className="max-h-[78vh] max-w-full" aria-label={viewerFile.originalName} />
            ) : (
              <img src={fileUrl(viewerFile)} alt={viewerFile.originalName} loading="eager" decoding="async" fetchPriority="high" className="max-h-[78vh] max-w-full object-contain" />
            )}
            <figcaption className="text-sm text-white/65">{viewerFile.originalName}</figcaption>
          </figure>
          <button type="button" className="absolute right-4 text-white/70 hover:text-white sm:right-8" onClick={(event) => { event.stopPropagation(); setViewerIndex((index) => index == null ? null : (index + 1) % previewFiles.length); }} aria-label="Next file">
            <span className="material-symbols-outlined text-4xl" aria-hidden="true">chevron_right</span>
          </button>
        </div>
      )}

      {propertiesFile && <PropertiesDialog file={propertiesFile} onClose={() => setPropertiesFile(null)} onRename={() => { setPropertiesFile(null); startRename(propertiesFile); }} />}
      {renameTarget && <RenameDialog value={renameValue} busy={renameBusy} onChange={setRenameValue} onClose={() => setRenameTarget(null)} onSubmit={() => void renameFile()} />}
    </section>
  );
}

function GalleryCard({ file, eager = false, onView, onDelete, onRename, onProperties }: { file: UploadedFile; eager?: boolean; onView: () => void; onDelete: (file: UploadedFile) => Promise<void>; onRename: (file: UploadedFile) => void; onProperties: (file: UploadedFile) => void }) {
  const [hasThumbnail, setHasThumbnail] = useState(true);
  return (
    <article className="overflow-hidden rounded border border-white/10 bg-white/[0.02] transition hover:border-white/30" style={{ contentVisibility: "auto", containIntrinsicSize: "320px 390px" }}>
      <button type="button" onClick={onView} className="group block w-full text-left" aria-label={`View ${file.originalName}`}>
        {hasThumbnail ? <img src={thumbnailUrl(file)} alt={file.originalName} loading={eager ? "eager" : "lazy"} decoding="async" fetchPriority={eager ? "high" : "low"} onError={() => setHasThumbnail(false)} className="aspect-square w-full object-cover transition group-hover:scale-[1.02]" /> : <span className="material-symbols-outlined flex aspect-square w-full items-center justify-center bg-white/[0.035] text-4xl text-white/30" aria-hidden="true">image</span>}
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

function MediaCard({ file, eager = false, onView, onDelete, onRename, onProperties }: { file: UploadedFile; eager?: boolean; onView: () => void; onDelete: (file: UploadedFile) => Promise<void>; onRename: (file: UploadedFile) => void; onProperties: (file: UploadedFile) => void }) {
  const [hasThumbnail, setHasThumbnail] = useState(true);
  const video = file.type.startsWith("video/");
  return (
    <article className="overflow-hidden rounded border border-white/10 bg-white/[0.02] transition hover:border-white/30" style={{ contentVisibility: "auto", containIntrinsicSize: "320px 390px" }}>
      <button type="button" onClick={onView} className="group relative block w-full text-left" aria-label={`${video ? "Play" : "View"} ${file.originalName}`}>
        {hasThumbnail ? <img src={thumbnailUrl(file)} alt={file.originalName} loading={eager ? "eager" : "lazy"} decoding="async" fetchPriority={eager ? "high" : "low"} onError={() => setHasThumbnail(false)} className="aspect-square w-full object-cover transition group-hover:scale-[1.02]" /> : <span className="material-symbols-outlined flex aspect-square w-full items-center justify-center bg-white/[0.035] text-4xl text-white/30" aria-hidden="true">{video ? "movie" : "image"}</span>}
        {video && <span className="material-symbols-outlined absolute inset-0 flex items-center justify-center text-5xl text-white drop-shadow-lg" aria-hidden="true">play_circle</span>}
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

function FolderCard({ folder, onOpen }: { folder: Folder; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-3 rounded border border-white/10 bg-white/[0.02] px-3 py-3 text-left transition hover:border-white/30 hover:bg-white/[0.05]" aria-label={`Open folder ${folder.name}`}>
      <span className="material-symbols-outlined shrink-0 text-2xl text-teal-200/80" aria-hidden="true">folder</span>
      <span className="min-w-0 flex-1 truncate text-sm text-white/80" title={folder.name}>{folder.name}</span>
      <span className="material-symbols-outlined text-lg text-white/30" aria-hidden="true">chevron_right</span>
    </button>
  );
}

function FileRow({ file, onDelete, onRename, onProperties }: { file: UploadedFile; onDelete: (file: UploadedFile) => Promise<void>; onRename: (file: UploadedFile) => void; onProperties: (file: UploadedFile) => void }) {
  const image = file.type.startsWith("image/");
  const video = file.type.startsWith("video/");
  const url = fileUrl(file);
  return (
    <div className="flex items-center gap-2.5 px-1 py-2.5 sm:gap-3">
      <span className="material-symbols-outlined shrink-0 text-xl text-white/35" aria-hidden="true">{image ? "image" : video ? "movie" : "description"}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-white" title={file.originalName}>{file.originalName}</p>
        <p className="mt-0.5 truncate text-xs text-white/35">{formatBytes(file.size)} · {file.uploaderName} · {new Date(file.uploadedAt).toLocaleDateString()}</p>
      </div>
      {file.status !== "ready" && <span className={`hidden shrink-0 rounded-full border px-2 py-0.5 text-[10px] sm:inline ${file.status === "error" ? "border-red-200/20 text-red-200" : "border-white/10 text-white/35"}`}>{file.status === "pending" ? "Processing" : "Unavailable"}</span>}
      {(image || video) && <a href={url} target="_blank" rel="noreferrer" className="text-white/40 hover:text-white" title={video ? "Play" : "View"} aria-label={`${video ? "Play" : "View"} ${file.originalName}`}><span className="material-symbols-outlined text-[1.05rem]" aria-hidden="true">{video ? "play_circle" : "open_in_new"}</span></a>}
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
          <Property label="Folder" value={file.folderPath || "Root"} />
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
  const percent = storage.limit && storage.remaining != null ? Math.min(100, Math.max(0, 1 - storage.remaining / storage.limit) * 100) : null;
  return <QuotaCard label="Storage" limit={storage.limit} remaining={storage.remaining} percent={percent} message={storage.message || undefined} />;
}
function QuotaCard({ label, limit, remaining, percent, message }: { label: string; limit: number | null; remaining: number | null; percent: number | null; message?: string }) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.025] px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-sm"><span className="text-white/65">{label}</span><span className="font-mono text-xs text-white/45">{remaining == null ? "Unavailable" : `${formatBytes(remaining)} of ${limit == null ? "—" : formatBytes(limit)} left`}</span></div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${percent != null && percent >= 90 ? "bg-red-300" : "bg-teal-200"}`} style={{ width: `${percent ?? 0}%` }} /></div>
      {remaining == null && <p className="!m-0 mt-2 text-xs text-white/35">{message || "Storage status unavailable."}</p>}
    </div>
  );
}
