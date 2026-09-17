"use client";

import { useState } from "react";
import DevPageShell from "./DevPageShell";
import AccessRequests from "./tabs/AccessRequests";
import LinksTab from "./tabs/LinksTab";
import ParamsTab from "./tabs/ParamsTab";
import SsgcsTab from "./tabs/SsgcsTab";
import UploadsTab from "./tabs/UploadsTab";

export default function DevPage() {
  const [activePanel, setActivePanel] = useState("files");
  const panels = [
    { id: "files", label: "Files", icon: "folder" },
    { id: "params", label: "Parameters", icon: "tune" },
    { id: "ssgcs", label: "SSGCS", icon: "download" },
    { id: "links", label: "Links", icon: "link" },
    { id: "access", label: "Access", icon: "group" },
  ];
  return (
    <DevPageShell title="Workspace" description="Internal tools and file intake for the SUAS@STEM team.">
      <div className="space-y-6">
        <nav aria-label="Workspace sections" className="sticky top-2 z-30 flex gap-1 overflow-x-auto rounded-lg border border-white/10 bg-[#11151a]/95 p-1 backdrop-blur">
          {panels.map((panel) => (
            <button key={panel.id} type="button" onClick={() => setActivePanel(panel.id)} className={`inline-flex shrink-0 items-center gap-2 rounded px-3 py-2 text-xs font-medium transition ${activePanel === panel.id ? "bg-white text-black" : "text-white/55 hover:bg-white/10 hover:text-white"}`} aria-current={activePanel === panel.id ? "page" : undefined}>
              <span className="material-symbols-outlined text-[1rem]" aria-hidden="true">{panel.icon}</span>{panel.label}
            </button>
          ))}
        </nav>
        {activePanel === "files" && <UploadsTab />}
        {activePanel === "params" && <ParamsTab />}
        {activePanel === "ssgcs" && <SsgcsTab />}
        {activePanel === "links" && <LinksTab />}
        {activePanel === "access" && <AccessRequests />}
      </div>
    </DevPageShell>
  );
}
