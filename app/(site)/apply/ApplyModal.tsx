"use client";

import Image from "next/image";
import Link from "next/link";
import { getSubsystemIcon } from "../team/types";
import type { CardInfo } from "../team/types";

export function ApplyModal({
  cards,
  title,
  isClosing,
  onClose,
  applicationFormUrl,
}: {
  cards: CardInfo[];
  title: string;
  isClosing: boolean;
  onClose: () => void;
  applicationFormUrl: string;
}) {
  const action = <><span>Apply now</span><Image src="/images/icons/forward.svg" width={16} height={16} alt="" aria-hidden="true" /></>;

  return (
    <div className={`member-backdrop ${isClosing ? "is-closing" : ""}`} onClick={onClose}>
      <div
        className="member join-modal apply-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="member-close" aria-label="Close" onClick={onClose}>
          <Image src="/images/icons/close.svg" width={30} height={30} alt="" aria-hidden="true" />
        </button>
        <div className="member-photo join-modal-photos">
          {cards.map((card) => (
            <div className="join-modal-photo" key={card.subsystem}>
              <Image src={`/images/icons/${getSubsystemIcon(card.subsystem)}`} width={48} height={48} alt="" />
            </div>
          ))}
        </div>
        <h3 className="member-title">{title.toUpperCase()}</h3>
        <hr />
        <div style={{ height: "10px" }} />
        {cards.map((card) => (
          <div key={card.subsystem}>
            {cards.length > 1 ? <h4>{card.subsystem}</h4> : null}
            <p>{card.description}</p>
            {card.goodFit ? (
              <>
                <div style={{ height: "10px" }} />
                <h4>Good fit if you:</h4>
                <ul>{card.goodFit.map((item) => <li key={item}>{item}</li>)}</ul>
              </>
            ) : null}
            {card.skills ? (
              <>
                <div style={{ height: "10px" }} />
                <h4>Recommended prior skills in:</h4>
                <ul>{card.skills.map((item) => <li key={item}>{item}</li>)}</ul>
              </>
            ) : null}
          </div>
        ))}
        <div style={{ height: "16px" }} />
        {applicationFormUrl.startsWith("/") ? (
          <Link href={applicationFormUrl} className="join-modal-apply">{action}</Link>
        ) : (
          <a className="join-modal-apply" href={applicationFormUrl} target="_blank" rel="noopener noreferrer">{action}</a>
        )}
      </div>
    </div>
  );
}
