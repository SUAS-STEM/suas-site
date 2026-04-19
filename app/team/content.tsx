"use client";

import Image from "next/image";
import { useEffect, useCallback, useState, ReactElement, useMemo, CSSProperties } from "react";

enum Rank {
    Member = "Member",
    PM = "Project Manager",
    OperationsLead = "Operations Lead",
    Lead = "Lead Project Manager",
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
    Imaging: "imaging.svg",
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

const sections: { title: string; description: string; members: Member[] }[] = [
    {
        title: "Board",
        description: "",
        members: [
            {
                name: "Wenxin Fang",
                grade: 10,
                rank: Rank.Lead,
                about: `I lead SUAS@STEM, focusing on systems integration and avionics development. I'm an aspiring aerospace engineer with an interest in electromechanical systems. Together with the team, we strive to build an environment where we push through adversity and come out stronger than before. When I'm not building autonomous systems or leading a team, you can find me baking a batch of chocolate chip cookies or enjoying the natural beauty of the PNW!`,
            },
            {
                name: "Yu Tane Quah",
                grade: 10,
                rank: Rank.OperationsLead,
                about: `I manage operations for SUAS @STEM which mostly involves team organization and project management. Though I have had no prior experience with engineering itself (don't worry I don't actually build the drone), it's been really interesting getting to know the team and the workflow and applying those same concepts to other areas of my life. It takes a lot to get a group of people on the same page and seeing the community within our team get closer as we experience failures and successes has been really rewarding. In my free time, I love art, working with all kinds of mediums to create graphic designs, animations, and physical artworks, but in general I have a long list of activities that I wish I could have more time for like learning new languages (or strengthening old ones), photography, guitar, taking bike rides through the area and trying out different cafes with friends!`,
            },
        ],
    },
    {
        title: "Flight",
        description:
            "The Flight subsystem handles the aircraft's physical design and construction.",
        members: [
            {
                name: "Karthik Rajagopal",
                grade: 11,
                rank: Rank.PM,
                about: `I am Karthik, a current junior at Tesla STEM highschool. Inside of SUAS I prefer taking a lot of top-level CAD roles and helping with general drone assembly. In planning to become an aerospace engineer SUAS has offered rigorous yet valuable experiences as I prepare for life beyond highschool. Other than SUAS, I enjoy reading various science fiction novels and building robots!`,
            },
            { name: "Pratham Koka", grade: 9, rank: Rank.Member },
            {
                name: "Avnish Dighe",
                grade: 12,
                rank: Rank.Member,
                about: `Hi there!
My name is Avnish Dighe, a Senior at Tesla STEM High School heading to UC Berkeley for Civil & Mechanical Engineering. I enjoy taking on challenging projects and seeking new opportunities to further my knowledge in these exciting fields. On a personal note, I am an Eagle Scout and 3rd Degree Black Belt in Taekwondo. In my free time I enjoy camping, training, and playing guitar. I'm excited to make this thing fly!`,
            },
            { name: "Zifeng (Jeff) Gao", grade: 12, rank: Rank.Member },
        ],
    },
    {
        title: "Avionics",
        description: "The Avionics subsystem develops and integrates onboard electronics.",
        members: [
            {
                name: "Ivana Mohapatra",
                grade: 10,
                rank: Rank.PM,
                about: `My name is Ivana Mohapatra and I'm an engineer and graphic designer. I'm 16 years old and a sophomore at Tesla STEM high school, part of the SUAS team's Avionics subdivision. In my free time, I love biking sketching hyper realistic images, and walking all my friends' dogs since I have none of my own.`,
            },
            {
                name: "Nithin Ganesh",
                grade: 10,
                rank: Rank.Member,
                about: `My name is Nithin, and I'm working toward a future in aerospace engineering. I'm especially drawn to propulsion and energy‑storage systems, the parts of aerospace where physics becomes both elegant and challenging. Flying FPV drones is one of my hobbies, and it is one of my favorite ways to explore flight firsthand. Additionally, I do competitive rocketry which gives me the excitement of turning theory and design into something that actually leaves the ground. When I need a break from designing, testing, or flying, I hop on my bike and enjoy the simple things in life.`,
            },
            {
                name: "Akanksha Revuru",
                grade: 11,
                rank: Rank.Member,
                about: `I'm Akanksha, and I work with the electronic components of the drone. If you see any soldering work, it was most likely done by me or Yu Tane. I think I've inhaled more fumes from that than the oxygen I breathe. When I'm not soldering, I'm probably playing the drums, dying in survival Minecraft, or drawing. SUAS has really helped me grow my teamwork skills--I've never been in this large of a team where everyone has such varied roles. It's also helped me connect with people that I'd otherwise probably never get close to. I'm super excited to keep working and get this drone into the sky!`,
            },
            { name: "Max Xie", grade: 11, rank: Rank.Member },
            { name: "Advay Midha", grade: 10, rank: Rank.Member },
        ],
    },
    {
        title: "Autopilot",
        description: "The Autopilot subsystem develops software for autonomous flight.",
        members: [
            {
                name: "Inesh Dey",
                grade: 12,
                rank: Rank.PM,
                about: `Hello, I'm Inesh Dey, and I'm an avid programmer, who plans to major in Computer Science and/or Engineering. I've been doing robotics for a few years now, having competed in FTC for two, and I've also been involved in volunteering for Ignite Robotics events. I've had experience working with pathing, as well as implementing YOLO (You Only Look Once) models for object detection.

Outside of robotics, and in my free time, I enjoy playing soccer, the guitar (mainly classical), working on personal coding/tech projects and video games. I've repaired and built PCs (including my own), and I love to tinker with tech in general.`,
            },
            {
                name: "Jeswanth Sri Sai Battula",
                grade: 10,
                rank: Rank.Member,
                about: `Hi, I'm Jeswanth, and I serve as a pilot and autopilot team member for SUAS@STEM, our competitive small unmanned aircraft systems team. I'm passionate about aerospace engineering and autonomous flight, and I enjoy working at the intersection of hands-on flying and advanced flight systems. As a pilot, I'm responsible for safely operating our aircraft during testing and competition, maintaining precision and control under pressure. On the autopilot team, I help refine our autonomous systems through mission planning, flight control tuning, and system testing to ensure consistent performance. Outside of SUAS, I'm also involved in competitive VEX Robotics, where I design, build, and program robots for high-level competitions. Robotics has strengthened my analytical thinking and collaborative skills, which carry over into aerospace projects. When I'm relaxing, you can usually find me playing pickup basketball, listening to music, trying new foods with friends, or going on long walks to clear my mind and reset.`,
            },
            {
                name: "Ethan Chan",
                grade: 10,
                rank: Rank.Member,
                about: `Hi, I'm Ethan. I serve as an autopilot team member for SUAS@STEM and am passionate about STEM, especially software and engineering. I have experience with C++ and Python, optimizing performance across hardware multicore, GPU, and SIMD architectures. Since the age of nine, I've developed a variety of apps, technical utilities, and games. Besides software, I apply my skills in SolidWorks, Autodesk Fusion, Blender, and Autodesk Maya in other projects. Outside of STEM, I play piano and violin, swim, and enjoy exploring nature. My goal is to integrate all my engineering skills into projects that push the limits of  technology and design.`,
            },
        ],
    },
    {
        title: "Imaging",
        description: "The Imaging subsystem develops the drone's computer vision capabilities.",
        members: [
            {
                name: "Neel Nevrekar",
                grade: 10,
                rank: Rank.PM,
                about: `Hi! I'm Neel, and I enjoy working on projects that combine teamwork, problem-solving, and real-world impact. In this team, I serve as the imaging project lead. In this role, I help collect and organize datasets and work on training models that allow our system to recognize the mannequin during autonomous missions. I enjoy the collaborative nature of the work, especially brainstorming solutions with teammates and seeing ideas come together through testing and iteration.

Beyond SUAS, I love mentoring younger students and being involved in activities that encourage curiosity and hands-on learning. I've spent time mentoring middle school robotics teams and enjoy helping students build confidence while exploring new challenges. I'm also interested in design and enjoy contributing creatively to projects, especially when they have a meaningful purpose.

In general, I'm someone who enjoys learning by doing and working with others to build things that matter. I'm always excited to take on new challenges, grow through collaboration, and be part of communities that are driven by curiosity and impact.`,
            },
            {
                name: "Zhencheng Lu",
                grade: 10,
                rank: Rank.Member,
                about: `Hi, I'm Zhen. I'm a high schooler who's really into engineering and computer science, and I plan to pursue that in college. I spend a lot of my free time on robotics, tinkering with projects, coding, and figuring out how to solve problems in creative ways, spending probably more than I probably should. Outside of school, I'm passionate about producing music, experimenting with different sounds and styles to bring my thoughts to life, and I also shoot Olympic Trap, which has been a huge part of my life this past year. I competed in a state competition where I earned junior first place and in a national competition where I placed 5th in U15, and those experiences taught me a lot about focus, patience, and staying calm under pressure even when the stakes are higher than winning or losing. When I'm not working on projects or practicing, I enjoy hanging out with friends and listening to music, with Travis Scott and Don Toliver being some of my favorite artists.`,
            },
        ],
    },
    {
        title: "Doc",
        description: "The Doc subsystem manages team documentation and branding.",
        members: [
            {
                name: "Timothy An",
                grade: 10,
                rank: Rank.PM,
                about: `Hello! My name is Timothy An, and I'm currently a sophomore at Tesla STEM High School with aspirations in aerospace/mechanical engineering. Outside of SUAS, I also compete on a private team in VEX V5 Robotics and am a part of my school's TARC (The American Rocketry Challenge) team. Besides conventional engineering activities, I also participate in the Technology Student Association, where I combine my passions with creating and leadership. Artistically, I play both the bassoon and contrabassoon in various ensembles including the Seattle Youth Symphony Orchestra, WMEA's various All-State Honor Groups, and compete in numerous regional and state festivals.`,
            },
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
        () =>
            sections.flatMap((section) =>
                section.members.map((member) => ({ ...member, subsystem: section.title })),
            ),
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

    return (
        <>
            <main style={styles.page} className="font-sans">
                <section style={styles.hero}>
                    <div style={{ maxWidth: 900, margin: "0 auto" }}>
                        <div
                            style={{
                                color: "var(--foreground)",
                                fontWeight: 700,
                                fontSize: "0.95rem",
                                marginBottom: 8,
                            }}
                        >
                            SUAS @Tesla STEM High School
                        </div>
                        <h1 style={styles.heroTitle}>The Flight Crew</h1>
                        <p style={styles.heroSubtitle}>
                            We are a team of eighteen students from Tesla STEM High School, ranked
                            #1 in Washington state and #18 nationally by{" "}
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
                                    {m.rank !== Rank.Member && (
                                        <div style={styles.role}>{m.rank}</div>
                                    )}
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
                        <button
                            type="button"
                            className="member-close"
                            aria-label="Close"
                            onClick={close}
                        >
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
                        <p className="member-role">
                            {getRole(selectedMember.rank, selectedMember.subsystem)}
                        </p>

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
                            <Image src="/images/icons/grade.svg" width={30} height={30} alt="" />
                            <span>{"Grade " + selectedMember.grade}</span>
                        </p>
                        {selectedMember.about ? (
                            <>
                                <hr />
                                <div style={{ height: "10px" }} />
                                <h4>About</h4>
                                <div style={{ height: "10px" }} />
                                <p style={{ whiteSpace: "pre-wrap" }}>{selectedMember.about}</p>
                            </>
                        ) : null}
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
