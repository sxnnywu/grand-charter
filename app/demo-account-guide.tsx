"use client";

import { useRef } from "react";
import "./demo-account-guide.css";

const groups = [
  { name: "Plaintiffs", accounts: [
    { email: "maya@example.com", name: "Maya Patel", role: "Plaintiff · Returning user",
      start: ["One request waiting for a law firm’s decision.", "One case in progress."],
      try: "Check progress and share PDFs." },
    { email: "jordan@example.com", name: "Jordan Lee", role: "Plaintiff · New user",
      start: ["No requests yet."],
      try: "Submit a request for legal help." },
  ] },
  { name: "Law firms", note: "Attorneys and paralegals share their firm’s inbox and cases.", accounts: [
    { email: "alex@example.com", name: "Alex Chen", role: "Attorney · Northline Legal",
      start: ["One request to review."],
      try: "Accept or decline a request." },
    { email: "priya@example.com", name: "Priya Shah", role: "Paralegal · Northline Legal",
      start: ["One request to review."],
      try: "Review requests and work on cases." },
    { email: "sofia@example.com", name: "Sofia Martin", role: "Attorney · Harbour Law",
      start: ["One case in progress."],
      try: "Update progress, share PDFs, and add private notes." },
  ] },
  { name: "Admin", accounts: [
    { email: "morgan@example.com", name: "Morgan Ellis", role: "Platform admin",
      start: ["Requests and cases from both firms."],
      try: "Assign requests, move cases between firms, and view change history." },
  ] },
];

export function DemoAccountGuide({ accounts, unavailable, disabled, selectedEmail, onChoose }: {
  accounts: { email: string; name: string }[] | undefined;
  unavailable: boolean;
  disabled: boolean;
  selectedEmail: string;
  onChoose: (email: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const choice = useRef<string | undefined>(undefined);
  const startedOutside = useRef(false);
  const outside = (x: number, y: number) => {
    const bounds = dialog.current?.getBoundingClientRect();
    return !!bounds && (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom);
  };

  return <>
    <button className="subtle-link demo-account-explore" type="button" disabled={disabled}
      aria-haspopup="dialog" onClick={() => {
        dialog.current?.showModal();
        heading.current?.focus({ preventScroll: true });
      }}>About the demo accounts <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v.01" /></svg></button>
    <dialog className="demo-account-dialog" ref={dialog} aria-labelledby="demo-account-guide-title"
      aria-describedby="demo-account-guide-intro" onClose={() => {
        const email = choice.current;
        choice.current = undefined;
        if (email) onChoose(email);
      }} onPointerDown={(event) => {
        startedOutside.current = event.target === event.currentTarget && outside(event.clientX, event.clientY);
      }} onClick={(event) => {
        if (startedOutside.current && event.target === event.currentTarget && outside(event.clientX, event.clientY)) dialog.current?.close();
        startedOutside.current = false;
      }}>
      <header className="demo-account-guide-heading">
        <div>
          <h2 id="demo-account-guide-title" ref={heading} tabIndex={-1}>About the demo accounts</h2>
          <p id="demo-account-guide-intro">Choose what you’d like to try.</p>
        </div>
        <button className="icon-button" type="button" aria-label="Close demo account guide" onClick={() => dialog.current?.close()}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </header>
      <div className="demo-account-guide-content">
        <p className="demo-account-guide-note">This describes each account before testing. Your changes are saved.</p>
        {!accounts && <p className="demo-account-availability" role="status">{unavailable
          ? "Accounts could not be loaded. Close this guide and choose Try again on sign-in."
          : "Loading available accounts…"}</p>}
        {accounts?.length === 0 && <p className="demo-account-availability" role="status">No demo accounts are available. Check the setup instructions.</p>}
        {groups.map((group) => <section className="demo-account-guide-group" key={group.name} aria-label={group.name}>
          <h3>{group.name}</h3>
          {group.note && <p className="demo-account-group-note">{group.note}</p>}
          {group.accounts.map((profile) => {
            const available = accounts?.find((account) => account.email === profile.email);
            const name = available?.name ?? profile.name;
            return <article className="demo-account-profile" key={profile.email}>
              <div className="demo-account-identity">
                <h4>{name}</h4>
                <p>{profile.role}</p>
                {selectedEmail === profile.email && <span className="demo-account-selected">Selected</span>}
              </div>
              <dl className="demo-account-context">
                <div><dt>Starts with</dt><dd><ul>{profile.start.map((item) => <li key={item}>{item}</li>)}</ul></dd></div>
                <div><dt>Try</dt><dd>{profile.try}</dd></div>
              </dl>
              <button className="button small" type="button" disabled={disabled || !available}
                aria-label={`Choose ${name}`} onClick={() => {
                  choice.current = profile.email;
                  dialog.current?.close();
                }}>Choose account</button>
            </article>;
          })}
        </section>)}
      </div>
      <footer className="demo-account-guide-footer">Choose an account, then select Sign in.</footer>
    </dialog>
  </>;
}
