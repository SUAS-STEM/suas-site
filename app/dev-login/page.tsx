"use client";
import { useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const params = useSearchParams();
  const redirect = params.get("redirect") ?? "/";
  const error = params.get("error");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const errorMessage =
    error === "invalid"
      ? "Incorrect password."
      : error === "not-configured"
      ? "Server not configured."
      : null;

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

        <form
          method="POST"
          action="/api/dev-auth"
          className="space-y-4"
        >
          <input type="hidden" name="redirect" value={redirect} />
          <input
            ref={inputRef}
            type="password"
            name="password"
            placeholder="Password"
            autoComplete="current-password"
            className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/50 transition"
          />

          {errorMessage && (
            <p className="text-sm text-red-400">{errorMessage}</p>
          )}

          <button
            type="submit"
            className="w-full bg-white text-black font-semibold text-sm py-3 rounded-lg hover:bg-white/90 transition"
          >
            Enter
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
