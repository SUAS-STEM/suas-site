"use client";
/* eslint-disable @next/next/no-img-element -- previews use the authenticated upload route */

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type User = { id: string; name: string };
type UploadedFile = { name: string; originalName: string; size: number; type: string; modifiedAt: string };

function formatBytes(value: number) {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

export default function UploadPortal() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"register" | "login">("register");
  const [name, setName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadSession() {
    const response = await fetch("/api/upload-auth", { cache: "no-store" });
    const result = await response.json();
    setUser(result.user);
    setLoading(false);
    if (result.user) await refreshFiles();
  }

  async function refreshFiles() {
    const response = await fetch("/api/user-files", { cache: "no-store" });
    if (!response.ok) return;
    setFiles(await response.json() as UploadedFile[]);
  }

  // The portal only needs to load once when it mounts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void loadSession().catch(() => setLoading(false)); }, []);

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/upload-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: mode, name, passcode }) });
      const result = await response.json();
      if (result.pending) {
        setMode("login"); setPasscode(""); setMessage(result.message || result.error || "Your request is waiting for admin approval.");
        return;
      }
      if (!response.ok) throw new Error(result.error || "Could not sign in");
      const requestedPath = new URLSearchParams(window.location.search).get("redirect");
      const safeRedirect = requestedPath && requestedPath.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : null;
      if (safeRedirect) {
        window.location.assign(safeRedirect);
        return;
      }
      setUser(result.user); setPasscode(""); setMessage(mode === "register" ? "Login created. You can upload now." : "Signed in.");
      await refreshFiles();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in");
    } finally { setBusy(false); }
  }

  async function upload(selected: FileList | File[]) {
    const chosen = Array.from(selected);
    if (!chosen.length || busy) return;
    setBusy(true); setError(null); setMessage(`Uploading ${chosen.length} file${chosen.length === 1 ? "" : "s"}…`);
    try {
      for (let index = 0; index < chosen.length; index += 1) {
        const form = new FormData(); form.append("files", chosen[index], chosen[index].name);
        const response = await fetch("/api/user-files", { method: "POST", body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Upload failed");
        setMessage(`Uploaded ${index + 1} of ${chosen.length}…`);
      }
      await refreshFiles(); setMessage("Upload complete.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed"); }
    finally { setBusy(false); }
  }

  async function logout() {
    await fetch("/api/upload-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    setUser(null); setFiles([]); setMessage("Signed out.");
  }

  async function removeFile(file: UploadedFile) {
    if (!window.confirm(`Delete ${file.originalName}?`)) return;
    const response = await fetch(`/api/user-files?name=${encodeURIComponent(file.name)}`, { method: "DELETE" });
    if (response.ok) await refreshFiles();
  }

  if (loading) return <main className="flex min-h-screen items-center justify-center px-4 text-sm text-white/50">Loading upload portal…</main>;

  return (
    <main className="min-h-screen px-4 py-10 text-white md:px-8 md:py-16">
      <section className="mx-auto w-full max-w-3xl">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div><span className="eyebrow">SUAS@STEM · file intake</span><h1 className="!mb-2 !mt-3 !text-left">Upload files</h1><p className="!m-0 max-w-xl text-white/55">Send photos, documents, and project files to the team’s dev server.</p></div>
          <Link href="/" className="pt-1 text-sm text-white/45 hover:text-white">Home ↗</Link>
        </div>

        {!user ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-5 md:p-7">
            <div className="mb-5 flex gap-1 border-b border-white/10">
              <button type="button" onClick={() => setMode("register")} className={`border-b-2 px-3 pb-3 text-sm font-semibold ${mode === "register" ? "border-teal-200 text-white" : "border-transparent text-white/40"}`}>Request a login</button>
              <button type="button" onClick={() => setMode("login")} className={`border-b-2 px-3 pb-3 text-sm font-semibold ${mode === "login" ? "border-teal-200 text-white" : "border-transparent text-white/40"}`}>Sign in</button>
            </div>
            <h2 className="!mb-2 !mt-1 !text-left">{mode === "register" ? "Request dev access" : "Welcome back"}</h2>
            <p className="mb-5 max-w-lg text-sm text-white/50">{mode === "register" ? "Choose a name and a passcode you will remember. An admin must approve your request before you can enter the dev site." : "Use the name and passcode you requested for the dev site."}</p>
            <form onSubmit={(event) => void submitAuth(event)} className="max-w-md space-y-4">
              <label className="block text-sm text-white/60">Your name<input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={80} autoComplete="name" className="mt-1.5 block w-full rounded-lg border border-white/15 bg-black/25 px-3.5 py-3 text-white outline-none transition focus:border-teal-200/60" placeholder="Alex Chen" /></label>
              <label className="block text-sm text-white/60">{mode === "register" ? "Create a passcode" : "Passcode"}<input type="password" value={passcode} onChange={(event) => setPasscode(event.target.value)} required minLength={6} maxLength={128} autoComplete={mode === "register" ? "new-password" : "current-password"} className="mt-1.5 block w-full rounded-lg border border-white/15 bg-black/25 px-3.5 py-3 text-white outline-none transition focus:border-teal-200/60" placeholder="At least 6 characters" /></label>
              {error && <p className="!m-0 text-sm text-red-300">{error}</p>}
              <button disabled={busy} className="rounded-lg border border-teal-300/30 bg-teal-300 px-4 py-3 text-sm font-bold text-black transition hover:bg-teal-200 disabled:opacity-50">{busy ? "Working…" : mode === "register" ? "Request access" : "Sign in"}</button>
            </form>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal-200/20 bg-teal-200/[0.06] px-4 py-3"><p className="!m-0 text-sm text-teal-50">Signed in as <strong>{user.name}</strong></p><button type="button" onClick={() => void logout()} className="text-sm text-white/50 underline hover:text-white">Sign out</button></div>
            <label htmlFor="user-file-upload" className={`flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center transition ${dragging ? "border-teal-200 bg-teal-200/10" : "border-white/20 bg-white/[0.025] hover:border-white/40 hover:bg-white/[0.05]"} ${busy ? "pointer-events-none opacity-60" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files); }}>
              <input id="user-file-upload" className="sr-only" type="file" multiple disabled={busy} onChange={(event) => { void upload(event.target.files ?? []); event.currentTarget.value = ""; }} />
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-teal-200/30 bg-teal-200/10 text-2xl text-teal-100">↑</span><span className="font-semibold">Drop files here</span><span className="mt-1 text-sm text-white/45">or click to browse · 100 MB per file</span>
            </label>
            {(message || error) && <div className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-red-300/25 bg-red-300/[0.06] text-red-200" : "border-white/10 bg-white/[0.025] text-white/55"}`}>{error || message}</div>}
            <div><p className="mb-3 text-xs font-mono uppercase tracking-widest text-white/30">Your uploads</p>{files.length ? <div className="grid gap-3 sm:grid-cols-2">{files.map((file) => { const url = `/api/user-files?name=${encodeURIComponent(file.name)}`; return <div key={file.name} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.025]">{file.type.startsWith("image/") ? <img src={url} alt="" className="h-36 w-full bg-black/30 object-cover" /> : <div className="flex h-36 items-center justify-center bg-black/20 text-4xl text-white/20">▧</div>}<div className="p-3"><p className="truncate text-sm font-medium" title={file.originalName}>{file.originalName}</p><p className="mt-1 font-mono text-[11px] text-white/35">{formatBytes(file.size)} · {new Date(file.modifiedAt).toLocaleDateString()}</p><div className="mt-3 flex gap-3 text-xs"><a href={url} className="text-teal-200 underline">Download</a><button type="button" onClick={() => void removeFile(file)} className="text-white/40 underline hover:text-red-200">Delete</button></div></div></div>; })}</div> : <div className="rounded-lg border border-white/10 px-4 py-8 text-center text-sm text-white/35">Your uploaded files will appear here.</div>}</div>
          </div>
        )}
        <p className="mt-8 text-center text-xs text-white/30">Need the team dashboard? <a href="/dev-login" className="underline hover:text-white/60">Admin sign in</a></p>
      </section>
    </main>
  );
}
