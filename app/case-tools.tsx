"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { isAccessError, messageFor, request } from "./api-client";
import "./case-tools.css";

type Role = "plaintiff" | "attorney" | "paralegal" | "admin";
type CaseStatus = "open" | "in_progress" | "closed";
type BusyChange = (busy: boolean) => void;
type CaseTool = "progress" | "documents" | "notes";

type DocumentRecord = {
  id: string;
  fileName: string;
  uploaderName: string;
  createdAt: string;
  size: number;
  uploadedByYou: boolean;
  sharingFirmName: string | null;
};

type FirmNote = {
  id: string;
  body: string;
  authorName: string;
  firmName: string;
  createdAt: string;
};

const stages: { status: CaseStatus; label: string }[] = [
  { status: "open", label: "Open" },
  { status: "in_progress", label: "In progress" },
  { status: "closed", label: "Closed" },
];

const statusCopy: Record<CaseStatus, string> = {
  open: "The firm has opened the case.",
  in_progress: "The firm is working on the case.",
  closed: "The firm has closed the case.",
};

const dateTime = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short" });
const maxPdfBytes = 10 * 1024 * 1024;
const maxNoteLength = 2000;

function formatDate(value: string) {
  return dateTime.format(new Date(value));
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function uploadError(file: File) {
  if (!/\.pdf$/i.test(file.name)) return "Choose a PDF file.";
  if (!file.size) return "Choose a PDF that isn't empty.";
  if (file.size > maxPdfBytes) return "Choose a PDF that is 10 MB or smaller.";
  return "";
}

function documentSource(document: DocumentRecord, role: Role) {
  if (document.uploadedByYou) return "Uploaded by you";
  if (document.sharingFirmName) return `Shared by ${document.sharingFirmName}`;
  return role === "plaintiff" ? `Uploaded by ${document.uploaderName}` : `Uploaded by the plaintiff · ${document.uploaderName}`;
}

function jsonRequest(method: "POST" | "PATCH", body: Record<string, string>, key?: string): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json", ...(key && { "Idempotency-Key": key }) },
    body: JSON.stringify(body),
  };
}

function useRecords<T>(path: string, field: "documents" | "notes", onAccessLost?: () => void, refreshVersion = 0) {
  const [items, setItems] = useState<T[]>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(0);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const accessLost = useRef(onAccessLost);
  accessLost.current = onAccessLost;
  const before = cursors[page];

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const pagePath = before ? `${path}?before=${encodeURIComponent(before)}` : path;
    request<{ documents?: T[]; notes?: T[]; nextCursor: string | null }>(pagePath, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setItems(result[field] ?? []);
        setNextCursor(result.nextCursor);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        if (isAccessError(failure) && accessLost.current) {
          setItems(undefined);
          accessLost.current();
        } else setError(messageFor(failure));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [path, field, before, attempt, refreshVersion]);

  function retry() {
    setError("");
    setAttempt((current) => current + 1);
  }

  function refreshFirstPage() {
    setLoading(true);
    setPage(0);
    setCursors([undefined]);
    retry();
  }

  function next() {
    if (!nextCursor || loading) return;
    setLoading(true);
    setCursors((current) => [...current.slice(0, page + 1), nextCursor]);
    setPage((current) => current + 1);
  }

  function previous() {
    if (page > 0 && !loading) {
      setLoading(true);
      setPage((current) => current - 1);
    }
  }

  return { items, error, loading, retry, refreshFirstPage, page, next, previous, hasNext: !!nextCursor };
}

function RecordPagination({ records, label, disabled }: {
  records: { page: number; loading: boolean; hasNext: boolean; next: () => void; previous: () => void };
  label: string;
  disabled: boolean;
}) {
  if (records.page === 0 && !records.hasNext) return null;
  return (
    <nav className="case-pagination" aria-label={label}>
      <button className="button small" type="button" disabled={disabled || records.loading || records.page === 0}
        onClick={records.previous}>Previous page</button>
      <span role="status">Page {records.page + 1}</span>
      <button className="button small" type="button" disabled={disabled || records.loading || !records.hasNext}
        onClick={records.next}>Next page</button>
    </nav>
  );
}

function Feedback({ error, notice }: { error?: string; notice?: string }) {
  if (error) return <p className="case-feedback case-feedback-error motion-enter motion-feedback" role="alert">{error}</p>;
  if (notice) return <p className="case-feedback motion-enter motion-feedback" role="status">{notice}</p>;
  return null;
}

function LoadError({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="case-load-error">
      <Feedback error={error} />
      <button className="button small" type="button" onClick={retry}>Try again</button>
    </div>
  );
}

function DocumentIcon() {
  return (
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h8l4 4v13H6ZM14 3v5h4m-8 5h4m-4 4h4" />
    </svg>
  );
}

export function LeadDocuments({ leadId, canUpload, role, onBusyChange, onAccessLost, refreshVersion, disabled = false }: {
  leadId: string;
  canUpload: boolean;
  role: Role;
  onBusyChange?: BusyChange;
  onAccessLost?: () => void;
  refreshVersion?: number;
  disabled?: boolean;
}) {
  if (role === "admin") return null;
  return <Documents key={leadId} leadId={leadId} canUpload={canUpload} role={role} disabled={disabled}
    onBusyChange={onBusyChange} onAccessLost={onAccessLost} refreshVersion={refreshVersion} />;
}

function Documents({ leadId, canUpload, role, disabled, onBusyChange, onAccessLost, refreshVersion }: {
  leadId: string;
  canUpload: boolean;
  role: Exclude<Role, "admin">;
  disabled: boolean;
  onBusyChange?: BusyChange;
  onAccessLost?: () => void;
  refreshVersion?: number;
}) {
  const path = `/api/leads/${leadId}/documents`;
  const records = useRecords<DocumentRecord>(path, "documents", onAccessLost, refreshVersion);
  const { items, error, loading, retry } = records;
  const [saving, setSaving] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File>();
  const [feedback, setFeedback] = useState<{ error?: string; notice?: string }>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingUpload = useRef<{ file: File; key: string } | undefined>(undefined);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || saving || !items) return;
    const file = selectedFile;
    if (!file) return;
    const invalid = uploadError(file);
    if (invalid) {
      setFeedback({ error: invalid });
      return;
    }
    setSaving(true);
    setFeedback({});
    onBusyChange?.(true);
    try {
      const body = new FormData();
      body.set("file", file);
      if (pendingUpload.current?.file !== file) pendingUpload.current = { file, key: crypto.randomUUID() };
      await request<{ document: DocumentRecord }>(path, {
        method: "POST", headers: { "Idempotency-Key": pendingUpload.current.key }, body,
      });
      pendingUpload.current = undefined;
      records.refreshFirstPage();
      if (fileInput.current) fileInput.current.value = "";
      setSelectedFile(undefined);
      setFeedback({ notice: `${file.name} uploaded.` });
    } catch (failure) {
      if (isAccessError(failure) && onAccessLost) onAccessLost();
      else setFeedback({ error: messageFor(failure) });
    } finally {
      setSaving(false);
      onBusyChange?.(false);
    }
  }

  return (
    <section className="detail-section case-tool" aria-label={role === "plaintiff" ? "Documents" : "PDFs"}>
      <div>
        <h3>{role === "plaintiff" ? "Documents" : "PDFs"}</h3>
        <p className="detail-copy">{role === "plaintiff" ? "Documents you upload and PDFs the firm shares with you."
          : "Plaintiff uploads and PDFs shared by your firm."}</p>
        {role === "plaintiff" && canUpload && <p className="detail-copy">Supporting PDFs are optional. The firm handling your request can view the PDFs you upload.</p>}
      </div>
      {canUpload && items && (
        <form className="case-upload" onSubmit={upload} aria-busy={saving}>
          <input ref={fileInput} type="file" name="file" accept="application/pdf,.pdf" hidden disabled={disabled || saving}
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              setSelectedFile(chosen);
              setFeedback(chosen ? { error: uploadError(chosen) } : {});
            }} />
          <div className="case-upload-file" aria-live="polite">
            <span className="document-icon"><DocumentIcon /></span>
            <div>
              <strong>{selectedFile?.name ?? "No PDF selected"}</strong>
              <small>{selectedFile ? `${formatFileSize(selectedFile.size)} · ${saving ? "Uploading…" : "Selected, not uploaded"}` : "PDF only, up to 10 MB"}</small>
            </div>
          </div>
          <div className="case-upload-controls">
            <button className="button small" type="button" disabled={disabled || saving} onClick={() => fileInput.current?.click()}>
              {selectedFile ? "Change PDF" : "Add a PDF"}
            </button>
            <button className="button small" type="submit" disabled={disabled || saving || !selectedFile || !!uploadError(selectedFile)}>
              {saving ? "Uploading…" : "Upload PDF"}
            </button>
          </div>
        </form>
      )}
      <Feedback {...feedback} />
      {error ? <LoadError error={error} retry={retry} /> : loading || !items ? <p className="detail-copy" role="status">Loading PDFs…</p> :
        items.length ? (
          <ul className="file-list">
            {items.map((document) => (
              <li className="file-row" key={document.id}>
                <span className="document-icon"><DocumentIcon /></span>
                <div className="case-file-copy">
                  <a className="subtle-link" href={`/api/documents/${document.id}`} target="_blank" rel="noopener">
                    {document.fileName}<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                      <path d="M14 4h6v6m0-6L10 14M10 4H4v16h16v-6" />
                    </svg><span className="visually-hidden"> (opens in a new tab)</span>
                  </a>
                  <small>{documentSource(document, role)} · {formatFileSize(document.size)} · <time dateTime={document.createdAt}>{formatDate(document.createdAt)}</time></small>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="detail-empty">No PDFs have been shared yet.</p>}
      {!error && <RecordPagination records={records} label="PDF pages" disabled={disabled || saving} />}
    </section>
  );
}

function Notes({ caseId, canWrite, disabled, onBusyChange, onAccessLost, refreshVersion }: {
  caseId: string;
  canWrite: boolean;
  disabled: boolean;
  onBusyChange: BusyChange;
  onAccessLost?: () => void;
  refreshVersion?: number;
}) {
  const path = `/api/cases/${caseId}/notes`;
  const records = useRecords<FirmNote>(path, "notes", onAccessLost, refreshVersion);
  const { items, error, loading, retry } = records;
  const [saving, setSaving] = useState(false);
  const [body, setBody] = useState("");
  const [feedback, setFeedback] = useState<{ error?: string; notice?: string }>({});
  const pendingNote = useRef<{ body: string; key: string } | undefined>(undefined);

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || saving || !body.trim()) return;
    setSaving(true);
    setFeedback({});
    onBusyChange(true);
    try {
      const text = body.trim();
      if (pendingNote.current?.body !== text) pendingNote.current = { body: text, key: crypto.randomUUID() };
      await request<{ note: FirmNote }>(path, jsonRequest("POST", { body: text }, pendingNote.current.key));
      pendingNote.current = undefined;
      records.refreshFirstPage();
      setBody("");
      setFeedback({ notice: "Private note added." });
    } catch (failure) {
      if (isAccessError(failure) && onAccessLost) onAccessLost();
      else setFeedback({ error: messageFor(failure) });
    } finally {
      setSaving(false);
      onBusyChange(false);
    }
  }

  return (
    <section className="detail-section case-tool" aria-label="Firm-private notes">
      <div>
        <h3>Firm-private notes</h3>
        <p className="detail-copy">Notes stay with the firm that wrote them. Authorized admins can review them.</p>
      </div>
      {canWrite && items && (
        <form className="case-note-form" onSubmit={addNote}>
          <label className="field">Private note
            <textarea name="body" required maxLength={maxNoteLength} value={body}
              onChange={(event) => { setBody(event.target.value); setFeedback({}); }}
              disabled={disabled || saving} />
          </label>
          <button className="button small" type="submit" disabled={disabled || saving || !body.trim()}>
            {saving ? "Adding…" : "Add note"}
          </button>
        </form>
      )}
      <Feedback {...feedback} />
      {error ? <LoadError error={error} retry={retry} /> : loading || !items ? <p className="detail-copy" role="status">Loading notes…</p> :
        items.length ? (
          <ul className="note-list">
            {items.map((note) => (
              <li className="note-entry" key={note.id}>
                <div>
                  <strong>{note.authorName}</strong>
                  <time dateTime={note.createdAt}>{formatDate(note.createdAt)}</time>
                </div>
                <small>{note.firmName}</small>
                <p>{note.body}</p>
              </li>
            ))}
          </ul>
        ) : <p className="detail-empty">No private notes yet.</p>}
      {!error && <RecordPagination records={records} label="Private note pages" disabled={disabled || saving} />}
    </section>
  );
}

export function CaseTools({ caseId, leadId, status, role, onStatusChange, onBusyChange, onAccessLost, refreshVersion, disabled = false }: {
  caseId: string;
  leadId: string;
  status: CaseStatus;
  role: Role;
  onStatusChange: (status: CaseStatus) => void;
  onBusyChange?: BusyChange;
  onAccessLost?: () => void;
  refreshVersion?: number;
  disabled?: boolean;
}) {
  const [action, setAction] = useState<CaseTool>();
  const [activeTab, setActiveTab] = useState<"documents" | "notes">(role === "admin" ? "notes" : "documents");
  const [feedback, setFeedback] = useState<{ error?: string; notice?: string }>({});
  const closeDialog = useRef<HTMLDialogElement>(null);
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const staff = role === "attorney" || role === "paralegal";
  const busy = disabled || !!action;
  const tabs = [
    ...(role !== "admin" ? [{ id: "documents" as const, label: "Documents" }] : []),
    ...(role !== "plaintiff" ? [{ id: "notes" as const, label: "Notes" }] : []),
  ];
  const visibleTab = tabs.some((tab) => tab.id === activeTab) ? activeTab : tabs[0].id;
  const currentStage = stages.findIndex((stage) => stage.status === status);
  const nextStatus = status === "open" ? "in_progress" : status === "in_progress" ? "closed" : undefined;

  function report(tool: CaseTool, busy: boolean) {
    setAction(busy ? tool : undefined);
    onBusyChange?.(busy);
  }

  async function updateProgress() {
    if (!nextStatus || busy) return;
    report("progress", true);
    setFeedback({});
    try {
      const updated = await request<{ status: CaseStatus }>(`/api/cases/${caseId}/status`, jsonRequest("PATCH", { status: nextStatus }));
      onStatusChange(updated.status);
      setFeedback({ notice: updated.status === "closed" ? "Case closed." : "Case progress updated." });
    } catch (failure) {
      if (isAccessError(failure) && onAccessLost) onAccessLost();
      else setFeedback({ error: messageFor(failure) });
    } finally {
      report("progress", false);
    }
  }

  return (
    <>
      <section className="detail-section case-tool" aria-label="Case progress">
        <div>
          <h3>Case progress</h3>
          {role !== "plaintiff" && <p className="detail-copy">{statusCopy[status]}</p>}
        </div>
        <ol className="case-progress">
          {stages.map((stage, index) => (
            <li key={stage.status}
              className={`progress-step${index < currentStage ? " is-complete" : index === currentStage ? " is-current" : ""}`}
              aria-current={index === currentStage ? "step" : undefined}>
              <span className="progress-marker" aria-hidden="true">{index < currentStage ? "✓" : index + 1}</span>{stage.label}
            </li>
          ))}
        </ol>
        {staff && nextStatus && (
          <div className="case-progress-action">
            <button className={nextStatus === "closed" ? "button danger small" : "button primary small"}
              type="button" disabled={busy} onClick={() => {
                if (nextStatus === "closed") closeDialog.current?.showModal();
                else void updateProgress();
              }}>
              {action === "progress" ? "Updating…" : nextStatus === "closed" ? "Close case" : "Mark in progress"}
            </button>
            {nextStatus === "closed" && (
              <dialog ref={closeDialog} aria-labelledby="close-case-title" aria-describedby="close-case-description">
                <div className="dialog-head"><h2 id="close-case-title">Close this case?</h2></div>
                <div className="dialog-body"><p id="close-case-description">
                  The plaintiff will see that this case is closed. Existing PDFs and notes stay available to people with access.
                </p></div>
                <form className="dialog-footer" method="dialog">
                  <button className="button" type="submit">Cancel</button>
                  <button className="button primary danger" type="button" disabled={busy} onClick={() => {
                    closeDialog.current?.close();
                    void updateProgress();
                  }}>Close case</button>
                </form>
              </dialog>
            )}
          </div>
        )}
        <Feedback {...feedback} />
      </section>
      <div className="case-content">
        {tabs.length > 1 && (
          <div className="case-content-tabs" role="tablist" aria-label="Case information">
            {tabs.map((tab, index) => (
              <button key={tab.id} ref={(element) => { tabButtons.current[index] = element; }}
                className="case-content-tab" type="button" role="tab" id={`${caseId}-${tab.id}-tab`}
                aria-controls={`${caseId}-${tab.id}-panel`} aria-selected={visibleTab === tab.id}
                tabIndex={visibleTab === tab.id ? 0 : -1} disabled={busy}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => {
                  const position = event.key === "ArrowRight" ? (index + 1) % tabs.length
                    : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
                      : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : undefined;
                  if (position === undefined) return;
                  event.preventDefault();
                  setActiveTab(tabs[position].id);
                  tabButtons.current[position]?.focus();
                }}>{tab.label}</button>
            ))}
          </div>
        )}
        {role !== "admin" && (
          <div id={`${caseId}-documents-panel`} role={tabs.length > 1 ? "tabpanel" : undefined}
            aria-labelledby={tabs.length > 1 ? `${caseId}-documents-tab` : undefined}
            hidden={visibleTab !== "documents"} className="case-content-panel motion-enter motion-detail">
            <LeadDocuments leadId={leadId} canUpload={status !== "closed"} role={role}
              disabled={busy} onBusyChange={(saving) => report("documents", saving)}
              onAccessLost={onAccessLost} refreshVersion={refreshVersion} />
          </div>
        )}
        {role !== "plaintiff" && (
          <div id={`${caseId}-notes-panel`} role={tabs.length > 1 ? "tabpanel" : undefined}
            aria-labelledby={tabs.length > 1 ? `${caseId}-notes-tab` : undefined}
            hidden={visibleTab !== "notes"} className="case-content-panel motion-enter motion-detail">
            <Notes key={caseId} caseId={caseId} canWrite={staff && status !== "closed"}
              disabled={busy} onBusyChange={(saving) => report("notes", saving)}
              onAccessLost={onAccessLost} refreshVersion={refreshVersion} />
          </div>
        )}
      </div>
    </>
  );
}
