"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";

export default function Footer(): React.ReactElement {
  const [serverDown, setServerDown] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);

    fetch(`/api/health?ts=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => setServerDown(!response.ok))
      .catch(() => setServerDown(true))
      .finally(() => window.clearTimeout(timeout));

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return (
    <footer className="w-full border-t border-gray-800 py-6 font-sans">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex gap-6 items-center">
            <Link href="/" className="text-sm hover:underline">
              Home
            </Link>
            <Link href="/team" className="text-sm hover:underline">
              Team
            </Link>
            <Link href="/gallery" className="text-sm hover:underline">
              Gallery
            </Link>
            <Link href="/aircraft" className="text-sm hover:underline">
              Aircraft
            </Link>
            <Link href="/sponsor" className="text-sm hover:underline">
              Contact
            </Link>
          </div>

          <div className="text-sm text-center">
            © {new Date().getFullYear()} SUAS@STEM • All rights reserved.
          </div>

          <div className="flex gap-4 items-center">
            <a
              href="mailto:contact@suasstem.org"
              aria-label="Email SUAS@STEM"
              className="text-xs text-white/60 hover:text-teal-300 transition"
            >
              Email
            </a>
            <a
              href="https://linkedin.com/company/suas-stem"
              target="_blank"
              rel="noreferrer"
              aria-label="SUAS@STEM on LinkedIn"
              className="text-xs text-white/60 hover:text-sky-300 transition"
            >
              LinkedIn
            </a>
            <a
              href="https://instagram.com/suas.stem"
              target="_blank"
              rel="noreferrer"
              aria-label="SUAS@STEM on Instagram"
              className="text-xs text-white/60 hover:text-pink-300 transition"
            >
              Instagram
            </a>
            <a
              href="https://www.youtube.com/@SUASSTEM"
              target="_blank"
              rel="noreferrer"
              aria-label="SUAS@STEM on YouTube"
              className="text-xs text-white/60 hover:text-red-300 transition"
            >
              YouTube
            </a>
          </div>

          {/* <div className="flex gap-4 items-center">
            <a href="#" aria-label="Twitter" className="text-sm hover:underline">
              Twitter
            </a>
            <a href="#" aria-label="Instagram" className="text-sm hover:underline">
              Instagram
            </a>
          </div> */}
        </div>
        {serverDown ? (
          <p
            role="status"
            className="mt-4 border-t border-white/10 pt-4 text-center text-xs text-amber-300/90"
          >
            The SUAS@STEM server is currently offline. Some live features may be unavailable.
          </p>
        ) : null}
      </div>
    </footer>
  );
}
