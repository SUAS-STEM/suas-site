"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

const DEVICE_STORAGE_KEY = "suas-dev-device-id";

function getDeviceId() {
  try {
    const saved = window.localStorage.getItem(DEVICE_STORAGE_KEY);
    if (saved) return saved;
    const generated = window.crypto.randomUUID();
    window.localStorage.setItem(DEVICE_STORAGE_KEY, generated);
    return generated;
  } catch {
    return window.crypto.randomUUID();
  }
}

function safeRedirect(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function LoginPageContent() {
  const params = useSearchParams();
  const redirect = safeRedirect(params.get("redirect"));
  const nameRef = useRef<HTMLInputElement>(null);
  const [deviceId, setDeviceId] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [phrase, setPhrase] = useState("");
  const [requestError, setRequestError] = useState("");

  useEffect(() => {
    // Device identity is browser-local and must be initialized after hydration.
    setDeviceId(getDeviceId());
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!deviceId) return;
    let active = true;
    const check = async () => {
      const response = await fetch(`/api/dev-access?deviceId=${encodeURIComponent(deviceId)}`, { cache: "no-store" });
      if (!active || !response.ok) return;
      const result = await response.json() as { status: string; phrase?: string | null };
      if (result.phrase) setPhrase(result.phrase);
      if (result.status === "approved") window.location.assign(redirect);
      if (result.status === "pending") setPending(true);
    };
    void check();
    const interval = window.setInterval(() => void check(), 4000);
    return () => { active = false; window.clearInterval(interval); };
  }, [deviceId, redirect]);

  async function requestAccess(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setRequestError("");
    setMessage("");
    try {
      const response = await fetch("/api/dev-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", deviceId, name }),
      });
      const result = await response.json() as { status?: string; phrase?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not request access");
      if (result.status === "approved") {
        window.location.assign(redirect);
        return;
      }
      setPending(true);
      setPhrase(result.phrase || "");
      setMessage("Request sent. An admin needs to approve this device.");
    } catch (cause) {
      setRequestError(cause instanceof Error ? cause.message : "Could not request access");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="text-white font-sans min-h-full flex-1 px-4 py-8 md:px-24 md:py-16">
      <section className="px-0 md:px-6 max-sm:mt-12">
        <div className="mx-auto w-full max-w-2xl">
          <p className="!mb-2 font-mono text-xs uppercase tracking-widest text-white/40">SUAS@STEM</p>
          <h1 className="!mb-3 !mt-0 !text-left">Request access</h1>
          <p className="max-w-xl text-white/55">
            Request access for this device. An approved team member will review it, and this device will stay trusted.
          </p>

          {pending ? (
            <div className="mt-8 border-y border-white/10 py-5">
              <p className="!mb-1 text-base text-white">Waiting for approval</p>
              <p className="!m-0 text-sm text-white/50">Your request is saved. You can close this page; reopening it on this browser will check the request automatically.</p>
              {phrase && <p className="!mb-0 !mt-3 font-mono text-sm tracking-widest text-teal-200">Request code: {phrase}</p>}
            </div>
          ) : (
            <form onSubmit={(event) => void requestAccess(event)} className="mt-8 max-w-md space-y-4">
              <label className="block text-sm text-white/60">
                Your name
                <input ref={nameRef} value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={80} autoComplete="name" placeholder="Your name" className="mt-2 block w-full rounded border border-white/15 bg-white/[0.03] px-3.5 py-3 text-white outline-none transition focus:border-teal-300/70" />
              </label>
              {requestError && <p role="alert" className="!m-0 text-sm text-red-200">{requestError}</p>}
              {message && <p className="!m-0 text-sm text-white/55">{message}</p>}
              <button type="submit" disabled={busy || !deviceId} className="button-main">{busy ? "Sending…" : "Request access"}</button>
            </form>
          )}

        </div>
      </section>
    </main>
  );
}

export default function DevLoginPage() {
  return <Suspense><LoginPageContent /></Suspense>;
}
