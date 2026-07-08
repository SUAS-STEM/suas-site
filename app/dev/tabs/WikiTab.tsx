"use client";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

const PAGES = [
  { slug: "home", label: "Home" },
  { slug: "gcs", label: "Ground Control" },
];

export default function WikiTab() {
  const [page, setPage] = useState("home");
  const [content, setContent] = useState("");

  useEffect(() => {
    fetch(`/api/wiki?page=${page}`)
      .then((r) => r.text())
      .then(setContent)
      .catch(() => setContent("Failed to load page."));
  }, [page]);

  return (
    <div className="flex gap-8 min-h-[60vh]">
      <nav className="w-44 shrink-0">
        <p className="text-xs font-mono text-white/30 uppercase tracking-widest mb-3">Pages</p>
        <ul className="space-y-1">
          {PAGES.map((p) => (
            <li key={p.slug}>
              <button
                onClick={() => setPage(p.slug)}
                className={`w-full text-left px-3 py-1.5 rounded text-sm transition ${
                  page === p.slug
                    ? "bg-white/10 text-white"
                    : "text-white/50 hover:text-white hover:bg-white/5"
                }`}
              >
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex-1 min-w-0 wiki-prose">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
