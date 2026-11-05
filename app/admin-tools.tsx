"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { isAccessError, messageFor, post, request } from "./api-client";
import type { Lead } from "./workspace";

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

const eventLabels: Record<string, string> = {
  lead_routed: "Lead routed",
  lead_assigned: "Lead assigned",
  lead_reassigned: "Lead reassigned",
  lead_accepted: "Lead accepted and case opened",
  lead_declined: "Lead declined",
  lead_closed: "Lead closed",
  case_reassigned: "Case reassigned",
  case_status_changed: "Case progress updated",
};
const statusLabels: Record<string, string> = {
  pending_assignment: "Pending assignment",
  awaiting_firm_review: "Awaiting firm review",
  accepted: "Accepted",
  declined: "Declined",
  open: "Open",
  in_progress: "In progress",
  closed: "Closed",
};
const auditDate = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short" });

function eventChanges(event: AuditEvent) {
  const before = event.beforeValues;
  const after = event.afterValues;
  const fromStatus = before?.status ?? before?.caseStatus;
  const toStatus = after?.status ?? after?.caseStatus;
  const changes = [];
  if (after && "firmName" in after && before?.firmName !== after.firmName) {
    changes.push(`${before?.firmName ?? "Unassigned"} → ${after.firmName ?? "Unassigned"}`);
  }
  if (toStatus && fromStatus !== toStatus) {
    const label = statusLabels[toStatus] ?? toStatus;
    changes.push(fromStatus ? `${statusLabels[fromStatus] ?? fromStatus} → ${label}` : label);
  }
  return changes.join(" · ");
}

export function AdminTools({ lead, caseView, firms, onUpdated, onBusyChange, onAccessLost, refreshVersion }: {
  lead: Lead;
  caseView?: boolean;
  firms: Firm[];
  onUpdated: (lead: Lead, message: string) => void;
  onBusyChange: (busy: boolean) => void;
  onAccessLost?: () => void;
  refreshVersion?: number;
}) {
  const [targetFirm, setTargetFirm] = useState("");
  const [events, setEvents] = useState<AuditEvent[]>();
  const [historyError, setHistoryError] = useState("");
  const [actionError, setActionError] = useState("");
  const [historyAttempt, setHistoryAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const closeDialog = useRef<HTMLDialogElement>(null);
  const canAssign = caseView ? !!lead.caseId : ["pending_assignment", "awaiting_firm_review", "declined"].includes(lead.status);
  const canClose = !caseView && lead.status === "declined";
  const allowSameFirm = !caseView && lead.status === "declined";
  const assignLabel = caseView ? "Reassign case" : lead.status === "pending_assignment" ? "Assign lead" : "Send for review";

  useEffect(() => {
    const controller = new AbortController();
    request<{ events: AuditEvent[] }>(`/api/leads/${lead.id}/history`, { signal: controller.signal })
      .then(({ events }) => { if (!controller.signal.aborted) setEvents(events); })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isAccessError(error)) onAccessLost?.();
        else setHistoryError(messageFor(error));
      });
    return () => controller.abort();
  }, [lead.id, historyAttempt, refreshVersion, onAccessLost]);

  async function update(path: string, body: Record<string, string>, message: string) {
    setSaving(true);
    setActionError("");
    onBusyChange(true);
    try {
      const { lead } = await post<{ lead: Lead }>(path, body);
      setTargetFirm("");
      setHistoryError("");
      setHistoryAttempt((attempt) => attempt + 1);
      onUpdated(lead, message);
    } catch (error) {
      if (isAccessError(error)) onAccessLost?.();
      else setActionError(messageFor(error));
    } finally {
      setSaving(false);
      onBusyChange(false);
    }
  }

  function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!targetFirm || saving) return;
    const path = caseView ? `/api/cases/${lead.caseId}/reassign` : `/api/leads/${lead.id}/assign`;
    const message = caseView ? "Case transferred to the new firm." : "Lead sent to the firm for review.";
    void update(path, { firmId: targetFirm }, message);
  }

  return (
    <div className="admin-tools">
      {(canAssign || canClose) && <section className="detail-section">
        <h3>{caseView ? "Case assignment" : "Lead assignment"}</h3>
        {caseView && <p className="detail-copy">The new firm gets the case and the plaintiff’s PDFs. The case keeps its progress.</p>}
        {canAssign && <form className="form-stack admin-assignment-form" onSubmit={assign}>
          <label className="field">Law firm
            <select value={targetFirm} required disabled={saving} onChange={(event) => setTargetFirm(event.target.value)}>
              <option value="">Choose a firm</option>
              {firms.map((firm) => <option key={firm.id} value={firm.id}
                disabled={firm.id === lead.firmId && !allowSameFirm}>{firm.name}</option>)}
            </select>
          </label>
          <div className="detail-actions">
            <button className="button primary" type="submit" disabled={!targetFirm || saving}>{saving ? "Saving…" : assignLabel}</button>
            {canClose && <button className="button danger" type="button" disabled={saving}
              onClick={() => closeDialog.current?.showModal()}>Close lead</button>}
          </div>
        </form>}
        {actionError && <p className="form-error" role="alert">{actionError}</p>}
        {canClose && <dialog ref={closeDialog} aria-labelledby="admin-close-title">
          <div className="dialog-head"><h2 id="admin-close-title">Close this lead?</h2></div>
          <div className="dialog-body"><p>The firm will lose access and the plaintiff will see a closure notice.</p></div>
          <form method="dialog" className="dialog-footer">
            <button className="button" type="submit">Cancel</button>
            <button className="button primary danger" type="button" onClick={() => {
              closeDialog.current?.close();
              void update(`/api/leads/${lead.id}/close`, {}, "Lead closed. The plaintiff can see the closure notice.");
            }}>Close lead</button>
          </form>
        </dialog>}
      </section>}
      <section className="detail-section admin-history">
        <h3>Audit history</h3>
        {historyError ? <p className="form-error" role="alert">{historyError}{" "}
          <button type="button" className="subtle-link" onClick={() => {
            setHistoryError("");
            setHistoryAttempt((attempt) => attempt + 1);
          }}>Try again</button>
        </p> : !events ? <p className="detail-copy" role="status">Loading history…</p> : events.length ? (
          <ol>
            {events.map((event) => <li key={event.id}>
              <strong>{eventLabels[event.eventType] ?? event.eventType.replaceAll("_", " ")}</strong>
              {eventChanges(event) && <p className="detail-copy">{eventChanges(event)}</p>}
              <small>{event.actorName} · <time dateTime={event.createdAt}>{auditDate.format(new Date(event.createdAt))}</time></small>
            </li>)}
          </ol>
        ) : <p className="detail-copy">No changes have been recorded yet.</p>}
      </section>
    </div>
  );
}
