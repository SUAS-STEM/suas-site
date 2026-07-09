"use client";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";

const PAGES = [
  { slug: "home", label: "Home" },
  { slug: "gcs", label: "SSGCS Overview" },
  { slug: "gcs/getting-started", label: "Getting Started" },
  { slug: "gcs/flight-operations", label: "Flight Operations" },
  { slug: "gcs/mission-planning", label: "Mission Planning" },
  { slug: "gcs/setup-configuration", label: "Setup & Configuration" },
  { slug: "gcs/settings", label: "Application Settings" },
  { slug: "gcs/troubleshooting", label: "Troubleshooting" },
];

function isExternalLink(href: string): boolean {
  return /^([a-z]+:)?\/\//i.test(href) || href.startsWith("mailto:");
}

function resolveWikiLink(currentSlug: string, href: string): { slug: string; hash: string } {
  const dir = currentSlug.includes("/") ? currentSlug.slice(0, currentSlug.lastIndexOf("/")) : "";
  const base = `https://wiki.local/${dir ? dir + "/" : ""}`;
  const resolved = new URL(href, base);
  return {
    slug: resolved.pathname.replace(/^\//, "").replace(/\.md$/, ""),
    hash: resolved.hash.replace(/^#/, ""),
  };
}

export default function WikiTab() {
  const [page, setPage] = useState("home");
  const [content, setContent] = useState("");

  useEffect(() => {
    fetch(`/api/wiki?page=${page}`)
      .then((r) => r.text())
      .then(setContent)
      .catch(() => setContent("Failed to load page."));
  }, [page]);

  const navigateTo = (slug: string, hash?: string) => {
    setPage(slug);
    if (hash) {
      requestAnimationFrame(() => {
        document.getElementById(hash)?.scrollIntoView({ block: "start" });
      });
    }
  };

  return (
    <div className="flex gap-8 min-h-[60vh]">
      <nav className="w-44 shrink-0">
        <p className="text-xs font-mono text-white/30 uppercase tracking-widest mb-3">Pages</p>
        <ul className="space-y-1">
          {PAGES.map((p) => (
            <li key={p.slug}>
              <button
                onClick={() => navigateTo(p.slug)}
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
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSlug]}
          components={{
            a: ({ href, children, ...rest }) => {
              if (!href || isExternalLink(href)) {
                return (
                  <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
                    {children}
                  </a>
                );
              }
              const { slug, hash } = resolveWikiLink(page, href);
              return (
                <a
                  href={`?page=${slug}${hash ? `#${hash}` : ""}`}
                  {...rest}
                  onClick={(e) => {
                    e.preventDefault();
                    navigateTo(slug, hash);
                  }}
                >
                  {children}
                </a>
              );
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
