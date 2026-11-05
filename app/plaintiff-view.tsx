"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { Lead } from "./workspace";
import "./plaintiff-view.css";

type Status = {
  label: string;
  message: string;
  tone: "waiting" | "review" | "active" | "closed";
};

const titleSegments = new Intl.Segmenter("en", { granularity: "grapheme" });

export function plaintiffRequestTitle(lead: Lead) {
  const firstLine = lead.description.split(/\r?\n/).find((line) => line.trim())?.trim().replace(/\s+/g, " ");
  if (!firstLine) return `${lead.category} request`;
  const sentence = firstLine.match(/^.+?[.!?](?=\s|$)/u)?.[0];
  const excerpt = sentence && Array.from(sentence).length >= 24 ? sentence : firstLine;
  const characters = Array.from(titleSegments.segment(excerpt), ({ segment }) => segment);
  if (characters.length <= 88) return excerpt;
  const shortened = characters.slice(0, 87).join("");
  const wordBoundary = shortened.lastIndexOf(" ");
  return `${(wordBoundary >= shortened.length / 2 ? shortened.slice(0, wordBoundary) : shortened).trimEnd()}…`;
}

export function plaintiffStatus(lead: Lead): Status {
  const firm = lead.firmName ?? "The law firm";
  if (lead.caseId) {
    if (lead.caseStatus === "closed") return {
      label: "Case closed", tone: "closed",
      message: "Your case is closed. You can still view its details and documents.",
    };
    if (lead.caseStatus === "in_progress") return {
      label: "In progress", tone: "active", message: `${firm} is working on your case.`,
    };
    return {
      label: "Case opened", tone: "active",
      message: `${firm} accepted your request and opened a case.`,
    };
  }
  if (lead.status === "pending_assignment") return {
    label: "Waiting for a law firm", tone: "waiting",
    message: "An administrator will assign a law firm to your request.",
  };
  if (lead.status === "awaiting_firm_review") return {
    label: "Waiting for a decision", tone: "review",
    message: `${firm} has received your request and will decide whether it can help.`,
  };
  if (lead.status === "declined") return {
    label: "Firm declined", tone: "waiting",
    message: `${firm} did not accept your request. An administrator will decide whether to assign another firm or close it.`,
  };
  if (lead.status === "closed") return {
    label: "Request closed", tone: "closed",
    message: "Your request was closed. Its details and attached documents are still available here.",
  };
  return { label: "Accepted", tone: "active", message: `${firm} accepted your request.` };
}

const dateFormat = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" });

function DocumentIcon({ size = 20 }: { size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3h8l4 4v13H6ZM14 3v5h4m-8 5h4m-4 4h4" />
  </svg>;
}

function Arrow() {
  return <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12h15m-6-6 6 6-6 6" />
  </svg>;
}

function StatusBadge({ lead }: { lead: Lead }) {
  const status = plaintiffStatus(lead);
  return <span className={`plaintiff-status plaintiff-status-${status.tone}`}>{status.label}</span>;
}

function StartingPoint({ firstName, onStart, locked, hasDraft = false }: {
  firstName: string; onStart: () => void; locked: boolean; hasDraft?: boolean;
}) {
  return <section className="plaintiff-home-start motion-enter motion-detail" aria-labelledby="plaintiff-start-heading">
    <div className="plaintiff-home-start-copy">
      <span className="plaintiff-home-welcome">Welcome{firstName ? `, ${firstName}` : ""}</span>
      <h2 id="plaintiff-start-heading">Tell us what you need help with.</h2>
      <p>Describe your situation so a law firm can review your request. You can follow its progress here.</p>
      <button className="button primary" type="button" onClick={onStart} disabled={locked}>
        {hasDraft ? "Continue request" : "Start a request"} <Arrow />
      </button>
    </div>
    <div className="plaintiff-home-start-guide">
      <span className="plaintiff-home-paper" aria-hidden="true"><DocumentIcon size={34} /></span>
      <h3>Here’s how it works</h3>
      <ol>
        <li><span>1</span><div><strong>Describe your situation</strong><p>Tell us what happened and the type of help you need.</p></div></li>
        <li><span>2</span><div><strong>A firm reviews your request</strong><p>Your request is assigned to a law firm for review.</p></div></li>
        <li><span>3</span><div><strong>Follow progress here</strong><p>If the firm accepts, you can view your case and share documents.</p></div></li>
      </ol>
    </div>
  </section>;
}

function RequestOverview({ leads, onSelect, locked }: {
  leads: Lead[]; onSelect: (id: string, caseId?: string) => void; locked: boolean;
}) {
  const featured = leads.find((lead) => lead.caseId && lead.caseStatus !== "closed")
    ?? leads.find((lead) => lead.status !== "closed" && lead.caseStatus !== "closed") ?? leads[0];
  if (!featured) return null;
  const status = plaintiffStatus(featured);
  return <section className="plaintiff-home-overview motion-enter motion-detail" aria-labelledby="plaintiff-overview-heading">
    <div className="plaintiff-home-overview-heading">
      <span className="plaintiff-home-section-label">Where things stand</span>
      <StatusBadge lead={featured} />
    </div>
    <h2 id="plaintiff-overview-heading">{plaintiffRequestTitle(featured)}</h2>
    <p className="plaintiff-home-overview-meta">{featured.category} · {featured.region} · Submitted <time dateTime={featured.createdAt}>{dateFormat.format(new Date(featured.createdAt))}</time></p>
    <p className="plaintiff-home-overview-message">{status.message}</p>
    {!featured.caseId && featured.status !== "closed" && <p className="plaintiff-home-overview-next-step">
      You don’t need to do anything right now. Supporting PDFs are optional.
    </p>}
    <button className="button primary" type="button" disabled={locked}
      onClick={() => onSelect(featured.id, featured.caseId ?? undefined)}>
      {featured.caseId ? featured.caseStatus === "closed" ? "View case details" : "View case progress" : "View request"} <Arrow />
    </button>
    {featured.latestNotice && <div className="plaintiff-home-notice">
      <span>Update on <time dateTime={featured.latestNotice.createdAt}>{dateFormat.format(new Date(featured.latestNotice.createdAt))}</time></span>
      <p>{featured.latestNotice.message}</p>
    </div>}
    <p className="plaintiff-home-overview-hint">Open any request from your list to see its details and documents.</p>
  </section>;
}

export function PlaintiffHome({ leads, loading, selectedId, record, onSelect, onStart, locked, pagination, firstName, hasDraft = false }: {
  leads: Lead[] | undefined;
  loading: boolean;
  selectedId?: string;
  record: ReactNode;
  onSelect: (id: string, caseId?: string) => void;
  onStart: () => void;
  locked: boolean;
  pagination: ReactNode;
  firstName: string;
  hasDraft?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!selectedId) heading.current?.focus({ preventScroll: true });
  }, [selectedId]);
  const empty = leads?.length === 0 && !selectedId;
  return <div className="plaintiff-home-view">
    <header className="page-heading split-heading plaintiff-home-heading">
      <div><h1 ref={heading} tabIndex={-1}>My requests</h1><p>Your requests, case progress, and documents.</p></div>
    </header>
    {!leads ? <div className="plaintiff-home-loading" role="status">
      {loading ? "Loading your requests…" : "Your requests will appear here once they load."}
    </div> : empty ? <StartingPoint firstName={firstName} onStart={onStart} locked={locked} hasDraft={hasDraft} /> : (
      <div className={`bookshelf plaintiff-home-bookshelf${selectedId ? " has-selection" : ""}`}>
        <section className="bookshelf-index request-list plaintiff-home-index" aria-labelledby="plaintiff-requests-heading" aria-busy={loading}>
          <div className="card-heading"><h2 id="plaintiff-requests-heading">Your requests</h2></div>
          {leads.map((lead) => <button className="request-card plaintiff-request-card" key={lead.id} type="button"
            aria-label={`Open ${lead.caseId ? "case" : "request"}: ${plaintiffRequestTitle(lead)}. ${lead.category}. ${plaintiffStatus(lead).label}. Submitted ${dateFormat.format(new Date(lead.createdAt))}.`}
            aria-pressed={selectedId === lead.id} disabled={locked} onClick={() => onSelect(lead.id, lead.caseId ?? undefined)}>
            <span className="plaintiff-request-icon"><DocumentIcon /></span>
            <span className="request-copy plaintiff-request-copy">
              <strong className="request-title">{plaintiffRequestTitle(lead)}</strong>
              <span className="plaintiff-request-category">{lead.category}</span>
              <span className="plaintiff-request-firm">{lead.firmName ?? "No law firm assigned"}</span>
              <StatusBadge lead={lead} />
              <small>{lead.region} · Submitted <time dateTime={lead.createdAt}>{dateFormat.format(new Date(lead.createdAt))}</time></small>
            </span>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65"><path d="m9 6 6 6-6 6" /></svg>
          </button>)}
          {pagination}
        </section>
        <section className="bookshelf-reading workspace-record plaintiff-home-reading" aria-label={selectedId ? "Request details" : "Request overview"} key={selectedId ?? "overview"}>
          {selectedId ? record : <RequestOverview leads={leads} onSelect={onSelect} locked={locked} />}
        </section>
      </div>
    )}
  </div>;
}
