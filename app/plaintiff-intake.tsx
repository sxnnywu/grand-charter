"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { categories, regions } from "@/lib/intake-options";
import { IssueSelect } from "./issue-select";
import "./plaintiff-intake.css";

export type IntakeDraft = {
  title: string;
  name: string;
  email: string;
  region: string;
  category: string;
  description: string;
};
export type IntakeFieldErrors = Partial<Record<keyof IntakeDraft, string>>;

const intakeFields = ["name", "email", "region", "category", "title", "description"] as const;
function validateIntake(form: HTMLFormElement): IntakeFieldErrors {
  const values = new FormData(form);
  const value = (name: keyof IntakeDraft) => String(values.get(name) ?? "").trim();
  const errors: IntakeFieldErrors = {};
  if (!value("name")) errors.name = "Enter your full name.";
  else if (value("name").length > 100) errors.name = "Use 100 characters or fewer for your name.";
  const email = form.elements.namedItem("email") as HTMLInputElement;
  if (!value("email")) errors.email = "Enter your email address.";
  else if (email.validity.typeMismatch || value("email").length > 180) errors.email = "Enter a valid email address.";
  if (!regions.includes(value("region"))) errors.region = "Choose a province.";
  if (!categories.includes(value("category"))) errors.category = "Choose the closest type of legal help.";
  if (value("title").length > 80) errors.title = "Use 80 characters or fewer for the request name.";
  if (!value("description")) errors.description = "Describe what happened and what you need help with.";
  else if (value("description").length > 2500) errors.description = "Use 2,500 characters or fewer.";
  return errors;
}

type IntakeProps = {
  draft: IntakeDraft;
  hasDraft: boolean;
  updateDraft: (draft: IntakeDraft) => void;
  discardDraft: () => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  cancel: () => void;
  submitting: boolean;
  error: string;
  fieldErrors?: IntakeFieldErrors;
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

export function PlaintiffIntake({ draft, hasDraft, updateDraft, discardDraft, submit, cancel, submitting, error, fieldErrors }: IntakeProps) {
  const discardDialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const errorSummary = useRef<HTMLDivElement>(null);
  const [clientErrors, setClientErrors] = useState<IntakeFieldErrors>({});
  const errors = { ...fieldErrors, ...clientErrors };
  const hasFieldErrors = intakeFields.some((field) => !!errors[field]);

  function focusFirstError(nextErrors: IntakeFieldErrors) {
    const name = intakeFields.find((field) => nextErrors[field]);
    const control = name === "category" ? document.getElementById("plaintiff-intake-category") : name && form.current?.elements.namedItem(name);
    if (control instanceof HTMLElement) control.focus();
  }

  useEffect(() => {
    if (submitting || !error) return;
    if (fieldErrors && intakeFields.some((field) => fieldErrors[field])) focusFirstError(fieldErrors);
    else errorSummary.current?.focus();
  }, [error, fieldErrors, submitting]);

  function fieldProps(field: keyof IntakeDraft, helpId?: string) {
    return {
      id: `plaintiff-intake-${field}`,
      "aria-invalid": errors[field] ? true as const : undefined,
      "aria-describedby": [helpId, errors[field] ? `plaintiff-intake-${field}-error` : undefined].filter(Boolean).join(" ") || undefined,
    };
  }

  function fieldError(field: keyof IntakeDraft) {
    return errors[field] ? <small className="plaintiff-intake-field-error" id={`plaintiff-intake-${field}-error`}>{errors[field]}</small> : null;
  }

  function finishEntrance(event: { currentTarget: HTMLDivElement }) {
    event.currentTarget.getAnimations({ subtree: true }).forEach(animation => {
      if ("animationName" in animation && ["intake-arrive", "intake-heading-arrive"].includes(String(animation.animationName))) animation.finish();
    });
  }

  return <div className="plaintiff-intake" onClickCapture={finishEntrance} onKeyDownCapture={finishEntrance}>
    <button className="subtle-link plaintiff-intake-back" type="button" onClick={cancel} disabled={submitting}>
      <Arrow back />My requests
    </button>
    <header className="page-heading plaintiff-intake-heading">
      <h1 tabIndex={-1} ref={focusHeading}><span>Start a request</span></h1>
      <p>Describe your situation so a law firm can review your request.</p>
    </header>
    <div className="plaintiff-intake-layout">
      <form className="panel plaintiff-intake-form" ref={form} aria-label="Request details" noValidate onSubmit={(event) => {
          event.preventDefault();
          const nextErrors = validateIntake(event.currentTarget);
          setClientErrors(nextErrors);
          if (intakeFields.some((field) => nextErrors[field])) {
            requestAnimationFrame(() => focusFirstError(nextErrors));
            return;
          }
          submit(event);
        }}
        onChange={(event) => {
          const fields = new FormData(event.currentTarget);
          updateDraft(Object.fromEntries(intakeFields
            .map((field) => [field, String(fields.get(field) ?? "")])) as IntakeDraft);
          const target = event.target;
          if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
          const name = target.name as keyof IntakeDraft;
          setClientErrors((current) => {
            if (!current[name]) return current;
            const next = { ...current };
            delete next[name];
            return next;
          });
        }}
        aria-busy={submitting} aria-describedby={error || hasFieldErrors ? "plaintiff-intake-error" : undefined}>
        <p className="plaintiff-intake-required">All fields are required unless marked optional.</p>
        {(error || hasFieldErrors) && <div className="workspace-message workspace-error" id="plaintiff-intake-error" role="alert" tabIndex={-1} ref={errorSummary}>
          {hasFieldErrors ? "Check the highlighted details below." : error}
        </div>}
        <fieldset className="plaintiff-intake-group" disabled={submitting}>
          <legend>About you</legend>
          <div className="plaintiff-intake-fields">
            <div className="field"><label htmlFor="plaintiff-intake-name">Full name</label>
              <input {...fieldProps("name")} name="name" autoComplete="name" defaultValue={draft.name} required maxLength={100} />
              {fieldError("name")}
            </div>
            <div className="field"><label htmlFor="plaintiff-intake-email">Email address</label>
              <input {...fieldProps("email")} type="email" name="email" autoComplete="email" defaultValue={draft.email} required maxLength={180} />
              {fieldError("email")}
            </div>
          </div>
        </fieldset>
        <fieldset className="plaintiff-intake-group" disabled={submitting}>
          <legend>About your request</legend>
          <div className="plaintiff-intake-fields">
            <div className="field"><label htmlFor="plaintiff-intake-region">Province</label>
              <select {...fieldProps("region", "plaintiff-intake-region-help")} name="region" required defaultValue={draft.region}>
                <option value="" disabled>Select a province</option>
                {regions.map((region) => <option key={region}>{region}</option>)}
              </select>
              <small id="plaintiff-intake-region-help">Choose the province where your situation took place.</small>
              {fieldError("region")}
            </div>
            <div className="field"><label htmlFor="plaintiff-intake-category">Type of legal help</label>
              <IssueSelect {...fieldProps("category", "plaintiff-intake-category-help")} value={draft.category} disabled={submitting}
                onChange={category => {
                  updateDraft({ ...draft, category });
                  setClientErrors(current => { const next = { ...current }; delete next.category; return next; });
                }} />
              <small id="plaintiff-intake-category-help">Search by the issue, such as pay or renting. Choose the closest fit.</small>
              {fieldError("category")}
            </div>
          </div>
          <div className="field plaintiff-intake-title"><label htmlFor="plaintiff-intake-title">Give this request a short name (optional)</label>
            <input {...fieldProps("title", "plaintiff-intake-title-help")} name="title" defaultValue={draft.title} maxLength={80}
              placeholder="For example, unpaid overtime" />
            <small id="plaintiff-intake-title-help">A name to help you find it later. You can leave this blank.</small>
            {fieldError("title")}
          </div>
          <div className="field plaintiff-intake-description"><label htmlFor="plaintiff-intake-description">What happened?</label>
            <textarea {...fieldProps("description", "plaintiff-intake-description-count")} name="description" rows={5} required maxLength={2500} defaultValue={draft.description}
              placeholder="Describe what happened and what you would like help with." />
            <div className="plaintiff-intake-description-feedback">
              {fieldError("description")}
              <span className="plaintiff-intake-character-count" id="plaintiff-intake-description-count">{draft.description.length.toLocaleString("en-CA")} / 2,500 characters</span>
            </div>
          </div>
        </fieldset>
        <p className="plaintiff-intake-draft-hint">You can switch views and return to finish this request. Nothing is sent until you submit.</p>
        <div className="plaintiff-intake-actions">
          <button className="subtle-link" type="button" onClick={() => discardDialog.current?.showModal()}
            disabled={submitting || !hasDraft}>Discard draft</button>
          <button className="button primary" type="submit" disabled={submitting} aria-busy={submitting}>
            {submitting ? "Submitting…" : "Submit request"}{submitting ? <span className="intake-submit-spinner" aria-hidden="true" /> : <Arrow />}
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
        strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path pathLength="1" d="m5 12 4 4L19 6" /></svg>
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
