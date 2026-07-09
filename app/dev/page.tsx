"use client";
import { useState } from "react";
import SsgcsTab from "./tabs/SsgcsTab";
import WikiTab from "./tabs/WikiTab";
import LinksTab from "./tabs/LinksTab";

const TABS = ["SSGCS", "Wiki", "Links"] as const;
type Tab = (typeof TABS)[number];

export default function DevPage() {
  const [tab, setTab] = useState<Tab>("SSGCS");

  return (
    <main className="flex-1 flex flex-col min-h-full">
      <div className="border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 md:px-8 flex items-end gap-1 pt-8">
          <div className="mb-0 mr-6 pb-3">
            <span className="text-xs font-mono text-white/30 uppercase tracking-widest">
              Internal
            </span>
          </div>
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-white text-white"
                  : "border-transparent text-white/40 hover:text-white/70"
              }`}
            >
              {t}
            </button>
          ))}
          <form method="POST" action="/api/dev-auth/logout" className="ml-auto mb-0 pb-3">
            <button
              type="submit"
              className="text-sm font-medium text-white/40 hover:text-white/70 transition-colors"
            >
              Log out
            </button>
          </form>
        </div>
      </div>

      <div className="flex-1 max-w-5xl w-full mx-auto px-4 md:px-8 py-8">
        {tab === "SSGCS" && <SsgcsTab />}
        {tab === "Wiki" && <WikiTab />}
        {tab === "Links" && <LinksTab />}
      </div>
    </main>
  );
}
