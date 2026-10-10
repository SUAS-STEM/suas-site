export enum Rank {
    Member = "Member",
    Lead = "Lead",
    CoLead = "Co-Lead",
    OperationsLead = "Operations Lead",
    TeamLead = "Lead Project Manager",
    ProjectManager = "Project Manager",
    OperationsManager = "Operations Manager",
    TechnicalManager = "Technical Manager",
    FinancialManager = "Financial Manager",
}

export type Member = {
    name: string;
    displayName?: string;
    grade: number;
    rank: Rank;
    about?: string;
    subsystem?: string;
    softwareRole?: "Autopilot" | "Imaging";
};

export type CardInfo = {
    subsystem: string;
    title: string;
    subtitle?: string;
    linkText?: string;
    description: string;
    goodFit?: string[];
    skills?: string[];
    note?: string;
    placement?: "start" | "end";
    url?: string;
};

export function getMemberImageSrc(name: string): string {
    return `/images/members/${name.toLowerCase().replaceAll(" ", "_")}.png`;
}

export function isSubsystemLead(rank: Rank): boolean {
    return rank === Rank.Lead || rank === Rank.CoLead;
}

export function getRole(rank: Rank, subsystem?: string, softwareRole?: Member["softwareRole"]): string {
    let title: string;
    if (rank === Rank.Member) {
        return subsystem === "Software" && softwareRole
            ? ""
            : `${subsystem ?? ""} Member`.trim();
    }
    else if (rank === Rank.Lead) title = `${subsystem ?? ""} Lead`.trim();
    else if (rank === Rank.CoLead) title = `${subsystem ?? ""} Co-Lead`.trim();
    else if (rank === Rank.OperationsLead) title = "Operations Lead";
    else if (rank === Rank.TeamLead) title = "Lead Project Manager";
    else if (rank === Rank.ProjectManager) title = "Project Manager";
    else if (rank === Rank.OperationsManager) title = "Operations Manager";
    else if (rank === Rank.TechnicalManager) title = "Technical Manager";
    else if (rank === Rank.FinancialManager) title = "Financial Manager";
    else title = rank;

    return title;
}

const subsystemIcons: Record<string, string> = {
    Flight: "flight.svg",
    Avionics: "avionics.svg",
    Software: "software.svg",
    Autopilot: "autopilot.svg",
    Imaging: "imaging.svg",
    Doc: "doc.svg",
    Leadership: "board.svg",
};

export function getSubsystemIcon(subsystem?: string): string {
    if (!subsystem) return "default.svg";
    return subsystemIcons[subsystem] ?? "default.svg";
}
