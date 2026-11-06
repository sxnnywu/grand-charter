"use client";

import { useEffect, useRef, useState } from "react";
import { AdminAssignmentActions, AdminHistory, type Firm } from "./admin-tools";
import { AdminCaseNotes } from "./case-tools";
import { isAccessError, messageFor, request } from "./api-client";
import { firmIssueExcerpt } from "./firm-records";
import type { Lead } from "./workspace";
import "./admin-records.css";

type AdminCase = {
  id: string;
  leadId: string;
  status: NonNullable<Lead["caseStatus"]>;
  createdAt: string;
};
type Props = {
  lead: Lead;
  caseView: boolean;
  firms: Firm[];
  locked: boolean;
  refreshVersion: number;
  onUpdated: (lead: Lead, message: string) => void;
  onBusyChange: (busy: boolean) => void;
  onAccessLost: () => void;
  onOpenCase?: () => void;
};
const dateFormat = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" });
const caseLabels = { open: "New case", in_progress: "In progress", closed: "Closed" };

export function AdminRecordDetail({ lead, caseView, firms, locked, refreshVersion, onUpdated, onBusyChange, onAccessLost, onOpenCase }: Props) {
  const [loadedCase, setLoadedCase] = useState<AdminCase>();
  const [caseFailure, setCaseFailure] = useState<{ id: string; message: string }>();
  const [caseLoading, setCaseLoading] = useState(false);
  const [caseAttempt, setCaseAttempt] = useState(0);
  const [tab, setTab] = useState<{ record: string; value: "history" | "notes" }>();
  const [notesRecord, setNotesRecord] = useState<string>();
  const [mutationVersion, setMutationVersion] = useState(0);
  const accessLost = useRef(onAccessLost);
  accessLost.current = onAccessLost;
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const record = `${lead.id}:${caseView ? lead.caseId : "lead"}`;
  const selectedTab = tab?.record === record ? tab.value : "history";
  const item = loadedCase?.id === lead.caseId ? loadedCase : undefined;
  const caseError = caseFailure?.id === lead.caseId ? caseFailure.message : undefined;
  const checkingCase = caseView && !!lead.caseId && (caseLoading || (!item && !caseError));
  const currentLead = item && caseView ? { ...lead, caseStatus: item.status } : lead;
  const longRequest = lead.description.length > 420 || lead.description.split("\n").length > 4;

  useEffect(() => {
    if (!caseView || !lead.caseId) return;
    const id = lead.caseId;
    const controller = new AbortController();
    setCaseLoading(true);
    setCaseFailure(undefined);
    request<{ case: AdminCase }>(`/api/cases/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(({ case: item }) => { if (!controller.signal.aborted) setLoadedCase(item); })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isAccessError(error)) accessLost.current();
        else setCaseFailure({ id, message: messageFor(error) });
      })
      .finally(() => { if (!controller.signal.aborted) setCaseLoading(false); });
    return () => controller.abort();
  }, [caseView, lead.caseId, refreshVersion, caseAttempt]);

  function chooseTab(value: "history" | "notes") {
    setTab({ record, value });
    if (value === "notes") setNotesRecord(record);
  }

  const metadata = <dl className="admin-record-metadata">
    <div><dt>Submitted</dt><dd><time dateTime={lead.createdAt}>{dateFormat.format(new Date(lead.createdAt))}</time></dd></div>
    <div><dt>Email</dt><dd><a className="subtle-link" href={`mailto:${lead.email}`}>{lead.email}</a></dd></div>
    {caseView && item && <div><dt>Case opened</dt><dd><time dateTime={item.createdAt}>{dateFormat.format(new Date(item.createdAt))}</time></dd></div>}
    <div className="admin-record-reference"><dt>Lead reference</dt><dd>{lead.id}</dd></div>
    {caseView && lead.caseId && <div className="admin-record-reference"><dt>Case reference</dt><dd>{lead.caseId}</dd></div>}
  </dl>;

  return <article className="admin-record-detail">
    <div className="admin-record-context">
      <dl>
        <div><dt>Type of legal help</dt><dd>{lead.category}</dd></div>
        <div><dt>Province</dt><dd>{lead.region}</dd></div>
        {caseView && currentLead.caseStatus && <div><dt>Case progress</dt><dd>{caseLabels[currentLead.caseStatus]}</dd></div>}
      </dl>
    </div>
    {checkingCase && <p className="visually-hidden" role="status">Checking current case details…</p>}
    {caseError && <div className="admin-record-error" role="alert"><p>{caseError}</p>
      <button className="subtle-link" type="button" disabled={locked || caseLoading} onClick={() => setCaseAttempt((value) => value + 1)}>Try again</button>
    </div>}
    {!caseView && lead.status === "accepted" ? <section className="admin-record-linked-case" aria-label="Linked case">
      <h3>This lead has a case</h3>
      <p>Manage its assignment from the case. The original lead stays accepted.</p>
      {onOpenCase && <button className="button primary" type="button" disabled={locked} onClick={onOpenCase}>Open case <span aria-hidden="true">→</span></button>}
    </section> : !caseView && lead.status === "closed" ? <section className="admin-record-closed" aria-label="Closed lead">
      <h3>Closed without placement at a firm</h3>
      <p>This lead has no current assignment. The plaintiff can still read the request and its documents.</p>
    </section> : <AdminAssignmentActions key={record} lead={currentLead} caseView={caseView} firms={firms} showOutcome={false}
      locked={locked || checkingCase || !!caseError} onUpdated={(updated, message) => {
        setMutationVersion((value) => value + 1);
        onUpdated(updated, message);
      }} onBusyChange={onBusyChange} onAccessLost={onAccessLost} />}
    <section className="admin-record-intake" aria-label="Original request">
      <h3>Original request</h3>
      <p className="admin-record-description">{longRequest ? firmIssueExcerpt(lead.description, 270) : lead.description}</p>
      <details>
        <summary>{longRequest ? "Read full request and details" : "Record details"}</summary>
        {longRequest && <p className="admin-record-description">{lead.description}</p>}
        {metadata}
      </details>
    </section>
    <section className="admin-record-information">
      {caseView && lead.caseId && <div className="admin-record-tabs" role="tablist" aria-label="Case information">
        {(["history", "notes"] as const).map((value, index) => <button key={value} type="button" role="tab"
          ref={(element) => { tabButtons.current[index] = element; }} id={`admin-${value}-tab-${lead.id}`}
          aria-controls={`admin-${value}-panel-${lead.id}`} aria-selected={selectedTab === value}
          tabIndex={selectedTab === value ? 0 : -1} disabled={locked}
          onClick={() => chooseTab(value)} onKeyDown={(event) => {
            const next = event.key === "ArrowLeft" || event.key === "ArrowRight" ? 1 - index : event.key === "Home" ? 0 : event.key === "End" ? 1 : undefined;
            if (next === undefined) return;
            event.preventDefault();
            chooseTab(next === 0 ? "history" : "notes");
            tabButtons.current[next]?.focus();
          }}>{value === "history" ? "History" : "Firm notes"}</button>)}
      </div>}
      <div className="admin-record-tabpanel" id={`admin-history-panel-${lead.id}`}
        role={caseView ? "tabpanel" : undefined} aria-labelledby={caseView ? `admin-history-tab-${lead.id}` : undefined}
        hidden={caseView && selectedTab !== "history"}>
        <AdminHistory leadId={lead.id} locked={locked} onAccessLost={onAccessLost} refreshVersion={refreshVersion + mutationVersion} />
      </div>
      {caseView && lead.caseId && (selectedTab === "notes" || notesRecord === record) && <div className="admin-record-tabpanel"
        id={`admin-notes-panel-${lead.id}`} role="tabpanel" aria-labelledby={`admin-notes-tab-${lead.id}`} hidden={selectedTab !== "notes"}>
        <AdminCaseNotes caseId={lead.caseId} disabled={locked} onBusyChange={onBusyChange} onAccessLost={onAccessLost} refreshVersion={refreshVersion + mutationVersion} />
      </div>}
    </section>
  </article>;
}
