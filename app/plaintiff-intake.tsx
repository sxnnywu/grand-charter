"use client";

import { useRef, type FormEvent } from "react";
import { categories, regions } from "@/lib/intake-options";
import "./plaintiff-intake.css";

export type IntakeDraft = {
  name: string;
  email: string;
  region: string;
  category: string;
  description: string;
};

type IntakeProps = {
  draft: IntakeDraft;
  hasDraft: boolean;
  updateDraft: (draft: IntakeDraft) => void;
  discardDraft: () => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  cancel: () => void;
  submitting: boolean;
  error: string;
};

export type SubmittedRequestSummary = {
  category: string;
  firmName: string | null;
  status: string;
};

function Arrow({ back = false }: { back?: boolean }) {
  return <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
    <path d={back ? "M20 12H5m6 6-6-6 6-6" : "M4 12h15m-6-6 6 6-6 6"} />
  </svg>;
}

function focusHeading(heading: HTMLHeadingElement | null) {
  heading?.focus({ preventScroll: true });
}

export function PlaintiffIntake({ draft, hasDraft, updateDraft, discardDraft, submit, cancel, submitting, error }: IntakeProps) {
  const discardDialog = useRef<HTMLDialogElement>(null);
  return <div className="plaintiff-intake">
    <button className="subtle-link plaintiff-intake-back" type="button" onClick={cancel} disabled={submitting}>
      <Arrow back />My requests
    </button>
    <header className="page-heading plaintiff-intake-heading">
      <h1 tabIndex={-1} ref={focusHeading}>Start a request</h1>
      <p>Describe your situation so a law firm can review your request.</p>
    </header>
    <div className="plaintiff-intake-layout">
      <form className="panel plaintiff-intake-form" aria-label="Request details" onSubmit={submit}
        onChange={(event) => {
          const fields = new FormData(event.currentTarget);
          updateDraft(Object.fromEntries(["name", "email", "region", "category", "description"]
            .map((field) => [field, String(fields.get(field) ?? "")])) as IntakeDraft);
        }}
        aria-busy={submitting} aria-describedby={error ? "plaintiff-intake-error" : undefined}>
        <p className="plaintiff-intake-required">All fields are required.</p>
        <fieldset className="plaintiff-intake-group" disabled={submitting}>
          <legend>About you</legend>
          <div className="plaintiff-intake-fields">
            <label className="field">Full name
              <input name="name" autoComplete="name" defaultValue={draft.name} required maxLength={100} />
            </label>
            <label className="field">Email address
              <input type="email" name="email" autoComplete="email" defaultValue={draft.email} required maxLength={180} />
            </label>
          </div>
        </fieldset>
        <fieldset className="plaintiff-intake-group" disabled={submitting}>
          <legend>About your request</legend>
          <div className="plaintiff-intake-fields">
            <label className="field">Province
              <select name="region" required defaultValue={draft.region}>
                <option value="" disabled>Select a province</option>
                {regions.map((region) => <option key={region}>{region}</option>)}
              </select>
            </label>
            <label className="field">Type of legal help
              <select name="category" required defaultValue={draft.category} aria-describedby="plaintiff-intake-category-help">
                <option value="" disabled>Select a type</option>
                {categories.map((category) => <option key={category}>{category}</option>)}
              </select>
              <small id="plaintiff-intake-category-help">Choose the closest fit for your situation.</small>
            </label>
          </div>
          <label className="field plaintiff-intake-description">What happened?
            <textarea name="description" rows={5} required maxLength={2500} defaultValue={draft.description}
              placeholder="Describe what happened and what you would like help with." />
          </label>
        </fieldset>
        <p className="plaintiff-intake-draft-hint">You can switch views and return to finish this request. Nothing is sent until you submit.</p>
        {error && <p className="workspace-message workspace-error" id="plaintiff-intake-error" role="alert">{error}</p>}
        <div className="plaintiff-intake-actions">
          <button className="subtle-link" type="button" onClick={() => discardDialog.current?.showModal()}
            disabled={submitting || !hasDraft}>Discard draft</button>
          <button className="button primary" type="submit" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit request"}<Arrow />
          </button>
        </div>
      </form>
      <aside className="panel plaintiff-intake-next" aria-labelledby="plaintiff-intake-next-heading">
        <h2 id="plaintiff-intake-next-heading">What happens next</h2>
        <ol>
          <li><span aria-hidden="true">1</span><div><h3>Your request reaches a law firm</h3>
            <p>Your request goes to a law firm. If no firm matches, an administrator will assign one.</p>
          </div></li>
          <li><span aria-hidden="true">2</span><div><h3>The firm decides whether it can help</h3>
            <p>You can check its decision here.</p>
          </div></li>
          <li><span aria-hidden="true">3</span><div><h3>Follow progress here</h3>
            <p>Return to see updates. If a firm accepts, you can follow the case here.</p>
          </div></li>
        </ol>
        <p className="plaintiff-intake-documents">You can add supporting PDFs after submitting.</p>
      </aside>
    </div>
    <dialog ref={discardDialog} aria-labelledby="discard-draft-title" aria-describedby="discard-draft-description">
      <div className="dialog-head"><h2 id="discard-draft-title">Discard this draft?</h2></div>
      <div className="dialog-body"><p id="discard-draft-description">Your changes will be lost. You can start a new request later.</p></div>
      <form method="dialog" className="dialog-footer">
        <button className="button" type="submit">Keep editing</button>
        <button className="button primary danger" type="button" onClick={() => {
          discardDialog.current?.close();
          discardDraft();
        }}>Discard draft</button>
      </form>
    </dialog>
  </div>;
}

export function RequestSubmitted({ lead, onView }: { lead: SubmittedRequestSummary; onView: () => void }) {
  const assigned = lead.status === "awaiting_firm_review" && !!lead.firmName;
  return <section className="panel plaintiff-confirmation motion-enter motion-detail"
    aria-labelledby="plaintiff-confirmation-heading">
    <span className="plaintiff-confirmation-mark" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>
    </span>
    <p className="plaintiff-confirmation-category">{lead.category}</p>
    <h1 id="plaintiff-confirmation-heading" tabIndex={-1} ref={focusHeading}>Request submitted</h1>
    <p className="plaintiff-confirmation-summary">{assigned
      ? `${lead.firmName} has received your request.`
      : "Your request is waiting for a law firm."}</p>
    <div className="plaintiff-confirmation-next">
      <h2>What happens next</h2>
      <p>{assigned
        ? "The firm will decide whether it can help. You don’t need to do anything right now."
        : "An administrator will assign a law firm. You don’t need to do anything right now."}</p>
      <p>You can follow progress here and add supporting PDFs if you have them.</p>
    </div>
    <button className="button primary" type="button" onClick={onView}>View your request<Arrow /></button>
  </section>;
}
