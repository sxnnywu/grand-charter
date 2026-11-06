"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import "./firm-record-panel.css";

type Props = {
  drawer: boolean;
  label: string;
  busy: boolean;
  onClose: () => void;
  identity?: ReactNode;
  navigation?: ReactNode;
  recordKey?: string;
  children: ReactNode;
};

const focusable = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

export function FirmRecordPanel({ drawer, label, busy, onClose, identity, navigation, recordKey, children }: Props) {
  const panel = useRef<HTMLElement>(null);
  const panelIdentity = useRef<HTMLDivElement>(null);
  const previousDrawer = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const controls = useRef({ busy, onClose });
  controls.current = { busy, onClose };

  // Capture the trigger before child heading refs move focus during the commit.
  if (drawer && !previousDrawer.current && typeof document !== "undefined") {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  previousDrawer.current = drawer;

  useLayoutEffect(() => {
    if (panel.current) panel.current.scrollTop = 0;
  }, [recordKey]);

  useLayoutEffect(() => {
    const element = panel.current;
    if (!drawer || !element) return;
    const captured = returnFocus.current;
    const trigger = captured && captured !== document.body && !element.contains(captured)
      ? captured : document.querySelector<HTMLElement>('.firm-case-card[aria-pressed="true"], .firm-row[aria-pressed="true"], .admin-record-link[aria-expanded="true"]');
    const triggerLabel = trigger?.getAttribute("aria-label");
    const recordId = trigger?.dataset.recordId;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbar > 0) body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + scrollbar}px`;
    body.style.overflow = "hidden";

    const nestedDialogOpen = () => !!document.querySelector("dialog[open]");
    const targets = () => Array.from(element.querySelectorAll<HTMLElement>(focusable)).filter((target) =>
      target.tabIndex >= 0 && !target.matches(":disabled") && target.getClientRects().length > 0 && getComputedStyle(target).visibility !== "hidden" && !target.closest("[inert], [hidden]"));
    const focusFirst = () => (targets()[0] ?? element).focus({ preventScroll: true });
    if (!element.contains(document.activeElement) && !nestedDialogOpen()) (panelIdentity.current ?? element).focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (nestedDialogOpen()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!controls.current.busy) controls.current.onClose();
      } else if (event.key === "Tab") {
        const candidates = targets();
        const index = candidates.indexOf(document.activeElement as HTMLElement);
        if (!candidates.length) {
          event.preventDefault();
          element.focus({ preventScroll: true });
        } else if (index < 0 || (!event.shiftKey && index === candidates.length - 1) || (event.shiftKey && index === 0)) {
          event.preventDefault();
          candidates[event.shiftKey ? candidates.length - 1 : 0].focus({ preventScroll: true });
        }
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (!element.contains(event.target as Node) && !nestedDialogOpen()) focusFirst();
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocus);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocus);
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
      queueMicrotask(() => {
        // Switching to the inline layout keeps the same detail and its focus.
        if (element.isConnected && !element.classList.contains("is-drawer")) return;
        if (document.querySelector("dialog[open]")) return;
        // A progress refresh can replace the opening card while the drawer is open.
        const restored = trigger?.isConnected ? trigger
          : recordId ? Array.from(document.querySelectorAll<HTMLElement>("[data-record-id]")).find((target) => target.dataset.recordId === recordId)
            : triggerLabel ? Array.from(document.querySelectorAll<HTMLElement>("[aria-label]")).find((target) => target.getAttribute("aria-label") === triggerLabel)
              : undefined;
        const target = restored ?? document.querySelector<HTMLElement>(".firm-page-heading h1");
        if (target && !target.closest("[inert], [hidden]") && target.getClientRects().length) target.focus({ preventScroll: true });
      });
    };
  }, [drawer]);

  return <>
    {drawer && <button className="firm-record-panel-backdrop" type="button" tabIndex={-1}
      aria-hidden="true" disabled={busy} onClick={() => { if (!busy) onClose(); }} />}
    <section className={`workspace-record firm-reading firm-record-panel${drawer ? " is-drawer" : ""}`}
      ref={panel} aria-label={label} role={drawer ? "dialog" : undefined} aria-modal={drawer ? true : undefined} tabIndex={drawer ? -1 : undefined}>
      <header className="firm-record-panel-chrome" hidden={!drawer}>
        <div ref={panelIdentity} className="firm-record-panel-identity" tabIndex={drawer ? -1 : undefined} aria-live="polite">{identity ?? <p>{label}</p>}</div>
        <div className="firm-record-panel-actions">
          {navigation && <div className="firm-record-panel-navigation">{navigation}</div>}
          <button className="firm-record-panel-close" type="button" aria-label={`Close ${label.toLowerCase()}`} disabled={busy}
            onClick={() => { if (!busy) onClose(); }}>
            <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div>
      </header>
      <div className="firm-record-panel-content">{children}</div>
    </section>
  </>;
}
