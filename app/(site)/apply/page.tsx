import Image from "next/image";
import Link from "next/link";
import { applicationSubsystemGroups, sectionCards } from "../team/data";
import homeStyles from "../home.module.css";
import styles from "./apply.module.css";
import { ApplicationCTA } from "./ApplicationCTA";
import { APPLICATIONS_OPEN, APPLICATION_SEASON } from "@/lib/applicationStatus";
import { SubsystemExplorer } from "./SubsystemExplorer";

export const metadata = {
  title: APPLICATIONS_OPEN ? "Apply | SUAS@STEM" : "Applications Closed | SUAS@STEM",
  description:
    APPLICATIONS_OPEN
      ? "Apply to help design, build, program, test, and fly an autonomous aircraft with SUAS@STEM."
      : "Applications for SUAS@STEM are currently closed. Explore our subsystems and meet the team.",
};

export default function ApplyPage() {
  const applicationFormUrl = "https://forms.cloud.microsoft/r/M236hGQ0cv";
  const formEmbedUrl = process.env.NEXT_PUBLIC_APPLICATION_FORM_EMBED_URL;
  const subsystems = applicationSubsystemGroups
    .map((group) => ({
      title: group.title,
      cards: group.sections.flatMap((section) =>
        (sectionCards[section] ?? []).filter((card) => card.title.startsWith("Join ")),
      ),
    }))
    .filter((group) => group.cards.length > 0);

  return (
    <main className={`text-white font-sans min-h-full flex-1 md:py-8 py-8 flex flex-col ${homeStyles.pageMain}`}>
      <section className={`flex flex-1 justify-center ${styles.heroSection}`}>
        <div className={homeStyles.heroGrid}>
          <div className={styles.heroCopy}>
            <h1 className={styles.title}>{APPLICATIONS_OPEN ? "Build With Us" : "Applications Closed"}</h1>
            {!APPLICATIONS_OPEN ? (
              <p className={styles.closedNotice} role="status">
                Applications for the {APPLICATION_SEASON} season are now closed. Thank you for your
                interest in SUAS@STEM. Please check back for future opportunities.
              </p>
            ) : null}
            <p className={styles.intro}>
              SUAS@STEM students design, build, program, test, and fly an autonomous aircraft for
              the national Student Unmanned Aerial Systems competition. Work across airframe,
              avionics, embedded systems, autonomous flight, software, computer vision, and flight
              testing.
            </p>
            <div className={styles.actionGroup}>
              {APPLICATIONS_OPEN ? <ApplicationCTA href={applicationFormUrl} /> : null}
              <Link href="/team" className={`${styles.primaryAction} ${styles.secondaryAction}`}>
                Meet the Team
              </Link>
            </div>
            {APPLICATIONS_OPEN ? (
              <p className={styles.reassurance}>
                First-time applications take about 45 minutes. Sharing additional experiences or
                preparing optional supplemental materials may take longer. Current members renewing
                their membership follow a shorter process.
              </p>
            ) : null}
          </div>

          <div className={homeStyles.heroPhoto}>
            <div
              className={`hero-frame ${homeStyles.photoFrame}`}
              style={{ boxShadow: "0 8px 40px rgba(20,184,166,0.35)" }}
            >
              <div className="absolute inset-0 overflow-hidden rounded-xl border border-teal-300/20 bg-gray-800">
                <Image
                  src="/images/team-photo-v2.png"
                  alt="SUAS@STEM students working together on their aircraft"
                  fill
                  sizes="(max-width: 768px) calc(100vw - 4rem), 64rem"
                  quality={100}
                  priority
                  className="object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.subsystems} aria-labelledby="subsystems-title">
        <h2 id="subsystems-title">Our subsystems</h2>
        <SubsystemExplorer groups={subsystems} applicationFormUrl={APPLICATIONS_OPEN ? applicationFormUrl : null} />
      </section>

      {APPLICATIONS_OPEN && formEmbedUrl ? (
        <section id="application-form" className={styles.applicationForm} aria-label="Application form">
          <iframe src={formEmbedUrl} title="SUAS@STEM application" loading="lazy" />
        </section>
      ) : null}
    </main>
  );
}
