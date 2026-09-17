import SiteChrome from "@/components/SiteChrome";

export default function DevLoginLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <SiteChrome headerVariant="dev" showLogout={false}>{children}</SiteChrome>;
}
