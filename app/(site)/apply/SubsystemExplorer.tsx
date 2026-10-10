"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { getSubsystemIcon } from "../team/types";
import type { CardInfo } from "../team/types";
import { ApplyModal } from "./ApplyModal";
import styles from "./apply.module.css";

const subsystemSummaries: Record<string, string> = {
  Flight: "Design and fabricate the airframe, build custom mounts, then assemble and maintain the aircraft through flight testing.",
  Software: "Program autonomous missions, connect software with onboard computers and sensors, and build ground control and computer vision systems.",
  Avionics: "Build and test aircraft power and electrical systems, including propulsion, flight controls, telemetry, and onboard computers.",
  Doc: "Record the engineering process, photograph flight testing, and create graphics and branding.",
};

type SubsystemGroup = {
  title: string;
  cards: CardInfo[];
};

type SelectedSubsystem = {
  group: SubsystemGroup;
};

export function SubsystemExplorer({
  groups,
  applicationFormUrl,
}: {
  groups: SubsystemGroup[];
  applicationFormUrl: string;
}) {
  const [selectedSubsystem, setSelectedSubsystem] = useState<SelectedSubsystem | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  const close = useCallback(() => {
    if (!selectedSubsystem || isClosing) return;
    setIsClosing(true);
    window.setTimeout(() => {
      setSelectedSubsystem(null);
      setIsClosing(false);
    }, 300);
  }, [isClosing, selectedSubsystem]);

  useEffect(() => {
    if (!selectedSubsystem) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, selectedSubsystem]);

  return (
    <>
      <ol className={styles.subsystemGrid}>
        {groups.map((group) => (
          <li key={group.title}>
            <button
              type="button"
              className={styles.subsystemCard}
              aria-label={`Learn more about ${group.title}`}
              onClick={() => setSelectedSubsystem({ group })}
            >
              <span className={styles.subsystemCardTop}>
                <span className={styles.subsystemTitle}>{group.title}</span>
                <span className={styles.subsystemIcons} aria-hidden="true">
                  {group.cards.map((card) => (
                    <span className={styles.subsystemIcon} key={card.subsystem}>
                      <Image src={`/images/icons/${getSubsystemIcon(card.subsystem)}`} width={40} height={40} alt="" />
                    </span>
                  ))}
                </span>
              </span>
              <span className={styles.subsystemSummaries}>
                <span className={styles.subsystemSummary}>
                  {subsystemSummaries[group.title] ?? subsystemSummaries[group.cards[0]?.subsystem]}
                </span>
              </span>
              <span className={`${styles.primaryAction} ${styles.subsystemCardAction}`}>Explore subsystem</span>
            </button>
          </li>
        ))}
      </ol>

      {selectedSubsystem ? (
        <ApplyModal
          cards={selectedSubsystem.group.cards}
          title={`Join ${selectedSubsystem.group.title}`}
          isClosing={isClosing}
          onClose={close}
          applicationFormUrl={applicationFormUrl}
        />
      ) : null}
    </>
  );
}
