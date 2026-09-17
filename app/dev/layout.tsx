import SiteChrome from "@/components/SiteChrome";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isDevAuthorized } from "@/lib/devAdminAuth";

export default async function DevLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const host = (await headers()).get("host")?.replace(/:\d+$/, "").toLowerCase();
  const isLocalPreview = host === "localhost" || host === "127.0.0.1";
  if (!isLocalPreview && !(await isDevAuthorized())) redirect("/dev-login");
  return (
    <SiteChrome headerVariant="dev">{children}</SiteChrome>
  );
}
