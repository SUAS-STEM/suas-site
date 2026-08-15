"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Fuse from "fuse.js";
import { searchIndex, SearchEntry } from "@/lib/searchIndex";

type Result = {
  item: SearchEntry;
  snippet: string;
};

const SNIPPET_RADIUS = 60;

function buildSnippet(text: string, indices?: readonly [number, number][]): string {
  if (!indices || indices.length === 0) {
    return text.length > 140 ? text.slice(0, 140) + "…" : text;
  }
  const [start, end] = indices[0];
  const from = Math.max(0, start - SNIPPET_RADIUS);
  const to = Math.min(text.length, end + SNIPPET_RADIUS);
  const prefix = from > 0 ? "…" : "";
  const suffix = to < text.length ? "…" : "";
  return prefix + text.slice(from, to + 1) + suffix;
}

export default function SiteSearch() {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const fuse = useMemo(
    () =>
      new Fuse(searchIndex, {
        keys: [
          { name: "title", weight: 2 },
          { name: "content", weight: 1 },
        ],
        threshold: 0.35,
        ignoreLocation: true,
        includeMatches: true,
        minMatchCharLength: 2,
      }),
    []
  );

  const results: Result[] = query.trim()
    ? fuse.search(query).map((r) => {
        const contentMatch = r.matches?.find((m) => m.key === "content");
        const snippet = buildSnippet(r.item.content, contentMatch?.indices);
        return { item: r.item, snippet };
      })
    : [];

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setVisible(true));
      inputRef.current?.focus();
    } else {
      setVisible(false);
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = () => {
    setVisible(false);
    setTimeout(() => {
      setOpen(false);
      setQuery("");
    }, 150);
  };

  const go = (url: string) => {
    setVisible(false);
    setTimeout(() => {
      setOpen(false);
      setQuery("");
      router.push(url);
    }, 100);
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = results[activeIndex];
      if (target) go(target.item.url);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="text-md font-medium flex items-center gap-1 text-white/80 hover:text-white transition-colors"
      >
        <span className="material-symbols-outlined text-lg">search</span>
      </button>

      {open && (
        <div
          className={`fixed inset-0 z-[100] flex items-start justify-center pt-24 px-4 backdrop-blur-sm transition-opacity duration-150 ${
            visible ? "bg-black/70 opacity-100" : "bg-black/0 opacity-0"
          }`}
          onClick={close}
        >
          <div
            className={`w-full max-w-lg bg-neutral-900 border border-white/15 rounded-lg shadow-2xl shadow-black/50 overflow-hidden transition-all duration-150 ease-out ${
              visible ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 -translate-y-2"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 border-b border-white/10">
              <span className="material-symbols-outlined text-lg text-gray-400">search</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Search the site..."
                className="w-full bg-transparent py-4 text-white placeholder-gray-400 outline-none"
              />
              <kbd className="hidden sm:inline-block text-[10px] text-gray-500 border border-white/10 rounded px-1.5 py-0.5">
                Esc
              </kbd>
            </div>
            <ul className="max-h-96 overflow-y-auto">
              {query.trim() && results.length === 0 && (
                <li className="p-4 text-gray-400 text-sm">No results</li>
              )}
              {results.map(({ item, snippet }, i) => (
                <li key={item.url}>
                  <button
                    onClick={() => go(item.url)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`w-full text-left px-4 py-3 transition-colors block border-l-2 ${
                      i === activeIndex
                        ? "bg-white/10 border-teal-400"
                        : "border-transparent hover:bg-white/5"
                    }`}
                  >
                    <span className="block font-semibold text-white">{item.title}</span>
                    <span className="block text-sm text-gray-400 mt-0.5">{snippet}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
