import React from "react";
import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
    title: "Team",
    description: "Meet the SUAS team",
};

type Member = {
    name: string;
    role: string;
    imgSrc?: string;
};

const placeholder = "/logo.png"; // public asset used as placeholder for photos

const sections: { title: string; members: Member[] }[] = [
    {
        title: "Leadership",
        members: [
            { name: "Wenxin Fang", role: "Project Manager", imgSrc: "/images/image-16.png" },
            { name: "Iris Dey", role: "Management Lead", imgSrc: "/images/image-6.png" },
            { name: "Arnav Mittal", role: "Software Lead", imgSrc: "/images/image-3.png" },
            { name: "Yu Tane Quah", role: "Operations Lead", imgSrc: "/images/image-36.png" },
        ],
    },
    {
        title: "Flight Subsystem",
        members: [
            { name: "Karthik Rajagopal", role: "Flight PM", imgSrc: "/images/image-9.png" },
            { name: "Nithin Ganesh", role: "Flight Member", imgSrc: "/images/image-12.png" },
            { name: "Max Xie", role: "Flight Member", imgSrc: "/images/image-10.png" },
            { name: "Akanksha Revuru", role: "Flight Member", imgSrc: "/images/image-2.png" },
            { name: "Advay Midha", role: "Flight Member", imgSrc: "/images/image-1.png" },
        ],
    },
    {
        title: "Autopilot Subsystem",
        members: [
            { name: "Jeswanth Sri Sai Battula", role: "Autopilot PM", imgSrc: "/images/image-7.png" },
            { name: "Ethan Chan", role: "Autopilot Member", imgSrc: "/images/image-4.png" },
            { name: "Timur Tilabaev", role: "Autopilot Member", imgSrc: "/images/image-19.png" },
            { name: "Reyansh Rastogi", role: "Autopilot Member", imgSrc: "/images/image-13.png" },
            { name: "Neev Jobanputra", role: "Autopilot Member", imgSrc: "/images/image-20.png" },
        ],
    },
    {
        title: "Imaging Subsystem",
        members: [
            { name: "Kaira Massand", role: "Imaging PM", imgSrc: "/images/image-8.png" },
            { name: "Yichen Qian", role: "Imaging Member", imgSrc: "/images/image-17.png" },
            { name: "Zhencheng Lu", role: "Imaging Member", imgSrc: "/images/image-18.png" },
        ],
    },
    {
        title: "Web Subsystem",
        members: [
            { name: "Neel Nevrekar", role: "Web PM", imgSrc: "/images/image-11.png" },
            { name: "Inesh Dey", role: "Web & Autopilot Member", imgSrc: "/images/image-5.png" },
        ],
    },
    {
        title: "Doc Subsystem",
        members: [
            { name: "Timothy An", role: "Doc PM", imgSrc: "/images/image-14.png" },
            { name: "Ved Agrawal", role: "Doc Member", imgSrc: "/images/image-15.png" },
        ],
    },
];

const styles: Record<string, React.CSSProperties> = {
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
        /* Use fixed minimum card widths and center the whole grid so rows with fewer
           than the max columns will be centered rather than stretched. */
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: "1.25rem",
        alignItems: "start",
        justifyContent: "center",
        justifyItems: "center",
        marginTop: "1.4rem",
    },
    card: {
        background: "transparent",
        borderRadius: 12,
        padding: "1rem",
        textAlign: "center",
    },
    photoWrap: {
        width: 160,
        height: 160,
        borderRadius: "999px",
        overflow: "hidden",
        margin: "0 auto 0.85rem",
        boxShadow: "0 10px 18px rgba(0,0,0,0.6)",
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

export default function TeamPage(): React.ReactElement {
    return (
        <main style={styles.page} className="font-sans">
            <section style={styles.hero}>
                <div style={{ maxWidth: 900, margin: "0 auto" }}>
                    <div style={{ color: "var(--foreground)", fontWeight: 700, fontSize: "0.95rem", marginBottom: 8 }}>
                        SUAS @Tesla Stem High School
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
                    <div style={styles.grid}>
                        {sec.members.map((m) => (
                            <div key={m.name} style={styles.card}>
                                <div style={styles.photoWrap}>
                                    <Image src={m.imgSrc ?? placeholder} alt={m.name} width={160} height={160} style={{ objectFit: "cover" }} />
                                </div>
                                <div style={styles.name}>{m.name}</div>
                                <div style={styles.role}>{m.role}</div>
                            </div>
                        ))}
                    </div>
                </section>
            ))}
        </main>
    );
}