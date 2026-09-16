"use client";

import { useCallback, useEffect, useState } from "react";

type UploadRequest = { id: string; name: string; requestedAt: string };

export default function UploadRequestsTab() {
  const [requests, setRequests] = useState<UploadRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/upload-requests", { cache: "no-store" });
    if (response.status === 401) {
      setAdmin(false);
      setLoading(false);
      return;
    }
    if (!response.ok) throw new Error("Could not load login requests");
    const result = await response.json() as { requests: UploadRequest[] };
    setRequests(result.requests);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh().catch((cause) => { setError(cause instanceof Error ? cause.message : "Could not load login requests"); setLoading(false); }); }, [refresh]);

  async function review(id: string, action: "approve" | "deny") {
    setBusy(id); setError(null);
    try {
      const response = await fetch("/api/upload-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update request");
      setRequests((current) => current.filter((request) => request.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update request");
    } finally { setBusy(null); }
  }

  if (loading) return <p className="text-sm text-white/45">Loading login requests…</p>;
  if (!admin) return <div className="rounded-lg border border-amber-200/20 bg-amber-200/[0.05] px-4 py-5 text-sm text-amber-100/70">Admin sign-in is required to review personal dev login requests.</div>;

  return (
    <section className="space-y-5">
      <div><p className="text-xs font-mono uppercase tracking-widest text-white/30">Access control</p><h2 className="!mb-1 !mt-2 !text-left">Login requests</h2><p className="!m-0 text-sm text-white/50">Approve people before they can enter the dev site.</p></div>
      {error && <p className="rounded-lg border border-red-300/20 bg-red-300/[0.05] px-4 py-3 text-sm text-red-200">{error}</p>}
      {!requests.length ? <div className="rounded-lg border border-white/10 px-4 py-10 text-center text-sm text-white/35">No pending login requests.</div> : <div className="space-y-3">{requests.map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.025] px-4 py-4"><div><p className="font-medium">{request.name}</p><p className="mt-1 text-xs text-white/40">Requested {new Date(request.requestedAt).toLocaleString()}</p></div><div className="flex gap-2"><button type="button" disabled={busy === request.id} onClick={() => void review(request.id, "deny")} className="rounded-md border border-white/15 px-3 py-2 text-xs text-white/55 hover:border-red-300/40 hover:text-red-200 disabled:opacity-50">Deny</button><button type="button" disabled={busy === request.id} onClick={() => void review(request.id, "approve")} className="rounded-md bg-teal-300 px-3 py-2 text-xs font-bold text-black hover:bg-teal-200 disabled:opacity-50">Approve</button></div></div>)}</div>}
    </section>
  );
}
