import Navbar from "@/components/Header";
import Footer from "@/components/Footer";
import Link from "next/link";
import styles from "./SiteChrome.module.css";

type SiteChromeProps = Readonly<{
  children: React.ReactNode;
  headerVariant?: "site" | "dev";
  showLogout?: boolean;
}>;

export default function SiteChrome({ children, headerVariant = "site", showLogout }: SiteChromeProps) {
  return (
    <>
      {headerVariant === "site" ? (
        <Link
          href="/apply"
          className={styles.applicationBanner}
        >
          <span className={styles.applicationBannerText}>
            Applications for 2026 are now open!
          </span>
          <span className={styles.applicationBannerAction}>Click to apply</span>
        </Link>
      ) : null}
      <Navbar variant={headerVariant} showLogout={showLogout} />
      <div className="flex-1 flex flex-col grow">{children}</div>
      <Footer />
    </>
  );
}
