"use client";

import { useEffect, useRef, useState } from "react";
import { isAccessError, messageFor, request } from "./api-client";
import { CaseTools, LeadDocuments } from "./case-tools";
import type { Lead } from "./workspace";
import "./firm-records.css";

type CaseStatus = "open" | "in_progress" | "closed";
type SharedProps = {
  lead: Lead;
  role?: "attorney" | "paralegal";
  locked: boolean;
  onBusyChange: (busy: boolean) => void;
  onAccessLost: () => void;
  refreshVersion: number;
  onDraftChange?: (dirty: boolean) => void;
  drawer?: boolean;
};
export type FirmCaseRecord = {
  id: string;
  leadId: string;
  name: string;
  category: string;
  region: string;
  firmName: string | null;
  createdAt: string;
  status: CaseStatus;
};

const dateFormat = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" });
const segments = new Intl.Segmenter("en", { granularity: "grapheme" });
const labels: Record<Lead["status"] | CaseStatus, string> = {
  pending_assignment: "Pending assignment", awaiting_firm_review: "Needs review", accepted: "Accepted",
  declined: "Declined", open: "New case", in_progress: "In progress", closed: "Closed",
};

export function firmIssueExcerpt(description: string, limit = 140) {
  const line = description.split(/\r?\n/).find((part) => part.trim())?.trim().replace(/\s+/g, " ") ?? "";
  const sentence = line.match(/^.+?[.!?](?=\s|$)/u)?.[0];
  const text = sentence && Array.from(sentence).length >= 24 ? sentence : line;
  const characters = Array.from(segments.segment(text), ({ segment }) => segment);
  if (characters.length <= limit) return text;
  const shortened = characters.slice(0, limit - 1).join("");
  const boundary = shortened.lastIndexOf(" ");
  return `${(boundary > shortened.length / 2 ? shortened.slice(0, boundary) : shortened).trimEnd()}…`;
}

export function FirmStatusBadge({ status }: { status: Lead["status"] | CaseStatus }) {
  const tone = status === "accepted" || status === "open" || status === "in_progress" ? "active"
    : status === "closed" || status === "declined" ? "quiet" : "review";
  return <span className={`firm-status-badge firm-status-${tone}`}>{labels[status]}</span>;
}

function Arrow({ back = false }: { back?: boolean }) {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
    <path d={back ? "M20 12H5m6 6-6-6 6-6" : "M4 12h15m-6-6 6 6-6 6"} />
  </svg>;
}

function focusHeading(heading: HTMLHeadingElement | null) {
  heading?.focus({ preventScroll: true });
}

function RecordDetails({ lead, item }: { lead: Lead; item?: FirmCaseRecord }) {
  return <details className="firm-record-details">
    <summary>{item ? "Original intake and record details" : "Record details"}</summary>
    <div className="firm-record-details-body">
      {item && <p className="firm-record-narrative">{lead.description}</p>}
      <dl className="firm-record-metadata">
        <div><dt>Submitted</dt><dd>{dateFormat.format(new Date(lead.createdAt))}</dd></div>
        <div><dt>Assigned firm</dt><dd>{item ? item.firmName ?? "Unassigned" : lead.firmName ?? "Unassigned"}</dd></div>
        {item && <div><dt>Case opened</dt><dd>{dateFormat.format(new Date(item.createdAt))}</dd></div>}
        <div className="firm-record-reference"><dt>Lead reference</dt><dd>{lead.id}</dd></div>
        {item && <div className="firm-record-reference"><dt>Case reference</dt><dd>{item.id}</dd></div>}
      </dl>
    </div>
  </details>;
}

export function FirmLeadDetail({ lead, role = "attorney", onBack, onOpenCase, onReviewNext, hasNextReview,
  decision, decisionError, decisionNotice, onDecide, locked, onBusyChange, onAccessLost, refreshVersion, drawer = false }: SharedProps & {
  onBack: () => void;
  onOpenCase: () => void;
  onReviewNext: () => void;
  hasNextReview: boolean;
  decision?: "accept" | "decline";
  decisionError: string;
  decisionNotice?: "accepted" | "declined";
  onDecide: (decision: "accept" | "decline") => void;
}) {
  const declineDialog = useRef<HTMLDialogElement>(null);
  const outcome = useRef<HTMLHeadingElement>(null);
  const transferReview = lead.reviewTransfer || !!lead.transfer && lead.transfer.toFirmId === lead.firmId && lead.transfer.status === "accepted";
  const accepted = lead.status === "accepted" && !!lead.caseId;

  useEffect(() => {
    if (!decisionNotice || !outcome.current) return;
    outcome.current.focus({ preventScroll: true });
    outcome.current.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "nearest" });
  }, [decisionNotice, lead.id]);

  return <article className={`firm-record${drawer ? " is-in-panel" : ""}`}>
    <header className="firm-record-header">
      {!drawer && <button className="subtle-link firm-record-back" type="button" disabled={locked} onClick={onBack}><Arrow back />Back to leads</button>}
      {!drawer && <div className="firm-record-title">
        <h2 className="record-heading" tabIndex={-1} ref={focusHeading}>{lead.name}</h2>
        <FirmStatusBadge status={lead.status} />
      </div>}
      <p className="firm-record-context">{lead.category} · {lead.region} · Submitted <time dateTime={lead.createdAt}>{dateFormat.format(new Date(lead.createdAt))}</time></p>
      <a className="subtle-link firm-record-email" href={`mailto:${lead.email}`}>{lead.email}</a>
    </header>
    <div className="firm-record-body">
      {decisionNotice && <section className={`firm-record-outcome${decisionNotice === "declined" ? " firm-record-outcome-neutral" : ""}`} role="status">
        <h3 tabIndex={-1} ref={outcome}>{decisionNotice === "accepted" ? transferReview ? "Transfer accepted. Case added." : "Lead accepted. Case created." : transferReview ? "Transfer declined." : "Lead declined."}</h3>
        {decisionNotice === "declined" && <p>{transferReview ? `${lead.transfer?.fromFirmName} continues handling this case. An admin will review the declined transfer.` : "An admin will decide whether to assign another firm or close the lead."}</p>}
        <div className="firm-record-outcome-actions">
          {accepted && <button className="button primary" type="button" disabled={locked} onClick={onOpenCase}>Open case <Arrow /></button>}
          {hasNextReview && <button className="button" type="button" disabled={locked} onClick={onReviewNext}>Review next lead <Arrow /></button>}
          {!hasNextReview && <span>No more leads in the current review list.</span>}
        </div>
      </section>}
      {lead.reviewTransfer && <section className="firm-transfer-context"><h3>Case transfer for review</h3><p>{lead.transfer?.fromFirmName} is the current firm. Accepting transfers this existing case to your firm and keeps its progress. Until then, you can review the intake and plaintiff-uploaded PDFs.</p></section>}
      <section className="firm-record-inquiry" aria-label="Original inquiry">
        <h3>What they need help with</h3>
        <p className="firm-record-narrative">{lead.description}</p>
      </section>
      {!lead.caseId && <section className="firm-record-documents" aria-label="Supporting documents">
        <LeadDocuments leadId={lead.id} role={role} canUpload={false} disabled={locked}
          onBusyChange={onBusyChange} onAccessLost={onAccessLost} refreshVersion={refreshVersion} />
      </section>}
      <RecordDetails lead={lead} />
      {decisionError && <p className="workspace-message workspace-error" role="alert">{decisionError}</p>}
    </div>
    {lead.status === "awaiting_firm_review" ? <footer className="firm-review-footer">
      <p>{lead.reviewTransfer ? "Accepting transfers the existing case to your firm." : "Accepting creates a case for your firm."}</p>
      <div className="firm-review-actions">
        <button className="button danger" type="button" disabled={locked} onClick={() => declineDialog.current?.showModal()}>
          {decision === "decline" ? "Declining…" : lead.reviewTransfer ? "Decline transfer" : "Decline lead"}
        </button>
        <button className="button primary" type="button" disabled={locked} onClick={() => onDecide("accept")}>
          {decision === "accept" ? "Accepting…" : lead.reviewTransfer ? "Accept transfer" : "Accept lead"}
        </button>
      </div>
    </footer> : !decisionNotice && accepted ? <footer className="firm-review-footer firm-review-accepted">
      <p>This lead was accepted. Its case holds current progress and shared documents.</p>
      <button className="button primary" type="button" disabled={locked} onClick={onOpenCase}>Open case <Arrow /></button>
    </footer> : !decisionNotice && lead.status === "declined" ? <footer className="firm-review-footer">
      <p>Waiting for admin review. Your firm can view this lead while it remains assigned.</p>
    </footer> : null}
    <dialog ref={declineDialog} aria-labelledby="firm-decline-title" aria-describedby="firm-decline-description">
      <div className="dialog-head"><h2 id="firm-decline-title">Decline this lead?</h2></div>
      <div className="dialog-body"><p id="firm-decline-description">{lead.reviewTransfer ? `${lead.transfer?.fromFirmName} keeps the case. The transfer returns to admin for review.` : "The lead will go to admin review. An admin can assign it again or close it. Your firm can still view it while assigned."}</p></div>
      <form method="dialog" className="dialog-footer">
        <button className="button" type="submit">Cancel</button>
        <button className="button primary danger" type="button" disabled={locked} onClick={() => {
          declineDialog.current?.close();
          onDecide("decline");
        }}>Decline lead</button>
      </form>
    </dialog>
  </article>;
}

export function FirmCaseDetail({ id, lead, role = "attorney", onBack, locked, onBusyChange, onAccessLost,
  refreshVersion, onStatusChange, onLoaded, onDraftChange, drawer = false, initialRecord }: SharedProps & {
  id: string;
  onBack: () => void;
  onStatusChange: (status: CaseStatus) => void;
  onLoaded?: (snapshot: FirmCaseRecord) => void;
  initialRecord?: FirmCaseRecord;
}) {
  const [loadedItem, setItem] = useState<FirmCaseRecord | undefined>(() => initialRecord?.id === id ? initialRecord : undefined);
  const item = loadedItem?.id === id ? loadedItem : undefined;
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!loadedItem);
  const prepared = useRef(initialRecord?.id === id ? initialRecord : undefined);
  const [attempt, setAttempt] = useState(0);
  const callbacks = useRef({ onAccessLost, onLoaded });
  callbacks.current = { onAccessLost, onLoaded };

  useEffect(() => {
    if (prepared.current?.id === id) {
      const record = prepared.current;
      prepared.current = undefined;
      callbacks.current.onLoaded?.(record);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    request<{ case: FirmCaseRecord }>(`/api/cases/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(({ case: record }) => {
        if (controller.signal.aborted) return;
        setItem(record);
        setError("");
        callbacks.current.onLoaded?.(record);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        if (isAccessError(failure)) callbacks.current.onAccessLost();
        else setError(messageFor(failure));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, refreshVersion, attempt]);

  return <article className={`firm-record firm-case-record${drawer ? " is-in-panel" : ""}`}>
    <header className="firm-record-header">
      {!drawer && <button className="subtle-link firm-record-back" type="button" disabled={locked} onClick={onBack}><Arrow back />Back to cases</button>}
      {!drawer && <div className="firm-record-title">
        <h2 className="record-heading" tabIndex={-1} ref={focusHeading}>{item?.name ?? lead.name}</h2>
        {(item || lead.caseStatus) && <FirmStatusBadge status={item?.status ?? lead.caseStatus!} />}
      </div>}
      <p className="firm-record-context">{item?.category ?? lead.category} · {item?.region ?? lead.region} · {item?.firmName ?? lead.firmName ?? "Unassigned"}</p>
      <p className="firm-record-issue">{firmIssueExcerpt(lead.description)}</p>
      <a className="subtle-link firm-record-email" href={`mailto:${lead.email}`}>{lead.email}</a>
    </header>
    <div className="firm-record-body">
      {error && <div className="workspace-message workspace-error" role="alert">{error}{" "}
        <button className="subtle-link" type="button" disabled={locked || loading} onClick={() => setAttempt((value) => value + 1)}>{loading ? "Checking…" : "Try again"}</button>
      </div>}
      {item ? <>
        <div className="firm-record-tools">
          <CaseTools caseId={item.id} leadId={item.leadId} status={item.status} role={role}
            disabled={locked || loading || !!error} onBusyChange={onBusyChange} onAccessLost={onAccessLost}
            onDraftChange={onDraftChange} refreshVersion={refreshVersion} onStatusChange={(status) => {
              setItem((current) => current && { ...current, status });
              onStatusChange(status);
            }} />
        </div>
        <RecordDetails lead={lead} item={item} />
      </> : !error && <p className="firm-record-loading" role="status">Loading case…</p>}
    </div>
  </article>;
}
