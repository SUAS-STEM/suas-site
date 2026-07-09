import type { Metadata } from "next";
import TeamContent from "./content";

export const metadata: Metadata = {
    title: "Team",
    description: "Meet the SUAS team",
};

export default function TeamPage(): React.ReactElement {
    return <TeamContent />;
}
