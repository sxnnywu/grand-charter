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
  const [feedback, setFeedback] = useState<{ error?: string; notice?: string }>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingUpload = useRef<{ file: File; key: string } | undefined>(undefined);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || saving || !items) return;
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    if (file.size > maxPdfBytes) {
      setFeedback({ error: "Choose a PDF that is 10 MB or smaller." });
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
      setFeedback({ notice: "PDF uploaded." });
    } catch (failure) {
      if (isAccessError(failure) && onAccessLost) onAccessLost();
      else setFeedback({ error: messageFor(failure) });
    } finally {
      setSaving(false);
      onBusyChange?.(false);
    }
  }

  return (
    <section className="detail-section case-tool" aria-label="PDFs">
      <div>
        <h3>PDFs</h3>
        <p className="detail-copy">{role === "plaintiff" ? "Documents you upload and PDFs the firm shares with you."
          : "Plaintiff uploads and PDFs shared by your firm."}</p>
      </div>
      {error ? <LoadError error={error} retry={retry} /> : loading || !items ? <p className="detail-copy" role="status">Loading PDFs…</p> :
        items.length ? (
          <ul className="file-list">
            {items.map((document) => (
              <li className="file-row" key={document.id}>
                <span className="document-icon"><DocumentIcon /></span>
                <div className="case-file-copy">
                  <a className="subtle-link" href={`/api/documents/${document.id}`} target="_blank" rel="noopener">
                    {document.fileName}
                  </a>
                  <small>{document.uploaderName} · <time dateTime={document.createdAt}>{formatDate(document.createdAt)}</time></small>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="detail-empty">No PDFs have been shared yet.</p>}
      {canUpload && items && (
        <form className="case-upload" onSubmit={upload}>
          <label className="field">
            <span>Choose a PDF <span className="case-field-hint">(up to 10 MB)</span></span>
            <input ref={fileInput} type="file" name="file" accept="application/pdf,.pdf" required disabled={disabled || saving} />
          </label>
          <button className="button small" type="submit" disabled={disabled || saving}>{saving ? "Uploading…" : "Upload PDF"}</button>
        </form>
      )}
      <Feedback {...feedback} />
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
      {canWrite && items && (
        <form className="case-note-form" onSubmit={addNote}>
          <label className="field">Private note
            <textarea name="body" required maxLength={maxNoteLength} value={body}
              onChange={(event) => setBody(event.target.value)} disabled={disabled || saving} />
          </label>
          <button className="button small" type="submit" disabled={disabled || saving || !body.trim()}>
            {saving ? "Adding…" : "Add note"}
          </button>
        </form>
      )}
      <Feedback {...feedback} />
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
  const [feedback, setFeedback] = useState<{ error?: string; notice?: string }>({});
  const closeDialog = useRef<HTMLDialogElement>(null);
  const staff = role === "attorney" || role === "paralegal";
  const busy = disabled || !!action;
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
          <p className="detail-copy">{statusCopy[status]}</p>
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
      <LeadDocuments leadId={leadId} canUpload={status !== "closed"} role={role}
        disabled={busy} onBusyChange={(busy) => report("documents", busy)}
        onAccessLost={onAccessLost} refreshVersion={refreshVersion} />
      {role !== "plaintiff" && (
        <Notes key={caseId} caseId={caseId} canWrite={staff && status !== "closed"}
          disabled={busy} onBusyChange={(busy) => report("notes", busy)}
          onAccessLost={onAccessLost} refreshVersion={refreshVersion} />
      )}
    </>
  );
}
