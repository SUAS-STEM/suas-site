import Image from "next/image";
import { ReactElement } from "react";
import { MemberPhoto } from "./MemberPhoto";
import { Member, Rank, getRole, getSubsystemIcon } from "./types";

export function MemberModal({
    member,
    isClosing,
    switchClass,
    onClose,
    onPrevious,
    onNext,
}: {
    member: Member;
    isClosing: boolean;
    switchClass: string;
    onClose: () => void;
    onPrevious: () => void;
    onNext: () => void;
}): ReactElement {
    return (
        <div className={`member-backdrop ${isClosing ? "is-closing" : ""}`} onClick={onClose}>
            <button
                type="button"
                className="member-nav member-nav-left"
                aria-label="Previous member"
                onClick={(event) => {
                    event.stopPropagation();
                    onPrevious();
                }}
            >
                <Image src="/images/icons/back.svg" alt="" width={30} height={30} aria-hidden="true" />
            </button>
            <div
                key={`${member.name}-${member.subsystem}`}
                className={`member ${switchClass}`}
                role="dialog"
                aria-modal="true"
                aria-label={member.displayName ?? member.name}
                onClick={(e) => e.stopPropagation()}
            >
                <button type="button" className="member-close" aria-label="Close" onClick={onClose}>
                    <Image src="/images/icons/close.svg" width={30} height={30} alt="" aria-hidden="true" />
                </button>
                <div className="member-photo">
                    <MemberPhoto name={member.name} size={300} />
                </div>
                <h3 className="member-title">{(member.displayName ?? member.name).toUpperCase()}</h3>
                {member.rank === Rank.Member && member.subsystem === "Software" ? null : (
                    <p className="member-role">{getRole(member.rank, member.subsystem, member.softwareRole)}</p>
                )}

                <div style={{ height: "10px" }}></div>
                <hr />
                <p className="member-data">
                    <Image src={"/images/icons/" + getSubsystemIcon(member.subsystem)} width={30} height={30} alt="" />
                    <span>{member.subsystem}</span>
                </p>
                <hr />
                <p className="member-data">
                    <Image src="/images/icons/grade.svg" width={30} height={30} alt="" />
                    <span>{"Grade " + member.grade}</span>
                </p>
                {member.about ? (
                    <>
                        <hr />
                        <div style={{ height: "10px" }} />
                        <h4>About</h4>
                        <div style={{ height: "10px" }} />
                        <p style={{ whiteSpace: "pre-wrap" }}>{member.about}</p>
                    </>
                ) : null}
            </div>
            <button
                type="button"
                className="member-nav member-nav-right"
                aria-label="Next member"
                onClick={(event) => {
                    event.stopPropagation();
                    onNext();
                }}
            >
                <Image src="/images/icons/forward.svg" alt="" width={30} height={30} aria-hidden="true" />
            </button>
        </div>
    );
}
