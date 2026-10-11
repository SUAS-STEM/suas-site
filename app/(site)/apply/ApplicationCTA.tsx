import Image from "next/image";
import styles from "./apply.module.css";

export function ApplicationCTA({ href }: { href: string }) {
  return (
    <a
      className={styles.primaryAction}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-analytics-event="application_form_click"
      data-analytics-label="apply-page-primary"
      data-analytics-impression="application_form_cta"
      data-apply-click-source="apply-page-primary"
    >
      Apply now
      <Image className={styles.actionArrow} src="/images/icons/forward.svg" width={22} height={22} alt="" aria-hidden="true" />
    </a>
  );
}
