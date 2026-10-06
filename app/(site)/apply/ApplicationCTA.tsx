import Image from "next/image";
import styles from "./apply.module.css";

export function ApplicationCTA({ href }: { href: string }) {
  return (
    <a className={styles.primaryAction} href={href} target="_blank" rel="noopener noreferrer">
      Apply now
      <Image className={styles.actionArrow} src="/images/icons/forward.svg" width={22} height={22} alt="" aria-hidden="true" />
    </a>
  );
}
