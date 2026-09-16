import UploadPortal from "./UploadPortal";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isDevSiteHost } from "@/lib/devHost";

export const metadata = { title: "Upload files · SUAS@STEM" };

export default async function UploadPage() {
  if (!isDevSiteHost((await headers()).get("host"))) notFound();
  return <UploadPortal />;
}
