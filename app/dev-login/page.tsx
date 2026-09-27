"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const DEVICE_KEY = "suas-trusted-device";

function safeRedirect(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function deviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const value = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, value);
    return value;
  } catch {
    return crypto.randomUUID();
  }
}

function LoginPageContent() {
  const params = useSearchParams();
  const redirect = safeRedirect(params.get("redirect"));
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/suas-auth", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as { user?: { status?: string } | null };
      if (result.user?.status === "approved") window.location.assign(redirect);
    }).catch(() => undefined);
  }, [redirect]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/suas-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: mode, username, password, displayName, deviceId: deviceId() }),
      });
      const result = await response.json().catch(() => ({})) as { status?: string; error?: string };
      if (!response.ok) {
        if (result.status === "pending") throw new Error("Your account is waiting for administrator approval.");
        if (result.status === "denied") throw new Error("This account is not approved.");
        throw new Error(result.error || "Could not sign in");
      }
      if (mode === "register") {
        setMessage("Account created. An administrator must approve it before you can sign in.");
        setMode("login");
        setPassword("");
      } else {
        window.location.assign(redirect);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not continue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="text-white font-sans min-h-full flex-1 px-4 py-8 md:px-24 md:py-16">
      <section className="px-0 md:px-6 max-sm:mt-12">
        <div className="mx-auto w-full max-w-2xl">
          <p className="!mb-2 font-mono text-xs uppercase tracking-widest text-white/40">SUAS@STEM · DEV ACCESS</p>
          <h1 className="!mb-3 !mt-0 !text-left">{mode === "login" ? "Sign in" : "Request an account"}</h1>
          <p className="max-w-xl text-white/55">One approved account works for the dev workspace and authenticated SITL access. This browser/device stays trusted after sign-in.</p>
          <form onSubmit={(event) => void submit(event)} className="mt-8 max-w-md space-y-4">
            {mode === "register" && <label className="block text-sm text-white/60">Name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required minLength={2} maxLength={80} autoComplete="name" className="mt-2 block w-full rounded border border-white/15 bg-white/[0.03] px-3.5 py-3 text-white outline-none focus:border-teal-300/70" /></label>}
            <label className="block text-sm text-white/60">Username<input value={username} onChange={(event) => setUsername(event.target.value)} required minLength={3} maxLength={48} autoComplete="username" autoCapitalize="none" className="mt-2 block w-full rounded border border-white/15 bg-white/[0.03] px-3.5 py-3 text-white outline-none focus:border-teal-300/70" /></label>
            <label className="block text-sm text-white/60">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} autoComplete={mode === "login" ? "current-password" : "new-password"} className="mt-2 block w-full rounded border border-white/15 bg-white/[0.03] px-3.5 py-3 text-white outline-none focus:border-teal-300/70" /></label>
            {error && <p role="alert" className="!m-0 text-sm text-red-200">{error}</p>}
            {message && <p className="!m-0 text-sm text-teal-100">{message}</p>}
            <button type="submit" disabled={busy} className="button-main">{busy ? "Working…" : mode === "login" ? "Sign in" : "Request account"}</button>
          </form>
          <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setMessage(""); }} className="mt-6 text-sm text-white/55 underline decoration-white/20 underline-offset-4 hover:text-white">{mode === "login" ? "Need access? Request an account" : "Already approved? Sign in"}</button>
        </div>
      </section>
    </main>
  );
}

export default function DevLoginPage() {
  return <Suspense><LoginPageContent /></Suspense>;
}
