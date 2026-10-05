"use client";

import Image from "next/image";
import { useEffect, useCallback, useState, ReactElement, useMemo } from "react";
import { JoinModal } from "./JoinModal";
import { MemberModal } from "./MemberModal";
import { MemberPhoto } from "./MemberPhoto";
import stylesModule from "./team.module.css";
import { cardEnabledSubsystems, pastMembers, sectionCards, sections } from "./data";
import { styles } from "./styles";
import { CardInfo, Member, Rank, getRole, getSubsystemIcon } from "./types";

function InfoCard({ card, onOpen }: { card: CardInfo; onOpen: () => void }): ReactElement {
    return (
        <button type="button" style={styles.card} className="member-card join-card" onClick={onOpen}>
            <div style={{ ...styles.photoWrap, background: "rgba(255, 255, 255, 0.06)" }} className="join-card-photo">
                <Image
                    src={"/images/icons/" + getSubsystemIcon(card.subsystem)}
                    width={40}
                    height={40}
                    alt=""
                />
            </div>
            <div style={styles.name}>{card.title}</div>
            {card.subtitle ? <div style={styles.name}>{card.subtitle}</div> : null}
            <div style={styles.role} className="join-card-link">
                <span>{card.linkText ?? "Learn More"}</span>
                <Image src="/images/icons/forward.svg" width={14} height={14} alt="" aria-hidden="true" />
            </div>
        </button>
    );
}

export default function TeamContent(): ReactElement {
    const MODAL_TRANSITION_MS = 300;
    const [isOpen, setIsOpen] = useState(false);
    const [pastOpen, setPastOpen] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [switchClass, setSwitchClass] = useState("");
    const [selectedMember, setSelectedMember] = useState<Member | null>(null);
    const [joinInfo, setJoinInfo] = useState<CardInfo | null>(null);
    const [isJoinClosing, setIsJoinClosing] = useState(false);

    const closeJoin = useCallback((): void => {
        if (!joinInfo || isJoinClosing) return;
        setIsJoinClosing(true);
        window.setTimeout(() => {
            setJoinInfo(null);
            setIsJoinClosing(false);
        }, MODAL_TRANSITION_MS);
    }, [isJoinClosing, joinInfo]);

    const allMembers = useMemo(
        () => [
            ...sections.flatMap((section) =>
                [...section.members]
                    .sort((a, b) => (a.rank === Rank.Lead ? -1 : b.rank === Rank.Lead ? 1 : 0))
                    .map((member) => ({ ...member, subsystem: section.title })),
            ),
            ...pastMembers,
        ],
        [],
    );

    const selectedMemberIndex = useMemo(() => {
        if (!selectedMember) return -1;
        return allMembers.findIndex(
            (member) =>
                member.name === selectedMember.name &&
                member.subsystem === selectedMember.subsystem,
        );
    }, [allMembers, selectedMember]);

    const toMember = useCallback(
        (offset: number): void => {
            if (selectedMemberIndex < 0 || allMembers.length === 0 || isClosing) return;
            const directionClass = offset < 0 ? "member-switch-prev-in" : "member-switch-next-in";
            const nextIndex =
                (selectedMemberIndex + offset + allMembers.length) % allMembers.length;

            setSelectedMember(allMembers[nextIndex]);
            setSwitchClass(directionClass);
        },
        [allMembers, isClosing, selectedMemberIndex],
    );

    const previous = useCallback((): void => {
        toMember(-1);
    }, [toMember]);

    const next = useCallback((): void => {
        toMember(1);
    }, [toMember]);

    const close = useCallback((): void => {
        if (!isOpen || isClosing) return;
        setSwitchClass("");
        setIsClosing(true);

        window.setTimeout(() => {
            setIsOpen(false);
            setSelectedMember(null);
            setIsClosing(false);
        }, MODAL_TRANSITION_MS);
    }, [isClosing, isOpen]);

    useEffect(() => {
        function onKeyDown(event: KeyboardEvent): void {
            if (event.key === "Escape") {
                close();
                return;
            }
            if (event.key === "ArrowLeft") {
                previous();
                return;
            }
            if (event.key === "ArrowRight") next();
        }

        if (isOpen) window.addEventListener("keydown", onKeyDown);

        return () => {
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [close, next, previous, isOpen]);

    useEffect(() => {
        function onKeyDown(event: KeyboardEvent): void {
            if (event.key === "Escape") closeJoin();
        }

        if (joinInfo) window.addEventListener("keydown", onKeyDown);

        return () => {
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [closeJoin, joinInfo]);

    useEffect(() => {
        if (!isOpen && !joinInfo) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isOpen, joinInfo]);

    return (
        <>
            <main style={styles.page} className="font-sans">
                <section style={styles.hero}>
                    <div style={{ maxWidth: 900, margin: "0 auto" }}>
                        <div className="eyebrow eyebrow--center" style={{ marginBottom: 14 }}>
                            SUAS @Tesla STEM High School
                        </div>
                        <h1 style={styles.heroTitle}>The Flight Crew</h1>
                        <p style={styles.heroSubtitle}>
                            We are a team of eighteen students from Tesla STEM High School, ranked
                            #1 in Washington state and #9 nationally by{" "}
                            <a
                                href="https://www.usnews.com/education/best-high-schools/washington/districts/lake-washington-school-district/nikola-tesla-stem-high-school-146690"
                                target="_blank"
                            >
                                US News
                            </a>
                            . We collaborate in six engineering subsystems spanning aerospace,
                            electrical, and software disciplines to develop an aircraft to compete
                            in the SUAS competition.
                        </p>
                        <p className={stylesModule.updateNote}>
                            <i>
                                Our team structure and membership are currently being updated and may
                                change before the 2026-27 application process is complete.
                            </i>
                        </p>
                    </div>
                </section>

                {sections.map((sec) => (
                    <section key={sec.title} style={styles.section}>
                        <h2 style={styles.sectionTitle}>{sec.title}</h2>
                        <div style={styles.titleAccent} />
                        <div style={{ height: "10px" }} />
                        {sec.title === "Leadership" ? (
                            <div style={{ textAlign: "center" }}>
                                <span className="section-tag">{sec.description}</span>
                            </div>
                        ) : (
                            <p style={styles.sectionDescription}>{sec.description}</p>
                        )}

                        <div style={styles.grid}>
                            {cardEnabledSubsystems.includes(sec.title)
                                ? (sectionCards[sec.title] ?? [])
                                      .filter((card) => card.placement === "start")
                                      .map((card) => (
                                          <InfoCard
                                              key={card.title}
                                              card={card}
                                              onOpen={() => setJoinInfo(card)}
                                          />
                                      ))
                                : null}
                            {[...sec.members].sort((a, b) => (a.rank === Rank.Lead ? -1 : b.rank === Rank.Lead ? 1 : 0)).map((m) => (
                                <button
                                    key={m.name}
                                    type="button"
                                    style={styles.card}
                                    className="member-card"
                                    onClick={() => {
                                        setSelectedMember({ ...m, subsystem: sec.title });
                                        setIsClosing(false);
                                        setSwitchClass("");
                                        setIsOpen(true);
                                    }}
                                >
                                    <div style={styles.photoWrap} className="member-photo-wrap">
                                        <MemberPhoto name={m.name} className="min-w-64" />
                                    </div>
                                    <div style={styles.name}>{m.name}</div>
                                    <div style={styles.role}>
                                        {m.rank !== Rank.Member ? getRole(m.rank, sec.title) : " "}
                                    </div>
                                </button>
                            ))}
                            {cardEnabledSubsystems.includes(sec.title)
                                ? (sectionCards[sec.title] ?? [])
                                      .filter((card) => card.placement !== "start")
                                      .map((card) => (
                                          <InfoCard
                                              key={card.title}
                                              card={card}
                                              onOpen={() => setJoinInfo(card)}
                                          />
                                      ))
                                : null}
                        </div>
                    </section>
                ))}
                <section style={{ ...styles.section, marginTop: "4rem" }}>
                    <button
                        type="button"
                        onClick={() => setPastOpen((o) => !o)}
                        className="past-members-toggle"
                    >
                        <span className={`past-members-chevron ${pastOpen ? "open" : ""}`}>▾</span>
                        <span>Past Members</span>
                        <span className={`past-members-chevron ${pastOpen ? "open" : ""}`}>▾</span>
                    </button>
                    <div
                        className={`past-members-body ${pastOpen ? "past-members-body--open" : ""}`}
                    >
                        <div style={styles.grid}>
                            {pastMembers.map((m) => (
                                <button
                                    key={m.name}
                                    type="button"
                                    style={styles.card}
                                    className="member-card"
                                    onClick={() => {
                                        setSelectedMember(m);
                                        setIsClosing(false);
                                        setSwitchClass("");
                                        setIsOpen(true);
                                    }}
                                >
                                    <div style={styles.photoWrap} className="member-photo-wrap">
                                        <MemberPhoto name={m.name} className="min-w-64 past-member-photo" />
                                    </div>
                                    <div style={styles.name}>{m.name}</div>
                                    <div style={styles.role}>
                                        {m.rank !== Rank.Member ? getRole(m.rank, m.subsystem) : " "}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </section>
            </main>

            {isOpen && selectedMember ? (
                <MemberModal
                    member={selectedMember}
                    isClosing={isClosing}
                    switchClass={switchClass}
                    onClose={close}
                    onPrevious={previous}
                    onNext={next}
                />
            ) : null}

            {joinInfo ? (
                <JoinModal card={joinInfo} isClosing={isJoinClosing} onClose={closeJoin} />
            ) : null}
        </>
    );
}
