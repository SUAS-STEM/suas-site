"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") ?? "/";

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/dev-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push(redirect);
      } else {
        setError("Incorrect password.");
        setPassword("");
        inputRef.current?.focus();
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-xs font-mono text-white/40 uppercase tracking-widest mb-2">
            SUAS@STEM Internal
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Access Required
          </h1>
          <p className="mt-2 text-sm text-white/50">
            This site is for team members only.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              disabled={loading}
              className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/50 transition disabled:opacity-50"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-white text-black font-semibold text-sm py-3 rounded-lg hover:bg-white/90 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Verifying…" : "Enter"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function DevLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
