import Image from "next/image";
import { ReactElement } from "react";
import { DEFAULT_LINK_TEXT, INTEREST_FORM_URL } from "./data";
import { CardInfo, getSubsystemIcon } from "./types";

export function JoinModal({
    card,
    isClosing,
    onClose,
}: {
    card: CardInfo;
    isClosing: boolean;
    onClose: () => void;
}): ReactElement {
    return (
        <div className={`member-backdrop ${isClosing ? "is-closing" : ""}`} onClick={onClose}>
            <div
                className="member join-modal"
                role="dialog"
                aria-modal="true"
                aria-label={card.title}
                onClick={(e) => e.stopPropagation()}
            >
                <button type="button" className="member-close" aria-label="Close" onClick={onClose}>
                    <Image src="/images/icons/close.svg" width={30} height={30} alt="" aria-hidden="true" />
                </button>
                <div className="member-photo">
                    <div className="join-modal-photo">
                        <Image src={"/images/icons/" + getSubsystemIcon(card.subsystem)} width={48} height={48} alt="" />
                    </div>
                </div>
                <h3 className="member-title">
                    {card.title.toUpperCase()}
                    {card.subtitle ? ` — ${card.subtitle.toUpperCase()}` : ""}
                </h3>
                <hr />
                <div style={{ height: "10px" }} />
                <p>{card.description}</p>
                {card.goodFit ? (
                    <>
                        <div style={{ height: "10px" }} />
                        <h4>Good fit if you:</h4>
                        <ul>
                            {card.goodFit.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </>
                ) : null}
                {card.skills ? (
                    <>
                        <div style={{ height: "10px" }} />
                        <h4>Recommended prior skills in:</h4>
                        <ul>
                            {card.skills.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </>
                ) : null}
                {card.note ? (
                    <>
                        <div style={{ height: "10px" }} />
                        <p className="join-modal-note">{card.note}</p>
                    </>
                ) : null}
                {!card.note || card.url ? (
                    <>
                        <div style={{ height: "16px" }} />
                        <a
                            href={card.url ?? INTEREST_FORM_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="join-modal-apply"
                        >
                            <span>{card.linkText ?? DEFAULT_LINK_TEXT}</span>
                            <Image src="/images/icons/forward.svg" width={16} height={16} alt="" aria-hidden="true" />
                        </a>
                    </>
                ) : null}
            </div>
        </div>
    );
}
