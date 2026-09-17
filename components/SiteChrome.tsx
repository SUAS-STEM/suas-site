import Navbar from "@/components/Header";
import Footer from "@/components/Footer";

type SiteChromeProps = Readonly<{
  children: React.ReactNode;
  headerVariant?: "site" | "dev";
  showLogout?: boolean;
}>;

export default function SiteChrome({ children, headerVariant = "site", showLogout }: SiteChromeProps) {
  return (
    <>
      <Navbar variant={headerVariant} showLogout={showLogout} />
      <div className="flex-1 flex flex-col grow">{children}</div>
      <Footer />
    </>
  );
}
