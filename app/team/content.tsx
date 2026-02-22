"use client";

import Image from "next/image";
import { useEffect, useCallback, useState, ReactElement, useMemo, CSSProperties } from "react";

enum Rank {
    Member = "Member",
    PM = "Project Manager",
    OperationsLead = "Operations Lead",
    Lead = "Lead Project Manager"
}

type Member = {
    name: string;
    grade: number;
    rank: Rank;
    about?: string;
    subsystem?: string;
};

function getMemberImageSrc(name: string): string {
    return `/images/members/${name.toLowerCase().replaceAll(" ", "_")}.png`;
}

function getRole(rank: Rank, subsystem?: string): string {
    if (rank === Rank.Member) return `${subsystem ?? ""} Member`.trim();
    if (rank === Rank.PM) return `${subsystem ?? ""} PM`.trim();
    if (rank === Rank.OperationsLead) return "Operations Lead";
    if (rank === Rank.Lead) return "Lead Project Manager";
    return rank;
}
const subsystemIcons: Record<string, string> = {
    Flight: "flight.svg",
    Avionics: "avionics.svg",
    Autopilot: "autopilot.svg",
    Doc: "doc.svg",
    Board: "board.svg",
};

function getSubsystemIcon(subsystem?: string): string {
    if (!subsystem) return "default.svg";
    return subsystemIcons[subsystem] ?? "default.svg";
}

function MemberPhoto({
    name,
    size = 200,
    className,
}: {
    name: string;
    size?: number;
    className?: string;
}): ReactElement {
    return (
        <Image
            src={getMemberImageSrc(name)}
            alt={name}
            width={size}
            height={size}
            style={{ objectFit: "cover" }}
            className={className}
        />
    );
}

const sections: { title: string; description: string, members: Member[] }[] = [
    {
        title: "Board",
        description: "",
        members: [
            { name: "Wenxin Fang", grade: 10, rank: Rank.Lead },
            { name: "Yu Tane Quah", grade: 10, rank: Rank.OperationsLead },

        ],
    },
    {
        title: "Flight",
        description: "The Flight subsystem is responsible for the physical design and construction.",
        members: [
            { name: "Avnish Dighe", grade: 12, rank: Rank.PM },
            { name: "Pratham Koka", grade: 9, rank: Rank.Member },
            { name: "Karthik Rajagopal", grade: 11, rank: Rank.Member },
            { name: "Nithin Ganesh", grade: 10, rank: Rank.Member },
            { name: "Advay Midha", grade: 10, rank: Rank.Member },
        ]
    },
    {
        title: "Avionics",
        description: "The Avionics subsystem is responsible for electronic systems.",
        members: [
            { name: "Ivana Mohapatra", grade: 10, rank: Rank.PM },
            { name: "Akanksha Revuru", grade: 11, rank: Rank.Member },
            { name: "Max Xie", grade: 11, rank: Rank.Member },
        ]
    },
    {
        title: "Autopilot",
        description: "The Autopilot subsystem is responsible for integrating software and autonomous operations.",
        members: [
            { name: "Inesh Dey", grade: 12, rank: Rank.PM },
            { name: "Jeswanth Sri Sai Battula", grade: 10, rank: Rank.Member },
            { name: "Ethan Chan", grade: 10, rank: Rank.Member },
            { name: "Neel Nevrekar", grade: 10, rank: Rank.Member },
            { name: "Zhencheng Lu", grade: 10, rank: Rank.Member },
        ],
    },
    {
        title: "Doc",
        description: "The Doc subsystem is responsible for creating a brand image and documenting the team's process.",
        members: [
            { name: "Timothy An", grade: 10, rank: Rank.PM },
            { name: "Ved Agrawal", grade: 9, rank: Rank.Member },
        ],
    },
];

const styles: Record<string, CSSProperties> = {
    page: {
        maxWidth: 1100,
        margin: "0 auto",
        padding: "3rem 1.5rem",
        color: "var(--foreground)",
    },
    hero: {
        textAlign: "center",
        marginBottom: "3.5rem",
    },
    heroTitle: {
        fontSize: "3.25rem",
        lineHeight: 1.05,
        fontWeight: 800,
        marginBottom: "1rem",
    },
    heroSubtitle: {
        maxWidth: 820,
        margin: "0 auto",
        color: "#ddd",
        fontSize: "1rem",
        lineHeight: 1.6,
    },
    section: {
        marginTop: "2.5rem",
        marginBottom: "2.5rem",
    },
    sectionTitle: {
        textAlign: "center",
        fontSize: "1.6rem",
        fontWeight: 800,
        marginBottom: "0.65rem",
    },
    sectionDescription: {
        textAlign: "center",
        marginTop: "0.5rem",
        color: "#cfcfcf",
        fontSize: "1rem",
    },
    titleAccent: {
        height: 6,
        width: 140,
        background: "var(--primary)",
        margin: "0 auto",
        borderRadius: 4,
        boxShadow: "0 4px 0 rgba(0,0,0,0.25)",
    },
    grid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: "1.25rem",
        alignItems: "start",
        justifyContent: "center",
        justifyItems: "center",
        marginTop: "1.4rem",
    },
    card: {
        borderRadius: 24,
        padding: "1rem",
        textAlign: "center",
    },
    photoWrap: {
        width: 160,
        height: 160,
        borderRadius: "999px",
        overflow: "hidden",
        margin: "0 auto 0.85rem",
        background: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },
    name: {
        fontWeight: 800,
        fontSize: "0.95rem",
        color: "var(--foreground)",
        marginBottom: 4,
    },
    role: {
        fontSize: "0.86rem",
        color: "#cfcfcf",
    },
};

export default function TeamContent(): ReactElement {
    const MODAL_TRANSITION_MS = 300;
    const [isOpen, setIsOpen] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [switchClass, setSwitchClass] = useState("");
    const [selectedMember, setSelectedMember] = useState<Member | null>(null);
    const allMembers = useMemo(
        () => sections.flatMap((section) => section.members.map((member) => ({ ...member, subsystem: section.title }))),
        []
    );

    const selectedMemberIndex = useMemo(() => {
        if (!selectedMember) return -1;
        return allMembers.findIndex(
            (member) =>
                member.name === selectedMember.name &&
                member.subsystem === selectedMember.subsystem
        );
    }, [allMembers, selectedMember]);

    const toMember = useCallback((offset: number): void => {
        if (selectedMemberIndex < 0 || allMembers.length === 0 || isClosing) return;
        const directionClass = offset < 0 ? "member-switch-prev-in" : "member-switch-next-in";
        const nextIndex = (selectedMemberIndex + offset + allMembers.length) % allMembers.length;

        setSelectedMember(allMembers[nextIndex]);
        setSwitchClass(directionClass);
    }, [allMembers, isClosing, selectedMemberIndex]);

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

    return (
        <>
            <main style={styles.page} className="font-sans">
                <section style={styles.hero}>
                    <div style={{ maxWidth: 900, margin: "0 auto" }}>
                        <div style={{ color: "var(--foreground)", fontWeight: 700, fontSize: "0.95rem", marginBottom: 8 }}>
                            SUAS @Tesla STEM High School
                        </div>
                        <h1 style={styles.heroTitle}>The Flight Crew</h1>
                        <p style={styles.heroSubtitle}>
                            The SUAS @STEM team consists of dedicated students who balance a heavy
                            school workload yet consistently strive to be among the best. Despite
                            the demands of classes and exams, they remain focused and work
                            tirelessly on designing, building, and programming their drones,
                            continually improving their skills.
                        </p>
                    </div>
                </section>

                {sections.map((sec) => (
                    <section key={sec.title} style={styles.section}>
                        <h2 style={styles.sectionTitle}>{sec.title}</h2>
                        <div style={styles.titleAccent} />
                        <div style={{ height: "10px" }} />
                        <p style={styles.sectionDescription}>{sec.description}</p>

                        <div style={styles.grid}>
                            {sec.members.map((m) => (
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
                                    {m.rank !== Rank.Member && <div style={styles.role}>{m.rank}</div>}
                                </button>
                            ))}
                        </div>
                    </section>
                ))}
            </main>

            {isOpen && selectedMember ? (
                <div className={`member-backdrop ${isClosing ? "is-closing" : ""}`} onClick={close}>
                    <button
                        type="button"
                        className="member-nav member-nav-left"
                        aria-label="Previous member"
                        onClick={(event) => {
                            event.stopPropagation();
                            previous();
                        }}
                    >
                        <Image
                            src="/images/icons/back.svg"
                            alt=""
                            width={30}
                            height={30}
                            aria-hidden="true"
                        />
                    </button>
                    <div
                        key={`${selectedMember.name}-${selectedMember.subsystem}`}
                        className={`member ${switchClass}`}
                        role="dialog"
                        aria-modal="true"
                        aria-label={selectedMember.name}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button type="button" className="member-close" aria-label="Close" onClick={close}>
                            <Image
                                src="/images/icons/close.svg"
                                width={30}
                                height={30}
                                alt=""
                                aria-hidden="true"
                            />
                        </button>
                        <div className="member-photo">
                            <MemberPhoto name={selectedMember.name} size={300} />
                        </div>
                        <h3 className="member-title">{selectedMember.name.toUpperCase()}</h3>
                        <p className="member-role">{getRole(selectedMember.rank, selectedMember.subsystem)}</p>

                        <div style={{ height: "10px" }}></div>
                        <hr />
                        <p className="member-data">
                            <Image
                                src={"/images/icons/" + getSubsystemIcon(selectedMember.subsystem)}
                                width={30}
                                height={30}
                                alt=""
                            />
                            <span>{selectedMember.subsystem}</span>
                        </p>
                        <hr />
                        <p className="member-data">
                            <Image
                                src="/images/icons/grade.svg"
                                width={30}
                                height={30}
                                alt=""
                            />
                            <span>{"Grade " + selectedMember.grade}</span>
                        </p>
                        <hr />
                        {/* <div style={{ height: "10px" }}></div>
                        <h4>About</h4>
                        <div style={{ height: "10px" }}></div>
                        <p>{selectedMember.about}</p> */}
                    </div>
                    <button
                        type="button"
                        className="member-nav member-nav-right"
                        aria-label="Next member"
                        onClick={(event) => {
                            event.stopPropagation();
                            next();
                        }}
                    >
                        <Image
                            src="/images/icons/forward.svg"
                            alt=""
                            width={30}
                            height={30}
                            aria-hidden="true"
                        />
                    </button>
                </div>
            ) : null}
        </>
    );
}
