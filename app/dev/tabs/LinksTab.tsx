"use client";
import { useEffect, useState } from "react";

interface LinkItem {
  label: string;
  desc: string;
  href: string;
}

interface LinkGroup {
  group: string;
  links: LinkItem[];
}

export default function LinksTab() {
  const [groups, setGroups] = useState<LinkGroup[]>([]);

  useEffect(() => {
    fetch("/api/links")
      .then((r) => r.json())
      .then(setGroups)
      .catch(() => setGroups([]));
  }, []);

  return (
    <div className="space-y-10">
      {groups.map((group) => (
        <div key={group.group}>
          <p className="text-xs font-mono text-white/30 uppercase tracking-widest mb-3">
            {group.group}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {group.links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 border border-white/10 rounded-lg hover:border-white/30 hover:bg-white/5 transition group"
              >
                <div className="font-medium text-sm text-white group-hover:text-white">
                  {link.label}
                </div>
                <div className="text-xs text-white/40 mt-1">{link.desc}</div>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
