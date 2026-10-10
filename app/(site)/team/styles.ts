import { CSSProperties } from "react";

export const styles: Record<string, CSSProperties> = {
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
        lineHeight: 1.05,
        fontWeight: 800,
        letterSpacing: "-0.02em",
        marginBottom: "1rem",
    },
    heroSubtitle: {
        maxWidth: 820,
        margin: "0 auto",
        color: "#cfcfcf",
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
        fontWeight: 700,
        letterSpacing: "-0.01em",
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
        display: "flex",
        flexWrap: "wrap",
        gap: "1.25rem",
        alignItems: "flex-start",
        justifyContent: "center",
        marginTop: "1.4rem",
    },
    card: {
        width: 192,
        flex: "0 0 192px",
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
        fontWeight: 700,
        fontSize: "0.95rem",
        color: "var(--foreground)",
        marginBottom: 4,
    },
    role: {
        fontSize: "0.86rem",
        letterSpacing: "0.01em",
        color: "var(--primary-light)",
    },
};
