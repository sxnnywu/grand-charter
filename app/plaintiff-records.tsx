"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { isAccessError, messageFor, request } from "./api-client";
import { CaseTools, LeadDocuments } from "./case-tools";
import { plaintiffRequestTitle, plaintiffStatus } from "./plaintiff-view";
import type { Lead } from "./workspace";
import "./plaintiff-records.css";

type SharedProps = {
  lead: Lead;
  locked: boolean;
  onBusyChange: (busy: boolean) => void;
  onAccessLost: () => void;
  refreshVersion: number;
};
export type PlaintiffCaseRecord = {
  id: string;
  leadId: string;
  status: "open" | "in_progress" | "closed";
  firmName: string | null;
  createdAt: string;
};

const dateFormat = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" });
const updateFormat = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short" });

function Arrow({ back = false }: { back?: boolean }) {
  return <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
    <path d={back ? "M20 12H5m6 6-6-6 6-6" : "M4 12h15m-6-6 6 6-6 6"} />
  </svg>;
}

function focusHeading(heading: HTMLHeadingElement | null) {
  heading?.focus({ preventScroll: true });
}

function showDocuments(container: RefObject<HTMLDivElement | null>, caseId?: string) {
  const target = caseId ? container.current?.querySelector<HTMLElement>(`[id="${caseId}-documents-panel"]`)
    : container.current;
  if (!target) return;
  target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  if (caseId) {
    const heading = target.querySelector<HTMLElement>("h3");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      return;
    }
  }
  const control = target.querySelector<HTMLElement>("button:not(:disabled), a[href], input:not([hidden]):not(:disabled)");
  if (control) control.focus({ preventScroll: true });
  else container.current?.focus({ preventScroll: true });
}

function RecordStatus({ lead }: { lead: Lead }) {
  const status = plaintiffStatus(lead);
  return <span className={`plaintiff-status plaintiff-status-${status.tone}`}>{status.label}</span>;
}

function RequestCover({ lead, close, locked }: { lead: Lead; close: () => void; locked: boolean }) {
  return <header className="plaintiff-record-header">
    <div className="plaintiff-file-topline">
      <button className="subtle-link" type="button" disabled={locked} onClick={close}><Arrow back />My requests & cases</button>
      <span>{lead.caseId ? "Case file" : "Request file"}</span>
    </div>
    <div className="plaintiff-record-heading">
      <p className="plaintiff-file-category">{lead.category} · {lead.region}</p>
      <h2 className="record-heading" tabIndex={-1} ref={focusHeading} aria-label={plaintiffRequestTitle(lead)}>
        {plaintiffRequestTitle(lead)}
      </h2>
      <p className="plaintiff-file-preview">{lead.description}</p>
    </div>
    <div className="plaintiff-file-meta">
      <span>Submitted <time dateTime={lead.createdAt}>{dateFormat.format(new Date(lead.createdAt))}</time></span>
      <span>{lead.firmName ?? "No law firm assigned"}</span>
    </div>
  </header>;
}

function AssignmentUpdates({ lead }: { lead: Lead }) {
  const notices = (lead.notices?.length ? [...lead.notices] : lead.latestNotice ? [lead.latestNotice] : [])
    .filter((notice) => Number.isFinite(Date.parse(notice.createdAt)))
    .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt));
  if (!notices.length) return null;
  const [latest, ...earlier] = notices;
  return <section className="plaintiff-record-updates" aria-label="Assignment updates">
    <div className="plaintiff-record-update">
      <div className="plaintiff-correspondence-heading"><h3>Latest update</h3><span aria-hidden="true">↗</span></div>
      <p>{latest.message}</p>
      <time dateTime={latest.createdAt}>{updateFormat.format(new Date(latest.createdAt))}</time>
    </div>
    {earlier.length > 0 && <details className="plaintiff-record-earlier">
      <summary>Earlier updates ({earlier.length})</summary>
      {earlier.map((notice) => <div className="plaintiff-record-update" key={notice.id}>
        <p>{notice.message}</p>
        <time dateTime={notice.createdAt}>{updateFormat.format(new Date(notice.createdAt))}</time>
      </div>)}
    </details>}
  </section>;
}

function RequestDetails({ lead, item }: { lead: Lead; item?: PlaintiffCaseRecord }) {
  return <details className="plaintiff-record-details">
    <summary>Original request and details</summary>
    <div className="plaintiff-record-details-content">
      <p className="plaintiff-record-description">{lead.description}</p>
      <dl className="plaintiff-record-metadata">
        <div><dt>Type of legal help</dt><dd>{lead.category}</dd></div>
        <div><dt>Province</dt><dd>{lead.region}</dd></div>
        <div><dt>Submitted</dt><dd>{dateFormat.format(new Date(lead.createdAt))}</dd></div>
        {item && <>
          <div><dt>Case opened</dt><dd>{dateFormat.format(new Date(item.createdAt))}</dd></div>
          <div className="plaintiff-record-reference"><dt>Case reference</dt><dd>{item.id}</dd></div>
        </>}
      </dl>
    </div>
  </details>;
}

export function PlaintiffLeadDetail({ lead, close, openCase, locked, onBusyChange, onAccessLost, refreshVersion }: SharedProps & {
  close: () => void;
  openCase: (id: string) => void;
}) {
  const status = plaintiffStatus(lead);
  const canUpload = !lead.caseId && lead.status !== "closed";

  return <article className="plaintiff-record motion-enter motion-detail">
    <RequestCover lead={lead} close={close} locked={locked} />
    <div className="plaintiff-record-body">
      <div className="plaintiff-situation-column">
      <section className="plaintiff-record-status" aria-label="Request progress">
        <span className="plaintiff-file-section-label">Where things stand</span>
        <h3>{status.message}</h3>
        {lead.caseId ? <div className="plaintiff-record-actions">
          <button className="button primary" type="button" disabled={locked} onClick={() => lead.caseId && openCase(lead.caseId)}>
            View case <Arrow />
          </button>
        </div> : <p>{status.detail ?? (canUpload ? "You don’t need to do anything right now."
          : "You can still read your request and the documents shared with you.")}</p>}
      </section>
      <AssignmentUpdates lead={lead} />
      </div>
      {!lead.caseId && <div className="plaintiff-record-documents" tabIndex={-1} role="region" aria-label="Supporting documents">
        <LeadDocuments leadId={lead.id} role="plaintiff" canUpload={canUpload} disabled={locked}
          onBusyChange={onBusyChange} onAccessLost={onAccessLost} refreshVersion={refreshVersion} />
      </div>}
      <RequestDetails lead={lead} />
    </div>
  </article>;
}

export function PlaintiffCaseDetail({ id, lead, back, locked, onBusyChange, onAccessLost, onLoaded, refreshVersion, initialCase }: SharedProps & {
  id: string;
  back: () => void;
  onLoaded: (item: PlaintiffCaseRecord) => void;
  initialCase?: PlaintiffCaseRecord;
}) {
  const [item, setItem] = useState<PlaintiffCaseRecord | undefined>(initialCase);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!initialCase);
  const [attempt, setAttempt] = useState(0);
  const tools = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    request<{ case: PlaintiffCaseRecord }>(`/api/cases/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(({ case: record }) => {
        if (controller.signal.aborted) return;
        setItem(record);
        onLoaded(record);
        setError("");
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        if (isAccessError(failure)) onAccessLost();
        else setError(messageFor(failure));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, refreshVersion, onAccessLost, onLoaded, attempt]);

  const currentLead = item ? { ...lead, caseStatus: item.status, firmName: item.firmName } : lead;
  const status = plaintiffStatus(currentLead);

  return <article className="plaintiff-record plaintiff-case motion-enter motion-detail">
    <RequestCover lead={currentLead} close={back} locked={locked} />
    <div className="plaintiff-record-body">
      <div className="plaintiff-situation-column">
        {item && <div className="plaintiff-case-summary">
          <span className="plaintiff-file-section-label">Where things stand</span>
          <h3 className="plaintiff-case-status-heading"><RecordStatus lead={currentLead} /></h3>
          <p className="plaintiff-case-message">{status.message}</p>
          <button className="subtle-link plaintiff-case-documents" type="button" disabled={locked} onClick={() => showDocuments(tools, item.id)}>View documents <Arrow /></button>
        </div>}
        {error && <div className="workspace-message workspace-error" role="alert">{error}{" "}
          <button className="subtle-link" type="button" disabled={locked || loading} onClick={() => setAttempt(value => value + 1)}>{loading ? "Checking…" : "Try again"}</button>
        </div>}
        {item && <AssignmentUpdates lead={lead} />}
      </div>
      {item ? <>
        <div className="plaintiff-case-content" ref={tools} tabIndex={-1} role="region" aria-label="Case progress and documents">
          <CaseTools caseId={item.id} leadId={item.leadId} status={item.status} role="plaintiff"
            disabled={locked || !!error || loading} onBusyChange={onBusyChange}
            onAccessLost={onAccessLost} refreshVersion={refreshVersion}
            onStatusChange={nextStatus => setItem({ ...item, status: nextStatus })} />
        </div>
        <RequestDetails lead={lead} item={item} />
      </> : !error && <p className="plaintiff-record-loading" role="status">Loading your case…</p>}
    </div>
  </article>;
}
