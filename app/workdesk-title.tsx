import type { CSSProperties } from "react";

export function WorkdeskTitle({ text }: { text: string }) {
  let letter = 0;
  return <span className="workdesk-typed-title" aria-hidden="true">{text.split(" ").map((word, index) =>
    <span className="workdesk-title-word" key={index}>{Array.from(word).map((character, offset) =>
      <span key={offset} style={{ "--letter": letter++ } as CSSProperties}>{character}</span>)}{" "}</span>)}<i /></span>;
}
