export function isDevSiteHost(host: string | null) {
  const normalized = (host || "").replace(/:\d+$/, "").toLowerCase();
  return normalized === "dev.suasstem.org" || normalized === "localhost" || normalized === "127.0.0.1";
}
