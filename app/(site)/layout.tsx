import SiteChrome from "@/components/SiteChrome";

export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SiteChrome>{children}</SiteChrome>
  );
}
