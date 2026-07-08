const LINK_GROUPS = [
  {
    group: "Competition",
    links: [
      { label: "AUVSI SUAS", desc: "Official competition website", href: "https://suas-competition.org" },
      { label: "Rules & Docs", desc: "Current year competition rules PDF", href: "https://suas-competition.org/competitions" },
    ],
  },
  {
    group: "Development",
    links: [
      { label: "GitHub Organization", desc: "SUAS-STEM GitHub org", href: "https://github.com/SUAS-STEM" },
      { label: "MAVLink Docs", desc: "Protocol reference for drone communication", href: "https://mavlink.io/en" },
      { label: "MAVSDK Docs", desc: "SDK used in SSGCS", href: "https://mavsdk.mavlink.io" },
      { label: "QGroundControl", desc: "Backup GCS for field use", href: "http://qgroundcontrol.com" },
    ],
  },
  {
    group: "Resources",
    links: [
      { label: "ArduPilot Docs", desc: "Flight controller documentation", href: "https://ardupilot.org/ardupilot" },
      { label: "PX4 Docs", desc: "Alternative flight stack reference", href: "https://docs.px4.io" },
    ],
  },
];

export default function LinksTab() {
  return (
    <div className="space-y-10">
      {LINK_GROUPS.map((group) => (
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
