"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { isAccessError, messageFor, post, request } from "./api-client";
import type { Lead } from "./workspace";
import "./admin-records.css";

export type Firm = { id: string; name: string };
type AuditValues = { status?: string; caseStatus?: string; firmName?: string | null };
type AuditEvent = {
  id: string;
  eventType: string;
  actorName: string;
  beforeValues: AuditValues | null;
  afterValues: AuditValues | null;
  createdAt: string;
};
type AssignmentProps = {
  lead: Lead;
  caseView?: boolean;
  firms: Firm[];
  locked?: boolean;
  showOutcome?: boolean;
  onUpdated: (lead: Lead, message: string) => void;
  onBusyChange: (busy: boolean) => void;
  onAccessLost?: () => void;
};

const eventDescriptions: Record<string, string> = {
  lead_routed: "routed this lead to a firm.",
  lead_assigned: "assigned this lead for review.",
  lead_reassigned: "reassigned this lead.",
  lead_accepted: "accepted this lead and opened its case.",
  lead_declined: "declined this lead.",
  lead_closed: "closed this lead without placement at a firm.",
  case_reassigned: "reassigned the case and linked lead.",
  case_status_changed: "updated case progress.",
};
const statusLabels: Record<string, string> = {
  pending_assignment: "Pending assignment", awaiting_firm_review: "Awaiting firm review",
  accepted: "Accepted", declined: "Declined", open: "New case", in_progress: "In progress", closed: "Closed",
};
const auditDate = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short" });

function eventDescription(event: AuditEvent) {
  if (event.eventType === "lead_assigned" && event.beforeValues?.status === "declined"
    && event.beforeValues.firmName && event.beforeValues.firmName === event.afterValues?.firmName) {
    return `returned this lead to ${event.afterValues.firmName} for another review.`;
  }
  return eventDescriptions[event.eventType] ?? `recorded ${event.eventType.replaceAll("_", " ")}.`;
}

function eventChanges(event: AuditEvent) {
  const before = event.beforeValues;
  const after = event.afterValues;
  const changes: { label: string; from?: string; to: string }[] = [];
  if (after && "firmName" in after && before?.firmName !== after.firmName) {
    changes.push({ label: "Firm", from: before?.firmName ?? "Unassigned", to: after.firmName ?? "Unassigned" });
  }
  const from = before?.status ?? before?.caseStatus;
  const to = after?.status ?? after?.caseStatus;
  if (to && from !== to) changes.push({ label: "Status", from: from ? statusLabels[from] ?? from : undefined, to: statusLabels[to] ?? to });
  return changes;
}

export function AdminAssignmentActions({ lead, caseView = false, firms, locked = false, showOutcome = true, onUpdated, onBusyChange, onAccessLost }: AssignmentProps) {
  const [targetFirm, setTargetFirm] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [actionError, setActionError] = useState("");
  const [outcome, setOutcome] = useState("");
  const [saving, setSaving] = useState(false);
  const mutationBusy = useRef(false);
  const closeDialog = useRef<HTMLDialogElement>(null);
  const firmSelect = useRef<HTMLSelectElement>(null);
  const outcomeHeading = useRef<HTMLParagraphElement>(null);
  const canAssign = caseView ? !!lead.caseId : ["pending_assignment", "awaiting_firm_review", "declined"].includes(lead.status);
  const canClose = !caseView && lead.status === "declined";
  const isUnassigned = !caseView && lead.status === "pending_assignment";
  const selectedFirm = firms.find((firm) => firm.id === targetFirm);
  const sameFirm = !!selectedFirm && selectedFirm.id === lead.firmId;
  const canReturn = !caseView && lead.status === "declined";
  const validSelection = !!selectedFirm && (!sameFirm || canReturn);
  const showForm = canAssign && (isUnassigned || canClose || expanded);
  const busy = locked || saving;
  const currentFirm = lead.firmName ?? "Unassigned";
  const submitLabel = caseView ? "Reassign case" : sameFirm && canReturn ? "Return for review" : isUnassigned ? "Assign lead" : lead.status === "declined" ? "Send for another review" : "Reassign lead";

  useEffect(() => {
    if (outcome && showOutcome) outcomeHeading.current?.focus({ preventScroll: true });
  }, [outcome, showOutcome]);

  async function update(path: string, body: Record<string, string>, kind: "assign" | "close") {
    if (busy || mutationBusy.current) return;
    mutationBusy.current = true;
    setSaving(true);
    setActionError("");
    onBusyChange(true);
    try {
      const { lead: updated } = await post<{ lead: Lead }>(path, body);
      const firmName = updated.firmName ?? selectedFirm?.name ?? "the selected firm";
      const message = kind === "close" ? `${updated.name}’s lead is closed without placement at a firm. The plaintiff can see the closure notice.`
        : caseView ? `Case reassigned to ${firmName}. Its progress is unchanged.`
          : sameFirm && canReturn ? `Lead returned to ${firmName} for another review.`
            : `Lead assigned to ${firmName}. Awaiting firm review.`;
      setTargetFirm("");
      setExpanded(false);
      setOutcome(message);
      onUpdated(updated, message);
    } catch (error) {
      setActionError(messageFor(error));
      if (isAccessError(error)) onAccessLost?.();
    } finally {
      mutationBusy.current = false;
      setSaving(false);
      onBusyChange(false);
    }
  }

  function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validSelection || busy) return;
    void update(caseView ? `/api/cases/${lead.caseId}/reassign` : `/api/leads/${lead.id}/assign`, { firmId: targetFirm }, "assign");
  }

  if (!canAssign && !canClose && !outcome) return null;
  return <section className="detail-section admin-assignment" aria-label={caseView ? "Case assignment" : "Lead assignment"}>
    <div className="admin-assignment-heading">
      <h3>{canClose ? "Resolve this declined lead" : isUnassigned ? "Assign a law firm" : "Current assignment"}</h3>
      {!isUnassigned && !canClose && canAssign && !showForm && <button className="subtle-link" type="button" disabled={busy}
        onClick={() => { setExpanded(true); requestAnimationFrame(() => firmSelect.current?.focus()); }}>Change firm</button>}
    </div>
    {(!outcome || !showOutcome) && <p className="detail-copy">{canClose
      ? `${currentFirm} declined this lead. Choose a firm for another review or close the lead.`
      : isUnassigned ? "No firm is assigned. Choose a law firm to review this request."
        : caseView ? `${currentFirm} is assigned to this case.` : `${currentFirm} is reviewing this lead.`}</p>}
    {showOutcome && outcome && <div className="admin-assignment-outcome" role="status"><p tabIndex={-1} ref={outcomeHeading}>{outcome}</p></div>}
    {showForm && <form className="form-stack admin-assignment-form" onSubmit={assign}>
      <label className="field">{isUnassigned ? "Law firm" : "Send to"}
        <span className="admin-firm-select"><select ref={firmSelect} value={targetFirm} required disabled={busy} onChange={(event) => { setTargetFirm(event.target.value); setActionError(""); }}>
          <option value="">Choose a firm</option>
          {firms.map((firm) => <option key={firm.id} value={firm.id} disabled={firm.id === lead.firmId && !canReturn}>
            {firm.name}{firm.id === lead.firmId ? canReturn ? " - previous reviewer" : " - current firm" : ""}
          </option>)}
        </select><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg></span>
      </label>
      {validSelection && selectedFirm && <div className="admin-assignment-review" aria-label="Review assignment">
        <p className="admin-assignment-transfer"><span>{currentFirm}</span><span aria-hidden="true">→</span><span className="visually-hidden">to</span><strong>{selectedFirm.name}</strong></p>
        <ul>
          {caseView ? <>
            <li>The case and linked lead move together. Progress stays {statusLabels[lead.caseStatus ?? "open"]}.</li>
            <li>{currentFirm} loses access. The new firm can view plaintiff-uploaded PDFs.</li>
            <li>Private notes keep their original firm ownership. Firm-shared PDFs stay available to the plaintiff and do not transfer to another firm.</li>
            <li>The plaintiff sees an in-app reassignment notice.</li>
          </> : sameFirm && canReturn ? <>
            <li>The lead returns to {selectedFirm.name}’s review inbox. The original decline stays in history.</li>
            <li>The plaintiff sees an in-app update.</li>
          </> : <>
            <li>{selectedFirm.name} receives the lead and its plaintiff-uploaded PDFs for review.</li>
            {lead.firmId ? <><li>{currentFirm} loses access.</li><li>The plaintiff sees an in-app assignment notice.</li></>
              : <li>The plaintiff can see the assigned firm and review status.</li>}
          </>}
        </ul>
      </div>}
      <div className="detail-actions">
        <button className="button primary" type="submit" disabled={!validSelection || busy}>{saving ? "Saving…" : submitLabel}</button>
        {!isUnassigned && !canClose && <button className="subtle-link" type="button" disabled={busy}
          onClick={() => { setExpanded(false); setTargetFirm(""); setActionError(""); }}>Cancel</button>}
        {canClose && <button className="button danger" type="button" disabled={busy} onClick={() => closeDialog.current?.showModal()}>Close lead</button>}
      </div>
    </form>}
    {actionError && <p className="form-error" role="alert">{actionError}</p>}
    {canClose && <dialog ref={closeDialog} aria-labelledby={`admin-close-title-${lead.id}`} aria-describedby={`admin-close-description-${lead.id}`}>
      <div className="dialog-head"><h2 id={`admin-close-title-${lead.id}`}>Close {lead.name}’s lead?</h2></div>
      <div className="dialog-body" id={`admin-close-description-${lead.id}`}>
        <p>The lead closes without placement at a firm. {currentFirm} loses access.</p>
        <p>The plaintiff can still read the request and documents, and will see an in-app closure notice.</p>
      </div>
      <form method="dialog" className="dialog-footer">
        <button className="button" type="submit">Keep open</button>
        <button className="button primary danger" type="button" disabled={busy} onClick={() => {
          closeDialog.current?.close();
          void update(`/api/leads/${lead.id}/close`, {}, "close");
        }}>Close lead</button>
      </form>
    </dialog>}
  </section>;
}

export function AdminHistory({ leadId, locked = false, onAccessLost, refreshVersion = 0 }: {
  leadId: string;
  locked?: boolean;
  onAccessLost?: () => void;
  refreshVersion?: number;
}) {
  const [loaded, setLoaded] = useState<{ leadId: string; events: AuditEvent[] }>();
  const [failure, setFailure] = useState<{ leadId: string; message: string }>();
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedLead, setExpandedLead] = useState<string>();
  const accessLost = useRef(onAccessLost);
  accessLost.current = onAccessLost;
  const events = loaded?.leadId === leadId ? loaded.events : undefined;
  const error = failure?.leadId === leadId ? failure.message : undefined;
  const expanded = expandedLead === leadId;
  const visible = events ? expanded ? events : events.slice(0, 4) : [];

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailure(undefined);
    request<{ events: AuditEvent[] }>(`/api/leads/${leadId}/history`, { signal: controller.signal })
      .then(({ events }) => {
        if (controller.signal.aborted) return;
        setLoaded({ leadId, events: [...events].sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt) || second.id.localeCompare(first.id)) });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setFailure({ leadId, message: messageFor(error) });
        if (isAccessError(error)) {
          setLoaded(undefined);
          accessLost.current?.();
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [leadId, attempt, refreshVersion]);

  return <section className="detail-section admin-history" aria-label="Audit history" aria-busy={loading}>
    <h3>Audit history</h3>
    {loading && events && <p className="visually-hidden" role="status">Updating history…</p>}
    {error && <div className="admin-history-error" role="alert"><p>{error}</p>
      <button type="button" className="subtle-link" disabled={locked || loading} onClick={() => setAttempt((value) => value + 1)}>Try again</button>
    </div>}
    {!events ? !error && <p className="detail-copy" role="status">Loading history…</p> : events.length ? <>
      <ol id={`admin-history-${leadId}`}>
        {visible.map((event) => <li key={event.id}>
          <p className="admin-history-event"><strong>{event.actorName}</strong> {eventDescription(event)}</p>
          {eventChanges(event).map((change) => <p className="admin-history-change" key={change.label}>
            <span>{change.label}</span> {change.from && <>{change.from}<span aria-hidden="true"> → </span><span className="visually-hidden"> to </span></>}{change.to}
          </p>)}
          <time className="admin-history-date" dateTime={event.createdAt}>{auditDate.format(new Date(event.createdAt))}</time>
        </li>)}
      </ol>
      {events.length > 4 && <button className="subtle-link" type="button" aria-controls={`admin-history-${leadId}`} aria-expanded={expanded}
        onClick={() => setExpandedLead(expanded ? undefined : leadId)}>{expanded ? "Show recent changes" : `Show all ${events.length} events`}</button>}
    </> : <p className="detail-copy">No changes have been recorded yet.</p>}
  </section>;
}

export function AdminTools({ lead, caseView, firms, onUpdated, onBusyChange, onAccessLost, refreshVersion }: AssignmentProps & { refreshVersion?: number }) {
  const [mutationVersion, setMutationVersion] = useState(0);
  return <div className="admin-tools">
    <AdminAssignmentActions key={`${lead.id}:${caseView ? "case" : "lead"}`} lead={lead} caseView={caseView} firms={firms}
      onUpdated={(updated, message) => { setMutationVersion((value) => value + 1); onUpdated(updated, message); }} onBusyChange={onBusyChange} onAccessLost={onAccessLost} />
    <AdminHistory leadId={lead.id} onAccessLost={onAccessLost} refreshVersion={(refreshVersion ?? 0) + mutationVersion} />
  </div>;
}
