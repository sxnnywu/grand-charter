"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import "./case-tools.css";

type Role = "plaintiff" | "attorney" | "paralegal" | "admin";
type CaseStatus = "open" | "in_progress" | "closed";
type BusyChange = (busy: boolean) => void;
type CaseTool = "progress" | "notes";

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
const maxNoteLength = 2000;

function formatDate(value: string) {
  return dateTime.format(new Date(value));
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...options });
  const body = await response.json().catch(() => null);
  if (!response.ok || body === null) {
    throw new Error(body?.error ?? "This request could not be completed. Try again.");
  }
  return body;
}

function jsonRequest(method: "POST" | "PATCH", body: Record<string, string>): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function useRecords<T>(path: string, field: string) {
  const [items, setItems] = useState<T[]>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    request<Record<string, T[]>>(path, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setItems(result[field]); })
      .catch((failure: Error) => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [path, field, attempt]);

  function retry() {
    setError("");
    setAttempt((current) => current + 1);
  }

  function add(item: T) {
    setItems((current) => [item, ...(current ?? [])]);
  }

  return { items, error, retry, add };
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

function Notes({ caseId, canWrite, disabled, onBusyChange }: {
  caseId: string;
  canWrite: boolean;
  disabled: boolean;
  onBusyChange: BusyChange;
}) {
  const path = `/api/cases/${caseId}/notes`;
  const { items, error, retry, add } = useRecords<FirmNote>(path, "notes");
  const [saving, setSaving] = useState(false);
  const [body, setBody] = useState("");
  const [feedback, setFeedback] = useState<{ error?: string; notice?: string }>({});

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || saving || !body.trim()) return;
    setSaving(true);
    setFeedback({});
    onBusyChange(true);
    try {
      const { note } = await request<{ note: FirmNote }>(path, jsonRequest("POST", { body }));
      add(note);
      setBody("");
      setFeedback({ notice: "Private note added." });
    } catch (failure) {
      setFeedback({ error: (failure as Error).message });
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
      {error ? <LoadError error={error} retry={retry} /> : !items ? <p className="detail-copy" role="status">Loading notes…</p> :
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
    </section>
  );
}

export function CaseTools({ caseId, status, role, onStatusChange, onBusyChange }: {
  caseId: string;
  status: CaseStatus;
  role: Role;
  onStatusChange: (status: CaseStatus) => void;
  onBusyChange?: BusyChange;
}) {
  const [action, setAction] = useState<CaseTool>();
  const [feedback, setFeedback] = useState<{ error?: string; notice?: string }>({});
  const closeDialog = useRef<HTMLDialogElement>(null);
  const staff = role === "attorney" || role === "paralegal";
  const currentStage = stages.findIndex((stage) => stage.status === status);
  const nextStatus = status === "open" ? "in_progress" : status === "in_progress" ? "closed" : undefined;

  function report(tool: CaseTool, busy: boolean) {
    setAction(busy ? tool : undefined);
    onBusyChange?.(busy);
  }

  async function updateProgress() {
    if (!nextStatus || action) return;
    report("progress", true);
    setFeedback({});
    try {
      const updated = await request<{ status: CaseStatus }>(`/api/cases/${caseId}/status`, jsonRequest("PATCH", { status: nextStatus }));
      onStatusChange(updated.status);
      setFeedback({ notice: updated.status === "closed" ? "Case closed." : "Case progress updated." });
    } catch (failure) {
      setFeedback({ error: (failure as Error).message });
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
              type="button" disabled={!!action} onClick={() => {
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
                  <button className="button primary danger" type="button" onClick={() => {
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
      {role !== "plaintiff" && (
        <Notes key={caseId} caseId={caseId} canWrite={staff && status !== "closed"}
          disabled={!!action} onBusyChange={(busy) => report("notes", busy)} />
      )}
    </>
  );
}
