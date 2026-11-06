"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { observeScrollReveals } from "./workspace-motion";
import type { Lead } from "./workspace";
import "./plaintiff-view.css";

type Status = {
  label: string;
  message: string;
  detail?: string;
  tone: "waiting" | "review" | "active" | "closed";
};
export type PlaintiffRequestKind = "all" | "requests" | "cases";
export type PlaintiffRequestState = "all" | "active" | "closed";

export function plaintiffRequestTitle(lead: Lead) {
  return lead.title?.trim() || `${lead.category} request`;
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
      label: "New case", tone: "active",
      message: `${firm} accepted your request and opened a case.`,
    };
  }
  if (lead.status === "pending_assignment") return {
    label: "Waiting for a law firm", tone: "waiting",
    message: "A law firm hasn’t been assigned yet.",
  };
  if (lead.status === "awaiting_firm_review") return {
    label: "Waiting for a decision", tone: "review",
    message: `${firm} has your request.`,
    detail: "The firm will decide whether it can help. You don’t need to do anything right now.",
  };
  if (lead.status === "declined") return {
    label: "Firm declined", tone: "waiting",
    message: `${firm} did not accept your request.`,
    detail: "An administrator will decide whether to assign another firm or close it. You don’t need to do anything right now.",
  };
  if (lead.status === "closed") return {
    label: "Request closed", tone: "closed",
    message: "Your request was closed. Its details and attached documents are still available here.",
  };
  return { label: "Accepted", tone: "active", message: `${firm} accepted your request.` };
}

const dateFormat = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" });
const updateFormat = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short" });

export function latestPlaintiffNotice(lead: Lead) {
  return [lead.latestNotice, ...(lead.notices ?? [])].reduce<NonNullable<Lead["latestNotice"]> | undefined>((latest, notice) => {
    if (!notice || !Number.isFinite(Date.parse(notice.createdAt))) return latest;
    return !latest || Date.parse(notice.createdAt) > Date.parse(latest.createdAt) ? notice : latest;
  }, undefined);
}

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

function StatusText({ lead }: { lead: Lead }) {
  const status = plaintiffStatus(lead);
  return <span className={`plaintiff-status plaintiff-status-${status.tone}`}>{status.label}</span>;
}

function StartingPoint({ firstName, onStart, locked, hasDraft = false }: {
  firstName: string; onStart: () => void; locked: boolean; hasDraft?: boolean;
}) {
  const start = useRef<HTMLElement>(null);
  useLayoutEffect(() => observeScrollReveals(start.current), []);
  return <section ref={start} className="plaintiff-home-start" aria-labelledby="plaintiff-start-heading">
    <div className="plaintiff-home-start-copy">
      <span className="plaintiff-home-welcome">Welcome{firstName ? `, ${firstName}` : ""}</span>
      <h2 id="plaintiff-start-heading" aria-label="Tell us what you need help with.">{"Tell us what you need help with.".split(" ").map((word, index) => <span aria-hidden="true" className="plaintiff-welcome-word" key={index} style={{ "--word": index } as CSSProperties}><span>{word}</span>{" "}</span>)}</h2>
      <p>Describe your situation so a law firm can review your request. You can follow its progress here.</p>
      <button className="button primary" type="button" onClick={onStart} disabled={locked}>
        {hasDraft ? "Continue request" : "Start a request"} <Arrow />
      </button>
    </div>
    <div className="plaintiff-home-start-guide">
      <span className="plaintiff-home-paper" aria-hidden="true"><DocumentIcon size={34} /></span>
      <h3>Here’s how it works</h3>
      <ol>
        <li data-reveal=""><span>1</span><div><strong>Describe your situation</strong><p>Tell us what happened and the type of help you need.</p></div></li>
        <li data-reveal=""><span>2</span><div><strong>A firm reviews your request</strong><p>Your request is assigned to a law firm for review.</p></div></li>
        <li data-reveal=""><span>3</span><div><strong>Follow progress here</strong><p>If the firm accepts, you can view your case and share documents.</p></div></li>
      </ol>
    </div>
  </section>;
}

function RequestOverview({ leads, onSelect, locked }: {
  leads: Lead[]; onSelect: (id: string, caseId?: string) => void; locked: boolean;
}) {
  const recent = leads.reduce<{ lead: Lead; notice: NonNullable<Lead["latestNotice"]> } | undefined>((latest, lead) => {
    const notice = latestPlaintiffNotice(lead);
    return notice && (!latest || Date.parse(notice.createdAt) > Date.parse(latest.notice.createdAt)) ? { lead, notice } : latest;
  }, undefined);
  const featured = recent?.lead ?? leads.find((lead) => lead.caseId && lead.caseStatus !== "closed")
    ?? leads.find((lead) => lead.status !== "closed" && lead.caseStatus !== "closed") ?? leads[0];
  if (!featured) return null;
  const status = plaintiffStatus(featured);
  return <section className="plaintiff-home-overview motion-enter motion-detail" aria-labelledby="plaintiff-overview-heading">
    <div className="plaintiff-home-overview-heading">
      <span className="plaintiff-home-section-label">{recent ? "Latest correspondence" : "From your requests"}</span>
      <StatusText lead={featured} />
    </div>
    <h2 id="plaintiff-overview-heading">{plaintiffRequestTitle(featured)}</h2>
    <p className="plaintiff-home-overview-meta">{featured.region} · Submitted <time dateTime={featured.createdAt}>{dateFormat.format(new Date(featured.createdAt))}</time></p>
    <p className="plaintiff-home-overview-excerpt">{featured.description}</p>
    {recent && <time className="plaintiff-home-update-date" dateTime={recent.notice.createdAt}>{updateFormat.format(new Date(recent.notice.createdAt))}</time>}
    <p className="plaintiff-home-overview-message">{recent?.notice.message ?? `${status.message}${status.detail ? ` ${status.detail}` : ""}`}</p>
    {!recent && !status.detail && !featured.caseId && featured.status !== "closed" && <p className="plaintiff-home-overview-next-step">
      You don’t need to do anything right now.
    </p>}
    <button className="button primary" type="button" disabled={locked}
      onClick={() => onSelect(featured.id, featured.caseId ?? undefined)}>
      {featured.caseId ? featured.caseStatus === "closed" ? "View case details" : "View case progress" : "View request"} <Arrow />
    </button>
  </section>;
}

export function PlaintiffHome({ leads, loading, selectedId, record, onSelect, onStart, locked, pagination, firstName, hasDraft = false, requestState, onRequestStateChange, pendingRequest, pendingRequestState, requestKind, pendingRequestKind, onRequestKindChange, onResetFilters }: {
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
  onResetFilters: () => void;
  requestKind: PlaintiffRequestKind;
  pendingRequestKind?: PlaintiffRequestKind;
  onRequestKindChange: (kind: PlaintiffRequestKind) => void;
  requestState: PlaintiffRequestState;
  onRequestStateChange: (state: PlaintiffRequestState) => void;
  pendingRequest?: string;
  pendingRequestState?: PlaintiffRequestState;
}) {
  const home = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const reading = useRef<HTMLElement>(null);
  const requestItems = useRef<HTMLDivElement>(null);
  const firstSelection = useRef(true);
  const [railEdges, setRailEdges] = useState({ start: true, end: true });
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  function measureRail() {
    const rail = requestItems.current;
    if (!rail) return;
    const next = { start: rail.scrollLeft <= 2, end: rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2 };
    setRailEdges(current => current.start === next.start && current.end === next.end ? current : next);
    const selected = rail.querySelector<HTMLElement>('[aria-pressed="true"]');
    rail.style.setProperty("--selected-x", `${selected?.offsetLeft ?? 0}px`);
    rail.style.setProperty("--selected-width", `${selected?.offsetWidth ?? 0}px`);
  }

  useLayoutEffect(() => {
    measureRail();
    const observer = new ResizeObserver(() => {
      measureRail();
      const header = document.querySelector(".plaintiff-shell .topbar");
      home.current?.style.setProperty("--plaintiff-header-height", `${header?.getBoundingClientRect().height ?? 80}px`);
    });
    if (requestItems.current) observer.observe(requestItems.current);
    const header = document.querySelector(".plaintiff-shell .topbar");
    if (header) observer.observe(header);
    return () => observer.disconnect();
  }, [leads, selectedId]);

  useLayoutEffect(() => {
    if (firstSelection.current) { firstSelection.current = false; return; }
    if (!selectedId) { window.scrollTo({ top: 0, behavior: reduced() ? "instant" : "smooth" }); return; }
    if (window.scrollY < 100) return;
    const timer = window.setTimeout(() => reading.current?.scrollIntoView({ block: "start", behavior: reduced() ? "instant" : "smooth" }), reduced() ? 0 : 500);
    return () => window.clearTimeout(timer);
  }, [selectedId]);

  useLayoutEffect(() => {
    requestItems.current?.scrollTo({ left: 0, behavior: "instant" });
  }, [requestState, requestKind]);

  useEffect(() => {
    if (!selectedId) heading.current?.focus({ preventScroll: true });
  }, [selectedId]);

  function moveRail(direction: number) {
    const rail = requestItems.current;
    if (rail) rail.scrollBy({ left: direction * rail.clientWidth * .8, behavior: reduced() ? "instant" : "smooth" });
  }

  function finishEntrance() {
    home.current?.getAnimations({ subtree: true }).forEach(animation => {
      if ("animationName" in animation && ["plaintiff-intro-reveal", "plaintiff-request-arrive", "plaintiff-type-letter", "plaintiff-type-cursor", "welcome-word-in", "welcome-paper-in"].includes(String(animation.animationName))) animation.finish();
    });
  }

  const empty = leads?.length === 0 && !selectedId && requestState === "all" && requestKind === "all" && !loading;
  return <div className="plaintiff-home-view" ref={home} onClickCapture={finishEntrance} onKeyDownCapture={finishEntrance}>
    <header className="plaintiff-home-heading">
      <div className="plaintiff-home-introduction">
        <p className="plaintiff-home-greeting">{firstName ? `${firstName}’s workspace` : "Your workspace"}</p>
        <h1 ref={heading} tabIndex={-1} aria-label="My requests & cases">
          <span aria-hidden="true" className="plaintiff-typed-heading">{"My requests & cases".split(" ").map((word, wordIndex) => <span className="plaintiff-heading-word" key={wordIndex}>{Array.from(word).map((letter, index) =>
            <span key={index} style={{ "--letter": index + wordIndex * 4 } as CSSProperties}>{letter}</span>)}{" "}</span>)}<i /></span>
        </h1>
        <p className="plaintiff-home-description">Follow progress and share documents with your law firm.</p>
      </div>
      <button className="button primary plaintiff-start-action" type="button" onClick={onStart} disabled={locked || !leads}>
        <span aria-hidden="true">+</span>{hasDraft ? "Continue request" : "New request"}
      </button>
    </header>
    {!leads ? <div className="plaintiff-home-loading" role="status">{loading ? "Loading your requests…" : "Your requests will appear here once they load."}</div>
      : empty ? <StartingPoint firstName={firstName} onStart={onStart} locked={locked} hasDraft={hasDraft} /> : <>
      <section className="plaintiff-request-navigator" aria-labelledby="plaintiff-requests-heading" aria-busy={loading || !!pendingRequestState || !!pendingRequestKind}>
        <div className="plaintiff-request-toolbar">
          <div className="plaintiff-request-collection-heading"><h2 id="plaintiff-requests-heading">Your matters</h2>
            <span>{leads.length} shown</span></div>
          <div className="plaintiff-request-filter-groups">
          <div className="plaintiff-request-filters plaintiff-kind-filters" role="group" aria-label="Matter type">
            {(["all", "requests", "cases"] as const).map(kind => <button type="button" key={kind}
              aria-pressed={requestKind === kind} aria-busy={pendingRequestKind === kind}
              disabled={locked} onClick={() => onRequestKindChange(kind)}>
              {kind === "all" ? "All" : kind === "requests" ? "Requests" : "Cases"}
            </button>)}
          </div>
          <div className="plaintiff-request-filters" role="group" aria-label="Matter status">
            {(["all", "active", "closed"] as const).map(state => <button type="button" key={state}
              aria-pressed={requestState === state} aria-busy={pendingRequestState === state}
              data-pending={pendingRequestState === state || undefined} disabled={locked} onClick={() => onRequestStateChange(state)}>
              {state === "all" ? "All" : state === "active" ? "Active" : "Closed"}
            </button>)}
          </div>
          </div>
          <div className="plaintiff-rail-controls" role="group" aria-label="Browse requests">
            <button type="button" aria-label="Previous requests" disabled={railEdges.start} onClick={() => moveRail(-1)}>←</button>
            <button type="button" aria-label="Next requests" disabled={railEdges.end} onClick={() => moveRail(1)}>→</button>
          </div>
        </div>
        <p className="visually-hidden" role="status">{loading || pendingRequestState ? "Updating requests…" : "Newest first"}</p>
        <div className="plaintiff-request-items" ref={requestItems} onScroll={measureRail}>
          {!loading && !leads.length && <div className="plaintiff-list-empty" role="status"><p>No {requestState === "all" ? "" : `${requestState} `}{requestKind === "all" ? "matters" : requestKind}.</p>
            <button className="subtle-link" type="button" disabled={locked} onClick={onResetFilters}>Clear filters</button></div>}
          {leads.map((lead, index) => <button className="request-card plaintiff-request-card" key={lead.id} data-matter-id={lead.id} type="button"
            style={{ "--request-order": Math.min(index, 5) } as CSSProperties}
            aria-label={`Open ${lead.caseId ? "case" : "request"}: ${plaintiffRequestTitle(lead)}. ${lead.category}. ${plaintiffStatus(lead).label}. Submitted ${dateFormat.format(new Date(lead.createdAt))}.`}
            aria-pressed={selectedId === lead.id} aria-busy={pendingRequest === lead.id}
            data-pending={pendingRequest === lead.id || undefined} disabled={locked} onClick={() => onSelect(lead.id, lead.caseId ?? undefined)}>
            <span className="request-copy plaintiff-request-copy">
              <strong className="request-title">{plaintiffRequestTitle(lead)}</strong>
              <span className="plaintiff-request-bottom"><span className="plaintiff-matter-kind">{lead.caseId ? "Case" : "Request"}</span><span aria-hidden="true">·</span><StatusText lead={lead} /></span>
            </span>
          </button>)}
          {pagination}
          <span className="plaintiff-rail-indicator" aria-hidden="true" />
        </div>
      </section>
      <section className="workspace-record plaintiff-home-reading" ref={reading} tabIndex={0} aria-label={selectedId ? "Request details" : "Request overview"}>
        <div className="plaintiff-reading-page" key={selectedId ?? "overview"}>
          {selectedId ? record : leads.length ? <RequestOverview leads={leads} onSelect={onSelect} locked={locked} />
            : <div className="plaintiff-overview-empty"><p>{loading ? "Loading your requests…" : `You have no ${requestState} requests.`}</p></div>}
        </div>
      </section>
    </>}
  </div>;
}
