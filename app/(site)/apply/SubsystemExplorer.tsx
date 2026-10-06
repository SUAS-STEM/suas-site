"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { getSubsystemIcon } from "../team/types";
import type { CardInfo } from "../team/types";
import { ApplyModal } from "./ApplyModal";
import styles from "./apply.module.css";

const subsystemSummaries: Record<string, string> = {
  Flight: "Design and fabricate the airframe, build custom mounts, then assemble and maintain the aircraft through flight testing.",
  "Software (Autopilot/Imaging)": "Develop software for autonomous flight, navigation, and computer vision for mapping and target detection.",
  Avionics: "Build and test aircraft power and electrical systems, including propulsion, flight controls, telemetry, and onboard computers.",
  Doc: "Record the engineering process, photograph flight testing, and create graphics and branding.",
};

const softwarePopup = {
  description:
    "Software develops the systems that let the aircraft fly autonomously and process aerial imagery. Members work with ArduPilot, flight controllers, GNSS/RTK, telemetry, cameras, and ground-side computers. The subsystem supports autonomous takeoff, landing, and waypoint navigation, and integrates mapping, target detection, and live video with the autonomous mission and ground control station.",
  goodFit: [
    "Enjoy programming, software development, autonomous systems, or computer vision",
    "Are interested in computer science, computer engineering, AI, or machine learning",
  ],
  skills: [
    "Python or C/C++",
    "Computer engineering or computer hardware",
    "Software development",
    "Machine learning",
  ],
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
          title={selectedSubsystem.group.title.startsWith("Software") ? "Join Software" : `Join ${selectedSubsystem.group.title}`}
          mergedContent={selectedSubsystem.group.title.startsWith("Software") ? softwarePopup : undefined}
          isClosing={isClosing}
          onClose={close}
          applicationFormUrl={applicationFormUrl}
        />
      ) : null}
    </>
  );
}
