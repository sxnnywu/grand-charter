"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { categories, regions } from "@/lib/intake-options";
import { AdminTools, type Firm } from "./admin-tools";
import { isAccessError, messageFor, post, request } from "./api-client";
import { CaseTools, LeadDocuments } from "./case-tools";
import { animateWorkspace, observeScrollReveals, stopWorkspaceTransition } from "./workspace-motion";

type Role = "plaintiff" | "attorney" | "paralegal" | "admin";
type Account = { id: string; name: string; email: string; role: Role; firmName: string | null };
type User = Omit<Account, "email"> & { firmId: string | null };
type Session = { user: User | null; accounts: Account[] };
type LeadStatus = "pending_assignment" | "awaiting_firm_review" | "accepted" | "declined" | "closed";
type CaseStatus = "open" | "in_progress" | "closed";
type StaffFilter = LeadStatus | "all" | "cases";
type PlaintiffNotice = { id: string; message: string; createdAt: string };
export type Lead = {
  id: string;
  name: string;
  email: string;
  category: string;
  region: string;
  description: string;
  status: LeadStatus;
  createdAt: string;
  caseId: string | null;
  caseStatus: CaseStatus | null;
  firmId: string | null;
  firmName: string | null;
  notices?: PlaintiffNotice[];
  latestNotice?: PlaintiffNotice | null;
};
type Case = Pick<Lead, "id" | "name" | "category" | "region" | "firmName" | "createdAt"> & {
  leadId: string;
  status: CaseStatus;
};
type LeadResult = { id: string; lead: Lead } | { id: string; error: string };
type RecordPage = { leads: Lead[]; nextCursor: string | null };

async function loadRecords(path: string, signal: AbortSignal): Promise<RecordPage> {
  if (path.startsWith("/api/cases")) {
    const { cases, nextCursor } = await request<{ cases: { lead: Lead }[]; nextCursor: string | null }>(path, { signal });
    return { leads: cases.map(({ lead }) => lead), nextCursor };
  }
  return request<RecordPage>(path, { signal });
}
type LeadDecision = "accept" | "decline";

const statuses: Record<LeadStatus | CaseStatus, [string, string]> = {
  pending_assignment: ["Pending assignment", "pending"],
  awaiting_firm_review: ["Awaiting firm review", "review"],
  accepted: ["Accepted", "accepted"],
  declined: ["Declined", "declined"],
  open: ["Open", "open"],
  in_progress: ["In progress", "progress"],
  closed: ["Closed", "closed"],
};
const dateFormat = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" });
const glyphs = {
  folio: "M7 3.5h7l4 4V20H7V3.5ZM14 3.5v4h4M4 7v15h11M10 12h5m-5 4h5",
  requests: "M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z",
  plus: "M12 5v14M5 12h14",
  file: "M6 3h8l4 4v13H6ZM14 3v5h4m-8 5h4m-4 4h4",
  inbox: "M4 4h16l2 10v6H2v-6Zm-2 10h6l2 3h4l2-3h6",
  chevron: "m9 6 6 6-6 6",
  down: "m6 9 6 6 6-6",
  arrow: "M4 12h15m-6-6 6 6-6 6",
  back: "M20 12H5m6 6-6-6 6-6",
  check: "m5 12 4 4L19 6",
  case: "M3 7h18v13H3Zm5 0V4h8v3M3 13h18m-9 0v2",
} as const;

function Icon({ name, size = 18 }: { name: keyof typeof glyphs; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <path d={glyphs[name]} />
    </svg>
  );
}

function Brand() {
  return <div className="brand"><span className="brand-mark"><Icon name="folio" size={23} /></span>Grand Charter</div>;
}

function Badge({ status, label }: { status: LeadStatus | CaseStatus; label?: string }) {
  return <span className={`badge status-${statuses[status][1]}`}>{label ?? statuses[status][0]}</span>;
}

function Message({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div role={error ? "alert" : "status"} className={`workspace-message motion-enter motion-feedback${error ? " workspace-error" : ""}`}>{children}</div>;
}

function roleName(user: Pick<User, "role" | "firmName">) {
  if (user.role === "plaintiff") return "Plaintiff portal";
  if (user.role === "admin") return "Platform admin";
  return user.firmName ?? "Firm workspace";
}

function requestTitle(lead: Lead) {
  const firstLine = lead.description.trim().split(/(?<=[.!?])\s+|\n/)[0];
  if (!firstLine) return lead.category;
  return firstLine.length <= 84 ? firstLine : `${firstLine.slice(0, 81).trimEnd()}…`;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("");
}

function focusHeading(heading: HTMLHeadingElement | null) {
  heading?.focus({ preventScroll: true });
}

function writeRecordUrl(leadId?: string, caseId?: string, replace = false) {
  const url = new URL(window.location.href);
  url.searchParams.delete("lead");
  url.searchParams.delete("case");
  if (leadId) url.searchParams.set("lead", leadId);
  if (caseId) url.searchParams.set("case", caseId);
  if (url.href === window.location.href) return;
  if (replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
}

export function Workspace() {
  const [session, setSession] = useState<Session>();
  const [entrySettled, setEntrySettled] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [sessionAction, setSessionAction] = useState<"sign-in" | "sign-out" | "switch" | null>(null);
  const sessionBusy = useRef(false);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const verifySession = useCallback(async (signal?: AbortSignal) => {
    if (sessionBusy.current) return false;
    const next = await request<Session>("/api/session", { signal });
    if (signal?.aborted || sessionBusy.current) return false;
    const current = sessionRef.current?.user;
    if (current?.id === next.user?.id && current?.role === next.user?.role && current?.firmId === next.user?.firmId) return true;
    stopWorkspaceTransition();
    writeRecordUrl(undefined, undefined, true);
    setSession(next);
    return false;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    request<Session>("/api/session", { signal: controller.signal })
      .then(setSession)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setSessionError(messageFor(error));
      });
    return () => controller.abort();
  }, [sessionAttempt]);

  async function startSession(email: string, action: "sign-in" | "switch") {
    if (sessionBusy.current) return;
    sessionBusy.current = true;
    stopWorkspaceTransition();
    setSessionError("");
    setSessionAction(action);
    try {
      const { user } = await post<Pick<Session, "user">>("/api/session", {
        email,
        password: "grand-charter-demo",
      });
      if (action === "switch") {
        writeRecordUrl(undefined, undefined, true);
        window.scrollTo(0, 0);
      }
      setSession((current) => current && { ...current, user });
    } catch (error) {
      setSessionError(messageFor(error));
    } finally {
      sessionBusy.current = false;
      setSessionAction(null);
    }
  }

  function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      if (sessionError) {
        setSessionError("");
        setSessionAttempt((attempt) => attempt + 1);
      }
      return;
    }
    const fields = new FormData(event.currentTarget);
    void startSession(String(fields.get("email")), "sign-in");
  }

  async function signOut() {
    if (sessionBusy.current) return;
    sessionBusy.current = true;
    stopWorkspaceTransition();
    setSessionError("");
    setSessionAction("sign-out");
    try {
      await request("/api/session", { method: "DELETE" });
      writeRecordUrl(undefined, undefined, true);
      setSession((current) => current && { ...current, user: null });
    } catch (error) {
      setSessionError(messageFor(error));
    } finally {
      sessionBusy.current = false;
      setSessionAction(null);
    }
  }

  if (session?.user) {
    const email = session.accounts.find((account) => account.id === session.user?.id)?.email ?? "";
    return <Portal key={`${session.user.id}:${session.user.role}:${session.user.firmId}`} user={session.user} email={email} signOut={signOut}
      accounts={session.accounts} switchAccount={(email) => startSession(email, "switch")}
      sessionAction={sessionAction === "sign-in" ? null : sessionAction} sessionError={sessionError} verifySession={verifySession} />;
  }

  return (
    <main className="demo-entry" data-settled={entrySettled || undefined}
      onFocusCapture={() => setEntrySettled(true)} onPointerDownCapture={() => setEntrySettled(true)}>
      <section className="panel demo-entry-card" aria-labelledby="demo-heading" onAnimationEnd={(event) => {
        if (event.animationName === "sign-in-arrive") setEntrySettled(true);
      }}>
        <Brand />
        <header className="page-heading">
          <h1 id="demo-heading">Sign in to the demo</h1>
          <p>Choose a demo account to try the workspace.</p>
        </header>
        {sessionError && <Message error>{sessionError}</Message>}
        <p className="visually-hidden" role="status">
          {session ? "Demo accounts ready." : sessionError ? "" : "Loading demo accounts…"}
        </p>
        <form className="form-stack" onSubmit={signIn} aria-busy={!session && !sessionError}>
          <label className="field">Demo account
            <select name="email" required defaultValue="" disabled={!session || !!sessionAction}>
              <option value="" disabled>{session ? "Choose an account" : sessionError ? "Accounts unavailable" : "Loading accounts…"}</option>
              {session?.accounts.map((account) => (
                <option key={account.id} value={account.email}>{account.name} · {roleName(account)}</option>
              ))}
            </select>
          </label>
          <button className="button primary" disabled={!!sessionAction || (!session && !sessionError) || session?.accounts.length === 0} type="submit">
            {!session && sessionError ? "Try again" : sessionAction ? "Signing in…" : "Sign in"} <Icon name="arrow" size={16} />
          </button>
        </form>
        <p className="demo-notice">Use fictional information in this demo.</p>
      </section>
    </main>
  );
}

const accountGroups: { title: string; roles: Role[] }[] = [
  { title: "Plaintiffs", roles: ["plaintiff"] },
  { title: "Firm staff", roles: ["attorney", "paralegal"] },
  { title: "Admin", roles: ["admin"] },
];

function AccountSwitcher({ user, accounts, disabled, switching, onSwitch }: {
  user: User; accounts: Account[]; disabled: boolean; switching: boolean; onSwitch: (email: string) => void;
}) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      const menu = disclosure.current;
      if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  function closeAndFocus() {
    if (disclosure.current) disclosure.current.open = false;
    trigger.current?.focus();
  }

  return (
    <details className="account-switcher" ref={disclosure}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && event.currentTarget.open) {
          event.preventDefault();
          closeAndFocus();
        }
      }}>
      <summary className="button small account-trigger" ref={trigger} aria-disabled={disabled || undefined}
        aria-label={switching ? "Switching account" : `Switch account, currently ${user.name}`}
        onClick={(event) => { if (disabled) event.preventDefault(); }}>
        <span className="account-avatar" aria-hidden="true">{initials(user.name)}</span>
        <span>{switching ? "Switching…" : "Switch account"}</span>
        <Icon name="down" size={14} />
      </summary>
      <div className="account-menu" aria-label="Demo accounts">
        {accountGroups.map(({ title, roles }) => {
          const group = accounts.filter((account) => roles.includes(account.role));
          return group.length > 0 && <div className="account-group" key={title}>
            <h2>{title}</h2>
            {group.map((account) => {
              const current = account.id === user.id;
              return (
                <button className="account-option" type="button" key={account.id} aria-current={current || undefined}
                  disabled={disabled || current} onClick={() => { closeAndFocus(); onSwitch(account.email); }}>
                  <span className="account-avatar" aria-hidden="true">{initials(account.name)}</span>
                  <span className="account-option-copy">
                    <strong>{account.name}</strong>
                    {account.firmName && <small>{account.role === "paralegal" ? "Paralegal" : "Attorney"} · {account.firmName}</small>}
                  </span>
                  {current && <Icon name="check" size={16} />}
                </button>
              );
            })}
          </div>;
        })}
      </div>
    </details>
  );
}

function Portal({ user, email, accounts, switchAccount, signOut, sessionAction, sessionError, verifySession }: {
  user: User; email: string; accounts: Account[]; switchAccount: (email: string) => void; signOut: () => void;
  sessionAction: "sign-out" | "switch" | null; sessionError: string;
  verifySession: (signal?: AbortSignal) => Promise<boolean>;
}) {
  const isPlaintiff = user.role === "plaintiff";
  const isAdmin = user.role === "admin";
  const home = isPlaintiff ? "My requests" : isAdmin ? "Lead queue" : "Lead inbox";
  const [composing, setComposing] = useState(false);
  const [leads, setLeads] = useState<Lead[]>();
  const [listError, setListError] = useState("");
  const [listAttempt, setListAttempt] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [moreError, setMoreError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const moreRequest = useRef<AbortController | null>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [leadResult, setLeadResult] = useState<LeadResult>();
  const [caseId, setCaseId] = useState<string>();
  const [notice, setNotice] = useState("");
  const [action, setAction] = useState<LeadDecision | "submit">();
  const [actionError, setActionError] = useState("");
  const [filter, setFilter] = useState<StaffFilter>(isAdmin ? "all" : "awaiting_firm_review");
  const [region, setRegion] = useState("");
  const [category, setCategory] = useState("");
  const [firmFilter, setFirmFilter] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [firms, setFirms] = useState<Firm[]>([]);
  const [firmsError, setFirmsError] = useState("");
  const [firmsAttempt, setFirmsAttempt] = useState(0);
  const [childBusy, setChildBusy] = useState(false);
  const [accessChecking, setAccessChecking] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const mutationBusy = useRef(false);
  mutationBusy.current = action !== undefined || childBusy;
  const accessBlocked = useRef(false);
  accessBlocked.current = accessChecking || !!accessError;
  const recheckAccess = useRef<() => void>(() => {});
  const pendingRecheck = useRef(false);
  const intakeAttempt = useRef<{ payload: string; key: string } | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const requestListScroll = useRef<number | null>(null);
  const currentResult = leadResult?.id === selectedId ? leadResult : undefined;
  const lead = currentResult && "lead" in currentResult ? currentResult.lead : undefined;
  const recordError = currentResult && "error" in currentResult ? currentResult.error : undefined;
  const acting = action !== undefined || childBusy || accessChecking || !!accessError;
  const parameters = new URLSearchParams();
  if (!isPlaintiff && filter !== "all" && filter !== "cases") parameters.set("status", filter);
  if (region) parameters.set("region", region);
  if (category) parameters.set("category", category);
  if (firmFilter) parameters.set("firmId", firmFilter);
  if (query) parameters.set("q", query);
  const listUrl = `/api/${filter === "cases" ? "cases" : "leads"}?${parameters}`;

  const onAccessLost = useCallback(() => {
    if (selectedRef.current !== selectedId) return;
    stopWorkspaceTransition();
    setSelectedId(undefined);
    setCaseId(undefined);
    setLeadResult(undefined);
    setChildBusy(false);
    setAction(undefined);
    setActionError("");
    setAccessError("");
    setLeads((current) => current?.filter(({ id }) => id !== selectedId));
    setListAttempt((attempt) => attempt + 1);
    writeRecordUrl(undefined, undefined, true);
    setNotice("This record is no longer available to your account. The list has been refreshed.");
    void verifySession().catch(() => {});
  }, [selectedId, verifySession]);

  useEffect(() => {
    let controller: AbortController | undefined;
    let disposed = false;
    async function checkAccess() {
      if (controller || document.visibilityState === "hidden") return;
      if (mutationBusy.current) {
        pendingRecheck.current = true;
        return;
      }
      pendingRecheck.current = false;
      controller = new AbortController();
      const signal = controller.signal;
      accessBlocked.current = true;
      setAccessChecking(true);
      setAccessError("");
      try {
        if (!await verifySession(signal) || disposed) return;
        if (selectedId) {
          const [{ lead }] = await Promise.all([
            request<{ lead: Lead }>(`/api/leads/${selectedId}`, { signal }),
            caseId ? request(`/api/cases/${caseId}`, { signal }) : Promise.resolve(),
          ]);
          if (disposed || signal.aborted) return;
          setLeadResult({ id: selectedId, lead });
          if (!isPlaintiff && !isAdmin) setFilter(lead.status);
        }
        setRefreshVersion((version) => version + 1);
        setListAttempt((attempt) => attempt + 1);
      } catch (error) {
        if (disposed || signal.aborted) return;
        if (isAccessError(error)) onAccessLost();
        else setAccessError("We couldn’t check your current access. Your draft is still here. Reconnect and try again.");
      } finally {
        if (!disposed) {
          controller = undefined;
          setAccessChecking(false);
        }
      }
    }
    recheckAccess.current = () => { void checkAccess(); };
    const onVisible = () => { if (document.visibilityState === "visible") void checkAccess(); };
    window.addEventListener("focus", recheckAccess.current);
    document.addEventListener("visibilitychange", onVisible);
    const onFocus = recheckAccess.current;
    return () => {
      disposed = true;
      controller?.abort();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      setAccessChecking(false);
    };
  }, [selectedId, caseId, isPlaintiff, isAdmin, verifySession, onAccessLost]);

  useEffect(() => {
    if (action === undefined && !childBusy && pendingRecheck.current) recheckAccess.current();
  }, [action, childBusy]);

  useEffect(() => {
    function restoreRecord() {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("lead") || undefined;
      const linkedCase = params.get("case") || undefined;
      setSelectedId(id);
      setCaseId(id ? linkedCase : undefined);
      setComposing(false);
      setActionError("");
      setNotice("");
      if (linkedCase) setFilter(isAdmin ? "cases" : "accepted");
    }
    restoreRecord();
    const onHistory = () => animateWorkspace("page", restoreRecord);
    window.addEventListener("popstate", onHistory);
    return () => window.removeEventListener("popstate", onHistory);
  }, [isAdmin]);

  useEffect(() => observeScrollReveals(content.current), [leads, filter, composing, selectedId]);

  useLayoutEffect(() => {
    if (!isPlaintiff || !matchMedia("(max-width: 760px)").matches) return;
    if (selectedId) {
      window.scrollTo(0, 0);
    } else if (requestListScroll.current !== null) {
      window.scrollTo(0, requestListScroll.current);
      requestListScroll.current = null;
    }
  }, [isPlaintiff, selectedId, caseId]);

  useEffect(() => {
    const controller = new AbortController();
    setListLoading(true);
    setListError("");
    setMoreError("");
    setLoadingMore(false);
    setNextCursor(null);
    loadRecords(listUrl, controller.signal)
      .then(({ leads, nextCursor }) => {
        if (controller.signal.aborted) return;
        setLeads(leads);
        setNextCursor(nextCursor);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setListError(messageFor(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setListLoading(false);
      });
    return () => {
      controller.abort();
      moreRequest.current?.abort();
      moreRequest.current = null;
    };
  }, [listUrl, listAttempt]);

  useEffect(() => {
    if (!isAdmin) return;
    const controller = new AbortController();
    request<{ firms: Firm[] }>("/api/firms", { signal: controller.signal })
      .then(({ firms }) => { if (!controller.signal.aborted) setFirms(firms); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setFirmsError(messageFor(error)); });
    return () => controller.abort();
  }, [isAdmin, firmsAttempt]);

  async function showMore() {
    if (!nextCursor || moreRequest.current) return;
    const controller = new AbortController();
    moreRequest.current = controller;
    setLoadingMore(true);
    setMoreError("");
    try {
      const more = await loadRecords(`${listUrl}&before=${nextCursor}`, controller.signal);
      if (controller.signal.aborted) return;
      setLeads((current) => {
        const seen = new Set(current?.map(({ id }) => id));
        return [...(current ?? []), ...more.leads.filter(({ id }) => !seen.has(id))];
      });
      setNextCursor(more.nextCursor);
    } catch (error) {
      if (!controller.signal.aborted) setMoreError(messageFor(error));
    } finally {
      if (moreRequest.current === controller) {
        moreRequest.current = null;
        setLoadingMore(false);
      }
    }
  }

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    request<{ lead: Lead }>(`/api/leads/${encodeURIComponent(selectedId)}`, { signal: controller.signal })
      .then(({ lead }) => {
        if (controller.signal.aborted) return;
        setLeadResult({ id: selectedId, lead });
        if (!isPlaintiff && !isAdmin) setFilter(lead.status);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isAccessError(error)) onAccessLost();
        else setLeadResult({ id: selectedId, error: messageFor(error) });
      });
    return () => controller.abort();
  }, [selectedId, isPlaintiff, isAdmin, onAccessLost]);

  function applySelection(id?: string, linkedCase?: string) {
    if (selectedId !== id) setLeadResult(undefined);
    setSelectedId(id);
    setCaseId(linkedCase);
    setActionError("");
    setAccessError("");
    setNotice("");
    writeRecordUrl(id, linkedCase);
  }

  function select(id?: string, linkedCase?: string) {
    if (selectedId === id && caseId === linkedCase) return;
    const mobileSheet = isPlaintiff && matchMedia("(max-width: 760px)").matches;
    if (mobileSheet && !selectedId && id) requestListScroll.current = window.scrollY;
    animateWorkspace(mobileSheet ? "page" : "detail", () => applySelection(id, linkedCase));
  }

  function selectCase(id?: string) {
    animateWorkspace("detail", () => {
      setCaseId(id);
      writeRecordUrl(selectedId, id);
    });
  }

  function showIntake(show: boolean) {
    if (show === composing && !selectedId) return;
    animateWorkspace("page", () => {
      intakeAttempt.current = null;
      applySelection();
      setComposing(show);
      window.scrollTo(0, 0);
    });
  }

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutationBusy.current || accessBlocked.current) return;
    mutationBusy.current = true;
    const form = new FormData(event.currentTarget);
    setActionError("");
    setAction("submit");
    try {
      const input = Object.fromEntries(["name", "email", "region", "category", "description"]
        .map((name) => {
          const value = String(form.get(name) ?? "");
          return [name, ["name", "email", "description"].includes(name) ? value.trim() : value];
        }));
      const payload = JSON.stringify(input);
      if (intakeAttempt.current?.payload !== payload) intakeAttempt.current = { payload, key: crypto.randomUUID() };
      const { lead: created } = await post<{ lead: Lead }>("/api/leads", input, {
        "Idempotency-Key": intakeAttempt.current.key,
      });
      intakeAttempt.current = null;
      setLeads((current) => [created, ...(current ?? []).filter(({ id }) => id !== created.id)]);
      applySelection(created.id);
      setLeadResult({ id: created.id, lead: created });
      setComposing(false);
      setNotice("Your request was submitted.");
    } catch (error) {
      setActionError(messageFor(error));
    } finally {
      mutationBusy.current = false;
      setAction(undefined);
    }
  }

  async function decideLead(decision: LeadDecision) {
    if (!lead || acting || mutationBusy.current || accessBlocked.current) return;
    mutationBusy.current = true;
    setActionError("");
    setAction(decision);
    try {
      let updated: Lead;
      if (decision === "accept") {
        const { caseId } = await request<{ caseId: string }>(`/api/leads/${lead.id}/accept`, { method: "POST" });
        updated = { ...lead, status: "accepted", caseId, caseStatus: "open" };
      } else {
        const { lead: declined } = await request<{ lead: Lead }>(`/api/leads/${lead.id}/decline`, { method: "POST" });
        updated = declined;
      }
      setLeads((current) => current?.map((item) => item.id === updated.id ? updated : item));
      setLeadResult({ id: updated.id, lead: updated });
      setFilter(updated.status);
      setNotice(decision === "accept" ? "Lead accepted and case opened." : "Lead declined and sent to admin review.");
    } catch (error) {
      if (isAccessError(error)) onAccessLost();
      else setActionError(messageFor(error));
    } finally {
      mutationBusy.current = false;
      setAction(undefined);
    }
  }

  function updateAssignment(updated: Lead, message: string) {
    setLeadResult({ id: updated.id, lead: updated });
    setLeads((current) => current?.map((item) => item.id === updated.id ? updated : item));
    setListAttempt((attempt) => attempt + 1);
    setNotice(message);
  }

  function updateCaseStatus(status: CaseStatus) {
    if (!lead) return;
    const updated = { ...lead, caseStatus: status };
    setLeadResult({ id: updated.id, lead: updated });
    setLeads((current) => current?.map((item) => item.id === updated.id ? updated : item));
  }

  const pagination = nextCursor || moreError ? (
    <div className="queue-pagination">
      {moreError && <Message error>{moreError}</Message>}
      {nextCursor && <button className="button small" disabled={acting || loadingMore} onClick={showMore}>
        {loadingMore ? "Loading…" : "Load more"}
      </button>}
    </div>
  ) : null;

  const record = selectedId ? (
    caseId && lead?.caseId === caseId ?
      <CaseDetail key={caseId} id={caseId} lead={lead} back={() => selectCase()} role={user.role}
        locked={acting} onBusyChange={setChildBusy} onStatusChange={updateCaseStatus}
        onAccessLost={onAccessLost} refreshVersion={refreshVersion}
        adminTools={isAdmin ? <AdminTools lead={lead} caseView firms={firms} onUpdated={updateAssignment}
          onBusyChange={setChildBusy} onAccessLost={onAccessLost} refreshVersion={refreshVersion} /> : undefined} /> :
    lead ? (
      <LeadDetail key={lead.id} lead={lead} plaintiff={isPlaintiff} admin={isAdmin}
        decision={action === "submit" ? undefined : action} decideLead={decideLead}
        actionError={actionError} close={() => select()} openCase={selectCase} locked={acting}
        tools={isAdmin ? <AdminTools lead={lead} firms={firms} onUpdated={updateAssignment} onBusyChange={setChildBusy}
          onAccessLost={onAccessLost} refreshVersion={refreshVersion} /> :
          !lead.caseId ? <LeadDocuments leadId={lead.id} role={user.role}
            canUpload={isPlaintiff && lead.status !== "closed"} onBusyChange={setChildBusy} disabled={acting}
            onAccessLost={onAccessLost} refreshVersion={refreshVersion} /> : undefined} />
    ) : (
      <div className="bookshelf-placeholder">
        <button className="subtle-link" onClick={() => select()}><Icon name="back" size={16} />{home}</button>
        {recordError ? <Message error>{recordError}</Message> : <p role="status">Loading details…</p>}
      </div>
    )
  ) : (
    <div className="bookshelf-placeholder">
      <span className="brand-mark"><Icon name={isPlaintiff ? "folio" : "inbox"} size={23} /></span>
      <h2>{isPlaintiff ? "Choose a request" : "Select a lead"}</h2>
      <p>{isPlaintiff ? "Open a request to see where it stands." : "Choose a lead from the list to see its details."}</p>
    </div>
  );

  return (
    <div className="shell demo-portal">
      <aside className="sidebar" aria-label="Workspace">
        <Brand />
        <div className="workspace-label">Workspace</div>
        <nav className="nav-list" aria-label="Main navigation">
          <button className="nav-item" aria-current={!composing ? "page" : undefined} onClick={() => showIntake(false)} disabled={acting || !!sessionAction}>
            <Icon name={isPlaintiff ? "requests" : "inbox"} />{home}
          </button>
          {isPlaintiff && (
            <button className="nav-item" aria-current={composing ? "page" : undefined} onClick={() => showIntake(true)} disabled={!leads || acting || !!sessionAction}>
              <Icon name="plus" />Submit a request
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="actor-card">
            <span className="avatar" aria-hidden="true">{initials(user.name)}</span>
            <div><strong>{user.name}</strong><small>{roleName(user)}</small></div>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumbs"><span>{roleName(user)}</span><Icon name="chevron" size={13} />
            <strong>{composing ? "Submit a request" : home}</strong>
          </div>
          <div className="topbar-actions">
            <AccountSwitcher user={user} accounts={accounts} disabled={acting || !!sessionAction}
              switching={sessionAction === "switch"} onSwitch={switchAccount} />
            <button className="button small" onClick={signOut} disabled={!!sessionAction || acting}>
              {sessionAction === "sign-out" ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </header>
        <div className="content motion-enter" ref={content} inert={!!sessionAction}>
          {sessionError && <Message error>{sessionError}</Message>}
          {notice && <Message>{notice}</Message>}
          {accessChecking && <Message>Checking your current access…</Message>}
          {accessError && <Message error>{accessError}{" "}
            <button className="subtle-link" onClick={() => recheckAccess.current()}>Try again</button>
          </Message>}
          <div className="portal-page" key={composing ? "intake" : "list"} inert={accessChecking || !!accessError}>
            {composing ? (
              <Intake name={user.name} email={email} submit={submitLead} cancel={() => showIntake(false)}
                submitting={acting} error={actionError} />
            ) : (
              <div className={isPlaintiff ? "plaintiff-home" : undefined}>
                <header className="page-heading split-heading">
                  <div><h1 tabIndex={-1} ref={focusHeading}>{home}</h1><p>{isPlaintiff ? "Track your requests and open your cases." :
                    isAdmin ? "Find leads and cases across firms, and manage their assignments." : "Review new leads assigned to your firm."}</p></div>
                  {isPlaintiff && <button className="button primary" onClick={() => showIntake(true)} disabled={!leads || acting}>
                    <Icon name="plus" size={16} />Submit a request
                  </button>}
                </header>
                {!isPlaintiff && <div className="queue-filters">
                  {isAdmin ? (
                    <>
                      <form className="queue-search" role="search" onSubmit={(event) => {
                        event.preventDefault();
                        setQuery(search.trim());
                      }}>
                        <label className="field">Search leads and cases
                          <input type="search" value={search} placeholder="Plaintiff name or record ID"
                            maxLength={120} disabled={acting} onChange={(event) => {
                              setSearch(event.target.value);
                              if (!event.target.value) setQuery("");
                            }} />
                        </label>
                        <button className="button" type="submit" disabled={acting}>Search</button>
                        {query && <button className="subtle-link" type="button" disabled={acting}
                          onClick={() => { setSearch(""); setQuery(""); }}>Clear</button>}
                      </form>
                      <label className="field">Firm
                        <select value={firmFilter} disabled={acting} onChange={(event) => setFirmFilter(event.target.value)}>
                          <option value="">All firms</option>
                          {firms.map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}
                        </select>
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="field">Region
                        <select value={region} disabled={acting} onChange={(event) => setRegion(event.target.value)}>
                          <option value="">All regions</option>{regions.map((region) => <option key={region}>{region}</option>)}
                        </select>
                      </label>
                      <label className="field">Category
                        <select value={category} disabled={acting} onChange={(event) => setCategory(event.target.value)}>
                          <option value="">All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}
                        </select>
                      </label>
                    </>
                  )}
                </div>}
                {firmsError && <Message error>{firmsError}{" "}
                  <button className="subtle-link" onClick={() => { setFirmsError(""); setFirmsAttempt((attempt) => attempt + 1); }}>Try again</button>
                </Message>}
                {listError && <Message error>{listError}{" "}
                  <button className="subtle-link" onClick={() => { setListError(""); setListAttempt((attempt) => attempt + 1); }}>Try again</button>
                </Message>}
                {(!listError || leads !== undefined) && (
                  isPlaintiff ? (
                    !leads ? <Message>Loading requests…</Message> :
                    <div className={`bookshelf${selectedId ? " has-selection" : ""}`}>
                      <section className="bookshelf-index request-list" aria-labelledby="requests-heading">
                        <div className="card-heading"><h2 id="requests-heading">All requests</h2></div>
                        {leads.length ? leads.map((item) => (
                          <button key={item.id} className="request-card" data-reveal="" aria-pressed={selectedId === item.id}
                            disabled={acting} onClick={() => select(item.id)}>
                            <span className="request-icon"><Icon name="file" /></span>
                            <span className="request-copy">
                              <strong className="request-title">{requestTitle(item)}</strong>
                              <small>{item.category} · {dateFormat.format(new Date(item.createdAt))}</small>
                              <span className="request-meta"><Badge status={item.status}
                                label={item.status === "declined" ? "Awaiting admin review" : undefined} /></span>
                              {item.latestNotice && <small className="plaintiff-notice-preview">{item.latestNotice.message}</small>}
                            </span>
                            <Icon name="chevron" size={16} />
                          </button>
                        )) : <p className="empty">You haven’t submitted a request yet.</p>}
                        {pagination}
                      </section>
                      {(leads.length > 0 || selectedId) && <section className="bookshelf-reading workspace-record"
                        aria-label="Request details" key={selectedId}>{record}</section>}
                    </div>
                  ) : (
                    <StaffList leads={leads ?? []} selectedId={selectedId} select={select} admin={isAdmin} filter={filter}
                      loading={listLoading} pagination={pagination}
                      changeFilter={(value) => {
                        if (filter === value) return;
                        setFilter(value);
                        select();
                      }} record={record} locked={acting} />
                  ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function Intake({ name, email, submit, cancel, submitting, error }: {
  name: string; email: string; submit: (event: FormEvent<HTMLFormElement>) => void;
  cancel: () => void; submitting: boolean; error: string;
}) {
  return (
    <>
      <button className="subtle-link" onClick={cancel} disabled={submitting}><Icon name="back" size={16} />My requests</button>
      <header className="page-heading"><h1 tabIndex={-1} ref={focusHeading}>Submit a request</h1><p>Tell us about your situation so we can match you with a firm.</p></header>
      <div className="plaintiff-grid">
        <form className="panel detail-card form-stack" onSubmit={submit}>
          <div className="card-heading"><h2>Request details</h2></div>
          <div className="form-grid">
            <label className="field">Full name<input name="name" autoComplete="name" defaultValue={name} required maxLength={100} /></label>
            <label className="field">Email address<input type="email" name="email" autoComplete="email" defaultValue={email} required maxLength={180} /></label>
            <label className="field">Region<select name="region" required defaultValue="">
              <option value="" disabled>Select a region</option>{regions.map((region) => <option key={region}>{region}</option>)}
            </select></label>
            <label className="field">Category<select name="category" required defaultValue="">
              <option value="" disabled>Select a category</option>{categories.map((category) => <option key={category}>{category}</option>)}
            </select></label>
          </div>
          <label className="field">What happened?
            <textarea name="description" rows={5} required maxLength={2500}
              placeholder="Briefly describe what happened and what you need help with." />
          </label>
          {error && <Message error>{error}</Message>}
          <div className="detail-actions">
            <button className="button" type="button" onClick={cancel} disabled={submitting}>Cancel</button>
            <button className="button primary" type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit request"} <Icon name="arrow" size={16} />
            </button>
          </div>
        </form>
        <aside className="panel demo-guide">
          <div className="intake-folio"><span className="brand-mark"><Icon name="folio" size={23} /></span>Grand Charter</div>
          <h2>Try a routed request</h2>
          <p className="notice">Choose Ontario and Employment to send your request to Northline Legal.</p>
        </aside>
      </div>
    </>
  );
}

function StaffList({ leads, selectedId, select, admin, filter, changeFilter, record, locked, loading, pagination }: {
  leads: Lead[]; selectedId?: string; select: (id: string, caseId?: string) => void; admin: boolean;
  filter: StaffFilter; changeFilter: (value: StaffFilter) => void; record: ReactNode; locked: boolean;
  loading: boolean; pagination: ReactNode;
}) {
  const tabs = admin ? [["all", "All leads"], ["pending_assignment", "Unmatched"], ["declined", "Declined"], ["cases", "Cases"]] as const :
    [["awaiting_firm_review", "Active"], ["accepted", "Accepted"], ["declined", "Declined"]] as const;
  const noun = filter === "cases" ? "case" : "lead";
  const visible = filter === "cases" ? leads.filter(({ caseId }) => !!caseId) :
    leads.filter(({ status }) => filter === "all" || status === filter);
  return (
    <>
      <nav className="staff-tabs" aria-label="Lead views">
        {tabs.map(([value, title]) => (
          <button key={value} className={`staff-tab${filter === value ? " is-active" : ""}`} aria-pressed={filter === value}
            disabled={locked} onClick={() => changeFilter(value)}>
            {title}
          </button>
        ))}
      </nav>
      <div className="staff-workspace">
        <section className="staff-list" aria-label={filter === "cases" ? "Cases" : "Leads"}>
          <div className="staff-list-label">{loading ? `Loading ${noun}s…` :
            `${visible.length} ${noun}${visible.length === 1 ? "" : "s"} shown`}</div>
          {!loading && (visible.length ? <div className="staff-rows motion-enter motion-detail" key={filter}>
            {visible.map((item) => (
              <button key={item.id} data-reveal="" className={`staff-row${selectedId === item.id ? " is-selected" : ""}`}
                aria-pressed={selectedId === item.id} disabled={locked}
                onClick={() => select(item.id, filter === "cases" ? item.caseId ?? undefined : undefined)}>
                <span className="staff-row-avatar" aria-hidden="true">{initials(item.name)}</span>
                <span className="staff-row-body">
                  <strong className="staff-row-heading">{item.name}</strong>
                  <span className="staff-row-meta">{item.category} · {item.region}</span>
                  <span className="staff-row-status"><Badge status={filter === "cases" ? item.caseStatus ?? item.status : item.status} /></span>
                </span>
                <span className="staff-row-side"><time dateTime={item.createdAt}>{dateFormat.format(new Date(item.createdAt))}</time>
                  <Icon name="chevron" size={15} /></span>
              </button>
            ))}
          </div> : <div className="empty-state staff-empty"><Icon name="inbox" size={23} /><h3>No {noun}s match this view</h3></div>)}
          {!loading && pagination}
        </section>
        <section className="staff-detail workspace-record" aria-label="Lead details" key={selectedId}>{record}</section>
      </div>
    </>
  );
}

function LeadDetail({ lead, plaintiff, admin, decision, decideLead, actionError, close, openCase, tools, locked }: {
  lead: Lead; plaintiff: boolean; admin: boolean; decision?: LeadDecision;
  decideLead: (decision: LeadDecision) => void; actionError: string;
  close: () => void; openCase: (id: string) => void;
  tools?: ReactNode; locked: boolean;
}) {
  const declineDialog = useRef<HTMLDialogElement>(null);
  const title = plaintiff ? requestTitle(lead) : lead.name;
  const statusMessage = lead.status === "accepted" ? `${lead.firmName ?? "Your firm"} accepted your request and opened a case.` :
    lead.status === "awaiting_firm_review" ? `${lead.firmName ?? "The assigned firm"} is reviewing your request.` :
    lead.status === "pending_assignment" ? "Your request is waiting to be assigned to a firm." :
    lead.status === "declined" ? "Your request is awaiting admin review." : "Your request was closed.";
  return (
    <article className={`motion-enter motion-detail${plaintiff ? "" : " staff-record"}`}>
      <header className={plaintiff ? "bookshelf-detail-header" : "detail-header"}>
        {plaintiff && <button className="subtle-link bookshelf-close" disabled={locked} onClick={close}><Icon name="back" size={16} />All requests</button>}
        <div className={plaintiff ? undefined : "detail-title"}>
          <h2 className="record-heading" tabIndex={-1} ref={focusHeading}>{title}</h2>
          {!plaintiff && <Badge status={lead.status} />}
        </div>
        <p className={plaintiff ? undefined : "detail-contact"}>{plaintiff ?
          `${lead.category} · ${lead.region} · Submitted ${dateFormat.format(new Date(lead.createdAt))}` : lead.email}</p>
      </header>
      <div className={plaintiff ? "bookshelf-detail-content" : "detail-body"}>
        {plaintiff && <section className="request-status-message">
          <div><h3>Where things stand</h3><p>{statusMessage}</p></div>
        </section>}
        {plaintiff && <PlaintiffNotices notices={lead.notices} />}
        <section className={plaintiff ? "bookshelf-section" : "detail-section"}>
          <h3>{plaintiff ? "Your request" : "Original request"}</h3>
          <p className="detail-copy record-description">{lead.description}</p>
        </section>
        {!plaintiff && <dl className="detail-meta">
          <div><dt>Category</dt><dd>{lead.category}</dd></div>
          <div><dt>Region</dt><dd>{lead.region}</dd></div>
          <div><dt>Submitted</dt><dd>{dateFormat.format(new Date(lead.createdAt))}</dd></div>
          <div><dt>Assigned firm</dt><dd>{lead.firmName ?? "Unassigned"}</dd></div>
        </dl>}
        {actionError && <div className="detail-section"><Message error>{actionError}</Message></div>}
        {tools}
      </div>
      {lead.caseId ? (
        <footer className="review-footer motion-enter motion-feedback" data-review-state="accepted" key="accepted">
          <div className="review-footer-copy"><strong>Linked case</strong><small>Lead accepted</small></div>
          <button className="button primary" disabled={locked} onClick={() => lead.caseId && openCase(lead.caseId)}>Open case <Icon name="arrow" size={16} /></button>
        </footer>
      ) : !plaintiff && !admin && lead.status === "awaiting_firm_review" ? (
        <footer className="review-footer" data-review-state="review" key="review">
          <div className="review-footer-copy"><strong>Lead decision</strong><small>Accept to open a case or decline for admin review.</small></div>
          <div className="detail-actions">
            <button className="button danger" onClick={() => declineDialog.current?.showModal()} disabled={locked}>
              {decision === "decline" ? "Declining…" : "Decline lead"}
            </button>
            <button className="button primary" onClick={() => decideLead("accept")} disabled={locked}>
              <Icon name="check" size={16} />{decision === "accept" ? "Accepting…" : "Accept lead"}
            </button>
          </div>
          <dialog ref={declineDialog} aria-labelledby="decline-title" aria-describedby="decline-description">
            <div className="dialog-head"><h2 id="decline-title">Decline this lead?</h2></div>
            <div className="dialog-body"><p id="decline-description">
              This sends the lead to the admin queue. Your firm can still view it while it remains assigned to you.
            </p></div>
            <form className="dialog-footer" method="dialog">
              <button className="button" type="submit">Cancel</button>
              <button className="button primary danger" type="button" onClick={() => {
                declineDialog.current?.close();
                decideLead("decline");
              }}>Decline lead</button>
            </form>
          </dialog>
        </footer>
      ) : !plaintiff && !admin && lead.status === "declined" ? (
        <footer className="review-footer motion-enter motion-feedback" data-review-state="declined" key="declined">
          <div className="review-footer-copy"><strong>Awaiting admin review</strong><small>Your firm can still view this lead while it’s assigned.</small></div>
        </footer>
      ) : null}
    </article>
  );
}

function PlaintiffNotices({ notices }: { notices?: PlaintiffNotice[] }) {
  if (!notices?.length) return null;
  return <section className="detail-section plaintiff-notices">
    <h3>Assignment updates</h3>
    {notices.map((notice) => <div className="notice" key={notice.id}>
      <p>{notice.message}</p>
      <small><time dateTime={notice.createdAt}>{dateFormat.format(new Date(notice.createdAt))}</time></small>
    </div>)}
  </section>;
}

function CaseDetail({ id, lead, back, role, locked, onBusyChange, onStatusChange, adminTools, onAccessLost, refreshVersion }: {
  id: string; lead: Lead; back: () => void; role: Role; locked: boolean;
  onBusyChange: (busy: boolean) => void; onStatusChange: (status: CaseStatus) => void; adminTools?: ReactNode;
  onAccessLost: () => void; refreshVersion: number;
}) {
  const plaintiff = role === "plaintiff";
  const [item, setItem] = useState<Case>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    request<{ case: Case }>(`/api/cases/${id}`, { signal: controller.signal })
      .then(({ case: item }) => {
        if (!controller.signal.aborted) { setItem(item); setError(""); }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isAccessError(error)) onAccessLost();
        else setError(messageFor(error));
      });
    return () => controller.abort();
  }, [id, refreshVersion, onAccessLost, attempt]);

  return (
    <article className="motion-enter motion-detail">
      <header className={plaintiff ? "bookshelf-detail-header" : "detail-header"}>
        <button className="subtle-link" disabled={locked} onClick={back}><Icon name="back" size={16} />{plaintiff ? "Back to request" : "Back to lead"}</button>
        <div className={plaintiff ? undefined : "detail-title"}>
          <h2 className="record-heading" tabIndex={-1} ref={focusHeading}>{plaintiff ? "Your case" : "Case details"}</h2>
          {item && <Badge status={item.status} />}
        </div>
      </header>
      <div className={plaintiff ? "bookshelf-detail-content" : "detail-body"}>
        {error && <Message error>{error}{" "}
          <button className="subtle-link" disabled={locked} onClick={() => setAttempt((current) => current + 1)}>Try again</button>
        </Message>}
        {item ? (
          <>
          <section className="detail-section motion-enter motion-detail">
            <h3>Case overview</h3>
            <dl className="detail-meta">
              {!plaintiff && <div><dt>Plaintiff</dt><dd>{item.name}</dd></div>}
              <div><dt>Assigned firm</dt><dd>{lead.firmName ?? item.firmName ?? "Unassigned"}</dd></div>
              <div><dt>Category</dt><dd>{item.category}</dd></div>
              <div><dt>Region</dt><dd>{item.region}</dd></div>
              <div><dt>Opened</dt><dd>{dateFormat.format(new Date(item.createdAt))}</dd></div>
              <div className="case-reference"><dt>Case reference</dt><dd>{item.id}</dd></div>
            </dl>
          </section>
          {plaintiff && <PlaintiffNotices notices={lead.notices} />}
          <CaseTools caseId={item.id} leadId={item.leadId} status={item.status} role={role}
            disabled={locked || !!error} onAccessLost={onAccessLost} refreshVersion={refreshVersion}
            onBusyChange={onBusyChange} onStatusChange={(status) => {
              setItem({ ...item, status });
              onStatusChange(status);
            }} />
          {adminTools}
          </>
        ) : !error && <p role="status" className="muted">Loading case…</p>}
      </div>
    </article>
  );
}
