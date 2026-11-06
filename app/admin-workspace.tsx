"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { categories, regions } from "@/lib/intake-options";
import { AdminRecordDetail } from "./admin-records";
import type { Firm } from "./admin-tools";
import { adminListUrl, adminStatuses, adminUrl, adminViews, emptyAdminLocation, readAdminLocation, type AdminLocation, type AdminView } from "./admin-navigation";
import { isAccessError, messageFor, request } from "./api-client";
import { FirmRecordPanel } from "./firm-record-panel";
import { FirmCaseBoard, hasFirmBoardData, prepareFirmBoard, type FirmBoardCache, type FirmBoardGroup, type FirmBoardSummary } from "./firm-case-board";
import { FirmStatusBadge, firmIssueExcerpt } from "./firm-records";
import { AccountSwitcher, Brand } from "./workspace-chrome";
import { animateWorkspace } from "./workspace-motion";
import type { Account, Lead, User } from "./workspace";
import "./admin-workspace.css";
import "./firm-workspace.css";

type Page = { path: string; items: Lead[]; nextCursor: string | null; totalCount: number };
type RecordResult = { id: string; lead: Lead };
type Props = {
  user: User;
  accounts: Account[];
  switchAccount: (email: string) => void;
  signOut: () => void;
  sessionAction: "switch" | "sign-out" | null;
  sessionError: string;
  verifySession: (signal?: AbortSignal) => Promise<boolean>;
};
const dateFormat = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" });

async function loadPage(path: string, signal: AbortSignal): Promise<Page> {
  if (path.startsWith("/api/cases")) {
    const response = await request<{ cases: { lead: Lead }[]; nextCursor: string | null; totalCount: number }>(path, { signal });
    return { path, items: response.cases.map(({ lead }) => lead), nextCursor: response.nextCursor, totalCount: response.totalCount };
  }
  const response = await request<{ leads: Lead[]; nextCursor: string | null; totalCount: number }>(path, { signal });
  return { path, items: response.leads, nextCursor: response.nextCursor, totalCount: response.totalCount };
}

async function loadWindow(path: string, previous: Page | undefined, signal: AbortSignal) {
  let loaded = await loadPage(path, signal);
  if (!previous || previous.path !== path || !previous.items.length) return loaded;
  const boundary = previous.items.at(-1)!;
  const oldest = new URL(path, "http://localhost").searchParams.get("sort") === "oldest";
  const reachedBoundary = () => {
    const last = loaded.items.at(-1);
    if (!last) return true;
    const comparison = new Date(last.createdAt).getTime() - new Date(boundary.createdAt).getTime() || (last.id < boundary.id ? -1 : last.id > boundary.id ? 1 : 0);
    return oldest ? comparison >= 0 : comparison <= 0;
  };
  const pages = Math.ceil(previous.items.length / 50);
  let fetched = 1;
  while (loaded.nextCursor && (fetched < pages || (!reachedBoundary() && fetched < pages + 2))) {
    const next = await loadPage(`${path}&before=${encodeURIComponent(loaded.nextCursor)}`, signal);
    const known = new Set(loaded.items.map(({ id }) => id));
    loaded = { ...loaded, items: [...loaded.items, ...next.items.filter(({ id }) => !known.has(id))], nextCursor: next.nextCursor };
    fetched += 1;
  }
  return loaded;
}

function withoutRecord(location: AdminLocation) {
  return { ...location, leadId: undefined, caseId: undefined };
}

export function AdminWorkspace({ user, accounts, switchAccount, signOut, sessionAction, sessionError, verifySession }: Props) {
  const [location, setLocation] = useState(readAdminLocation);
  const locationRef = useRef(location);
  locationRef.current = location;
  const [pending, setPending] = useState<AdminLocation>();
  const [search, setSearch] = useState(location.query);
  const searchInput = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState<Page>();
  const pageRef = useRef(page);
  pageRef.current = page;
  const cache = useRef(new Map<string, Page>());
  const boardCache = useRef<FirmBoardCache>(new Map());
  const [boardRecords, setBoardRecords] = useState<{ path: string; groups: FirmBoardGroup[] }>();
  const [boardSummary, setBoardSummary] = useState<{ path: string; summary: FirmBoardSummary }>();
  const listStatus = useRef(location.status);
  const memories = useRef<Record<AdminView, AdminLocation>>({ attention: emptyAdminLocation("attention"), leads: emptyAdminLocation("leads"), cases: emptyAdminLocation("cases") });
  const collectionRequest = useRef<AbortController | undefined>(undefined);
  const navigationRequest = useRef<AbortController | undefined>(undefined);
  const moreRequest = useRef<AbortController | undefined>(undefined);
  const accessRequest = useRef<AbortController | undefined>(undefined);
  const revision = useRef(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [retryLocation, setRetryLocation] = useState<AdminLocation>();
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState("");
  const [firms, setFirms] = useState<Firm[]>([]);
  const [firmError, setFirmError] = useState("");
  const [firmAttempt, setFirmAttempt] = useState(0);
  const [counts, setCounts] = useState<{ unassigned: number; declined: number }>();
  const [countError, setCountError] = useState("");
  const [countAttempt, setCountAttempt] = useState(0);
  const [record, setRecord] = useState<RecordResult>();
  const recordRef = useRef(record);
  recordRef.current = record;
  const prefetchedRecord = useRef<string | undefined>(undefined);
  const [recordError, setRecordError] = useState("");
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordAttempt, setRecordAttempt] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [childBusy, setChildBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ id: string; message: string }>();
  const [notice, setNotice] = useState("");
  const [checking, setChecking] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const successHeading = useRef<HTMLParagraphElement>(null);
  const drawer = !!location.leadId;
  const path = adminListUrl(location);
  const board = location.view === "cases" && location.layout === "board";
  const currentPage = page?.path === path ? page : undefined;
  const lead = record && record.id === location.leadId ? record.lead : undefined;
  const controls = pending ?? location;
  const filtered = !!(location.query || location.firmId || location.region || location.category || location.status !== "all");
  const navigationLocked = !!sessionAction || childBusy;
  const locked = navigationLocked || checking || recordLoading || !!recordError || !!pending;
  const busyRef = useRef(navigationLocked);
  busyRef.current = navigationLocked;
  const receiveBoardRecords = useCallback((groups: FirmBoardGroup[]) => setBoardRecords({ path, groups }), [path]);
  const receiveBoardSummary = useCallback((summary: FirmBoardSummary) => setBoardSummary({ path, summary }), [path]);

  function writeLocation(next: AdminLocation, history: "push" | "replace" | "none") {
    if (history === "none") return;
    const url = adminUrl(next);
    if (url.href !== window.location.href) window.history[history === "push" ? "pushState" : "replaceState"](window.history.state, "", url);
  }

  function commit(next: AdminLocation, history: "push" | "replace" | "none", nextPage?: Page, nextRecord?: RecordResult) {
    const previous = locationRef.current;
    memories.current[previous.view] = withoutRecord(previous);
    memories.current[next.view] = withoutRecord(next);
    locationRef.current = next;
    setLocation(next);
    setSearch(next.query);
    if (nextPage) { cache.current.set(nextPage.path, nextPage); pageRef.current = nextPage; setPage(nextPage); }
    if (nextRecord) { prefetchedRecord.current = nextRecord.id; recordRef.current = nextRecord; setRecord(nextRecord); }
    if (previous.leadId !== next.leadId || previous.caseId !== next.caseId) {
      setOutcome(undefined);
      setRecordError("");
    }
    setPending(undefined);
    setListError("");
    setRetryLocation(undefined);
    setMoreError("");
    if (!collectionRequest.current || collectionRequest.current.signal.aborted) setLoading(false);
    writeLocation(next, history);
  }

  const refreshCollection = useCallback(async () => {
    const target = locationRef.current;
    const targetPath = adminListUrl(target);
    collectionRequest.current?.abort();
    moreRequest.current?.abort();
    setMoreLoading(false);
    const controller = new AbortController();
    collectionRequest.current = controller;
    setLoading(true);
    setListError("");
    try {
      const next = await loadWindow(targetPath, pageRef.current, controller.signal);
      if (controller.signal.aborted || targetPath !== adminListUrl(locationRef.current)) return;
      cache.current.set(targetPath, next);
      pageRef.current = next;
      setPage(next);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (isAccessError(error)) { cache.current.clear(); pageRef.current = undefined; setPage(undefined); void verifySession(); }
      setListError(messageFor(error));
    } finally {
      if (collectionRequest.current === controller) {
        collectionRequest.current = undefined;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
  }, [verifySession]);

  async function navigate(next: AdminLocation, history: "push" | "replace" | "none" = "push") {
    if (busyRef.current) return;
    navigationRequest.current?.abort();
    const nextPath = adminListUrl(next);
    const previous = locationRef.current;
    const samePath = nextPath === adminListUrl(previous);
    if (!samePath) collectionRequest.current?.abort();
    moreRequest.current?.abort();
    const started = ++revision.current;
    setMoreLoading(false);
    const controller = new AbortController();
    navigationRequest.current = controller;
    const settled = samePath ? pageRef.current : cache.current.get(nextPath);
    const needsRecord = !!next.leadId && recordRef.current?.id !== next.leadId;
    const nextBoard = next.view === "cases" && next.layout === "board";
    const cachedBoard = nextBoard && hasFirmBoardData(next, boardCache.current);
    setPending(next);
    setListError("");
    try {
      const [nextPage, nextRecord] = await Promise.all([
        settled ? Promise.resolve(settled) : loadPage(nextPath, controller.signal),
        needsRecord ? request<{ lead: Lead }>(`/api/leads/${encodeURIComponent(next.leadId!)}`, { signal: controller.signal }).then(({ lead }) => ({ id: lead.id, lead })) : Promise.resolve(undefined),
        nextBoard && !cachedBoard ? prepareFirmBoard(next, boardCache.current, refreshVersion, controller.signal) : Promise.resolve(),
      ]);
      if (controller.signal.aborted || started !== revision.current) return;
      const scope = previous.leadId !== next.leadId ? previous.leadId && next.leadId ? "record" : "drawer" : "collection";
      await animateWorkspace(scope, () => {
        if (!controller.signal.aborted && started === revision.current) commit(next, history, samePath && pageRef.current?.path === nextPath ? undefined : nextPage, nextRecord);
      });
      if (!samePath && settled && !controller.signal.aborted && started === revision.current) void refreshCollection();
      if (cachedBoard && (!samePath || previous.layout !== next.layout) && !controller.signal.aborted && started === revision.current) setRefreshVersion((value) => value + 1);
    } catch (error) {
      if (controller.signal.aborted || started !== revision.current) return;
      setPending(undefined);
      setLoading(false);
      if (isAccessError(error)) {
        cache.current.clear();
        setNotice(next.leadId ? "This record is no longer available." : messageFor(error));
        void verifySession().then((sameSession) => { if (sameSession) void refreshCollection(); }).catch(() => {});
        setRetryLocation(undefined);
      } else {
        setListError(messageFor(error));
        setRetryLocation(next);
      }
      if (history === "none") writeLocation(locationRef.current, "replace");
    } finally {
      if (navigationRequest.current === controller) navigationRequest.current = undefined;
    }
  }

  useEffect(() => {
    void refreshCollection();
    return () => { collectionRequest.current?.abort(); navigationRequest.current?.abort(); moreRequest.current?.abort(); accessRequest.current?.abort(); };
  }, [refreshCollection]);

  useEffect(() => {
    const onPop = () => {
      if (busyRef.current) { writeLocation(locationRef.current, "push"); return; }
      void navigate(readAdminLocation(), "none");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  });

  useEffect(() => {
    const controller = new AbortController();
    setFirmError("");
    request<{ firms: Firm[] }>("/api/firms", { signal: controller.signal })
      .then(({ firms }) => { if (!controller.signal.aborted) setFirms(firms); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setFirmError(messageFor(error)); });
    return () => controller.abort();
  }, [firmAttempt]);

  useEffect(() => {
    const controller = new AbortController();
    setCountError("");
    const base = "/api/leads?attention=true&count=true&status=";
    Promise.all([
      request<{ totalCount: number }>(`${base}pending_assignment`, { signal: controller.signal }),
      request<{ totalCount: number }>(`${base}declined`, { signal: controller.signal }),
    ]).then(([unassigned, declined]) => { if (!controller.signal.aborted) setCounts({ unassigned: unassigned.totalCount, declined: declined.totalCount }); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setCountError(messageFor(error)); });
    return () => controller.abort();
  }, [countAttempt]);

  useEffect(() => {
    if (!location.leadId) { setRecordError(""); setRecordLoading(false); return; }
    const id = location.leadId;
    if (prefetchedRecord.current === id) { prefetchedRecord.current = undefined; setRecordLoading(false); return; }
    const controller = new AbortController();
    setRecordError("");
    setRecordLoading(true);
    request<{ lead: Lead }>(`/api/leads/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(({ lead }) => { if (!controller.signal.aborted) setRecord({ id, lead }); })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isAccessError(error)) {
          cache.current.clear();
          setRecord(undefined);
          setNotice("This record is no longer available.");
          commit(withoutRecord(locationRef.current), "replace");
          void refreshCollection();
          void verifySession();
        } else setRecordError(messageFor(error));
      }).finally(() => { if (!controller.signal.aborted) setRecordLoading(false); });
    return () => controller.abort();
  }, [location.leadId, recordAttempt, refreshCollection, verifySession]);

  useEffect(() => {
    let controller: AbortController | undefined;
    const recheck = async () => {
      if (document.visibilityState === "hidden" || busyRef.current) return;
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      setChecking(true);
      try {
        if (await verifySession(signal) && !signal.aborted) {
          setRecordAttempt((value) => value + 1);
          setRefreshVersion((value) => value + 1);
          setCountAttempt((value) => value + 1);
          if (!navigationRequest.current || navigationRequest.current.signal.aborted) void refreshCollection();
        }
      } catch (error) { if (!signal.aborted) setRecordError(messageFor(error)); }
      finally { if (!signal.aborted) setChecking(false); }
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => { controller?.abort(); window.removeEventListener("focus", recheck); document.removeEventListener("visibilitychange", recheck); };
  }, [refreshCollection, verifySession]);

  useEffect(() => { if (outcome) successHeading.current?.focus({ preventScroll: true }); }, [outcome]);

  function changeView(view: AdminView) {
    void navigate(view === location.view ? withoutRecord(location) : memories.current[view]);
  }

  function changeLayout(layout: AdminLocation["layout"]) {
    if (layout === location.layout) { void navigate(withoutRecord(location)); return; }
    if (layout === "board") listStatus.current = location.status;
    void navigate({ ...withoutRecord(location), layout, status: layout === "board" ? "all" : listStatus.current });
  }

  function filter(changes: Partial<AdminLocation>) {
    const next = withoutRecord({ ...controls, ...changes });
    void navigate(next);
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    filter({ query: search.trim().slice(0, 120) });
  }

  function select(item?: Lead) {
    void navigate({ ...locationRef.current, leadId: item?.id, caseId: locationRef.current.view === "cases" ? item?.caseId ?? undefined : undefined });
  }

  async function loadMore() {
    const previous = pageRef.current;
    if (!previous?.nextCursor || moreLoading || pending || navigationLocked) return;
    moreRequest.current?.abort();
    const controller = new AbortController();
    moreRequest.current = controller;
    const started = revision.current;
    setMoreLoading(true);
    setMoreError("");
    try {
      const next = await loadPage(`${previous.path}&before=${encodeURIComponent(previous.nextCursor)}`, controller.signal);
      if (controller.signal.aborted || started !== revision.current) return;
      const known = new Set(previous.items.map(({ id }) => id));
      const merged = { ...previous, items: [...previous.items, ...next.items.filter(({ id }) => !known.has(id))], nextCursor: next.nextCursor, totalCount: next.totalCount };
      cache.current.set(merged.path, merged);
      pageRef.current = merged;
      setPage(merged);
    } catch (error) { if (!controller.signal.aborted) setMoreError(messageFor(error)); }
    finally { if (!controller.signal.aborted) setMoreLoading(false); }
  }

  function updated(next: Lead, message: string) {
    cache.current.clear();
    boardCache.current.clear();
    if (locationRef.current.leadId === next.id) {
      setRecord({ id: next.id, lead: next });
      setOutcome({ id: next.id, message });
    } else setNotice(message);
    setRefreshVersion((value) => value + 1);
    setCountAttempt((value) => value + 1);
    void refreshCollection();
  }

  async function recheckRecordAccess() {
    accessRequest.current?.abort();
    const controller = new AbortController();
    accessRequest.current = controller;
    setChecking(true);
    try {
      if (await verifySession(controller.signal) && !controller.signal.aborted) {
        setRecordAttempt((value) => value + 1);
        setRefreshVersion((value) => value + 1);
      }
    } catch (error) { if (!controller.signal.aborted) setRecordError(messageFor(error)); }
    finally { if (!controller.signal.aborted) setChecking(false); }
  }

  const items = board ? boardRecords?.path === path ? boardRecords.groups.flatMap((group) => group.items) : [] : currentPage?.items ?? [];
  const currentBoardSummary = boardSummary?.path === path ? boardSummary.summary : undefined;
  const selectedIndex = items.findIndex(({ id }) => id === location.leadId);
  const nextReview = location.view === "attention" ? items.find((item) => item.id !== location.leadId) : undefined;
  const totalAttention = counts ? counts.unassigned + counts.declined : undefined;
  const title = adminViews.find(([view]) => view === location.view)![1];
  const description = location.view === "attention" ? "Place unassigned leads with a firm and resolve declined leads."
    : location.view === "leads" ? "Find any intake and follow its assignment, decision, and history."
      : "Review accepted requests, firm assignments, and case progress.";
  const chips = [
    location.query ? { key: "query" as const, label: `Search: ${location.query}` } : undefined,
    location.firmId ? { key: "firmId" as const, label: firms.find(({ id }) => id === location.firmId)?.name ?? "Selected firm" } : undefined,
    location.region ? { key: "region" as const, label: location.region } : undefined,
    location.category ? { key: "category" as const, label: location.category } : undefined,
  ].filter((chip) => chip !== undefined);

  return <div className="shell admin-shell">
    <header className="topbar admin-topbar" inert={drawer}>
      <Brand /><span className="admin-workspace-label">Platform admin</span>
      <div className="topbar-actions"><AccountSwitcher user={user} accounts={accounts} disabled={navigationLocked}
        switching={sessionAction === "switch"} onSwitch={switchAccount} />
        <button className="button small" type="button" disabled={navigationLocked} onClick={signOut}>{sessionAction === "sign-out" ? "Signing out…" : "Sign out"}</button>
      </div>
    </header>
    <main className="admin-main">
      <div inert={drawer}>
        {sessionError && <div className="workspace-message workspace-error" role="alert">{sessionError}</div>}
        {notice && <div className="workspace-message" role="status">{notice}<button className="subtle-link" type="button" onClick={() => setNotice("")}>Dismiss</button></div>}
        <nav className="admin-navigation" aria-label="Admin workspace">
          {adminViews.map(([view, label]) => <button key={view} type="button" aria-current={location.view === view ? "page" : undefined}
            aria-busy={pending?.view === view || undefined} disabled={navigationLocked} onClick={() => changeView(view)}>
            {label}{view === "attention" && <span className="admin-nav-count">{totalAttention ?? "…"}</span>}
          </button>)}
        </nav>
        <header className="admin-page-heading firm-page-heading">
          <div><h1 ref={heading} tabIndex={-1}>{title}</h1><p>{description}</p></div>
          {location.view === "cases" && <div className="firm-layout-controls" role="group" aria-label="Case layout">
            {(["list", "board"] as const).map((layout) => <button type="button" key={layout} aria-pressed={location.layout === layout}
              data-pending={pending?.layout === layout || undefined} aria-busy={pending?.layout === layout || undefined}
              disabled={navigationLocked} onClick={() => changeLayout(layout)}>{layout === "list" ? "List" : "Board"}</button>)}
          </div>}
          {location.view === "attention" && <div className="admin-attention-breakdown" aria-label="Unfiltered attention counts">
            <span><strong>{counts?.unassigned ?? "…"}</strong> need a firm</span><span><strong>{counts?.declined ?? "…"}</strong> declined by firm</span>
          </div>}
        </header>
        {countError && <div className="admin-local-error" role="alert">Attention counts couldn’t be updated. <button type="button" className="subtle-link" onClick={() => setCountAttempt((value) => value + 1)}>Try again</button></div>}
        {firmError && <div className="admin-local-error" role="alert">{firmError} <button type="button" className="subtle-link" onClick={() => setFirmAttempt((value) => value + 1)}>Reload firms</button></div>}
        <section className="admin-controls" aria-label={`${title} filters`}>
          <form className="admin-search" role="search" onSubmit={submitSearch}>
            <label className="field"><span>Search {location.view === "cases" ? "cases" : location.view === "attention" ? "this queue" : "all leads"}</span>
              <span className="admin-search-input"><input ref={searchInput} type="search" value={search} maxLength={120}
                placeholder={location.view === "cases" ? "Plaintiff name or full case ID" : "Plaintiff name or full lead ID"} disabled={navigationLocked}
                onChange={(event) => { const value = event.target.value; setSearch(value); if (!value && controls.query) filter({ query: "" }); }} />
                {search && <button type="button" className="admin-search-clear" aria-label="Clear search" disabled={navigationLocked}
                  onClick={() => { setSearch(""); filter({ query: "" }); searchInput.current?.focus(); }}>×</button>}
              </span>
            </label><button className="button" type="submit" disabled={navigationLocked}>Search</button>
          </form>
          <label className="field">Firm<select value={controls.firmId} disabled={navigationLocked || !!firmError} onChange={(event) => filter({ firmId: event.target.value })}><option value="">All firms</option>{firms.map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}</select></label>
          <label className="field">Province<select value={controls.region} disabled={navigationLocked} onChange={(event) => filter({ region: event.target.value })}><option value="">All provinces</option>{regions.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="field">Category<select value={controls.category} disabled={navigationLocked} onChange={(event) => filter({ category: event.target.value })}><option value="">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></label>
        </section>
        <div className="admin-refinements">
          <div className="admin-filter-chips" aria-label="Active filters">{chips.map(({ key, label }) => <button type="button" key={key} disabled={navigationLocked} aria-label={`Remove ${label} filter`} onClick={() => filter({ [key]: "" })}>{label}<span aria-hidden="true">×</span></button>)}
            {filtered && <button className="subtle-link" type="button" disabled={navigationLocked} onClick={() => filter({ status: "all", query: "", firmId: "", region: "", category: "" })}>Clear filters</button>}
          </div>
          <div className="admin-select-controls">{!board && <label>Status<select aria-label="Status" value={controls.status} disabled={navigationLocked} onChange={(event) => filter({ status: event.target.value })}>{adminStatuses[controls.view].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
            <label>Sort<select aria-label="Sort by submission date" value={controls.sort} disabled={navigationLocked} onChange={(event) => filter({ sort: event.target.value as AdminLocation["sort"] })}><option value="oldest">Oldest submitted</option><option value="newest">Newest submitted</option></select></label>
          </div>
        </div>
        <section className="admin-collection" aria-label={`${title} records`} aria-busy={loading || !!pending}>
          <div className="admin-collection-summary"><p>{board ? currentBoardSummary?.totalCount === undefined ? "Cases by progress" : `${items.length} of ${currentBoardSummary.totalCount} cases shown` : currentPage ? `${items.length} of ${currentPage.totalCount} ${location.view === "cases" ? "cases" : "leads"} shown` : listError ? "Records unavailable" : "Loading records…"}</p>
            <span role="status">{pending ? pending.leadId ? "Opening record…" : "Updating results…" : loading && currentPage ? "Updating…" : ""}</span>
          </div>
          {listError && <div className="admin-local-error" role="alert"><p>{listError}</p><button className="subtle-link" type="button" onClick={() => retryLocation ? void navigate(retryLocation) : void refreshCollection()}>Try again</button></div>}
          {board ? <div className="admin-board-canvas">
            {filtered && currentBoardSummary?.empty && <div className="admin-board-empty"><p>No cases match these filters.</p><button className="subtle-link" type="button" disabled={navigationLocked} onClick={() => filter({ query: "", firmId: "", region: "", category: "" })}>Clear filters</button></div>}
            <FirmCaseBoard location={location} showFirm selectedId={location.leadId} locked={navigationLocked || !!pending} refreshVersion={refreshVersion}
              cache={boardCache.current} onSelect={select} onRecordsChange={receiveBoardRecords} onSummaryChange={receiveBoardSummary}
              onAccessLost={() => { boardCache.current.clear(); void recheckRecordAccess(); }} />
          </div> : !currentPage ? <div className="admin-loading">{listError ? "Records are temporarily unavailable." : "Loading the workspace…"}</div>
            : !items.length ? <div className="admin-empty"><h2>{filtered ? "No matching records" : location.view === "attention" ? "No leads need attention" : location.view === "cases" ? "No cases yet" : "No leads yet"}</h2>
              <p>{filtered ? "Try fewer filters or a different plaintiff name or record ID." : location.view === "attention" ? "Every lead has a firm or a final decision. You can browse leads or review existing cases." : location.view === "cases" ? "Accepted leads become cases. You can review leads and their firm assignments." : "New requests will appear here after a plaintiff submits an intake."}</p>
              <div>{filtered && <button className="button" type="button" disabled={navigationLocked} onClick={() => filter({ status: "all", query: "", firmId: "", region: "", category: "" })}>Clear filters</button>}
                {location.view === "attention" && <button className="button" type="button" disabled={navigationLocked} onClick={() => void navigate({ ...location, view: "leads", status: "all", leadId: undefined, caseId: undefined })}>{filtered ? "Search all leads" : "Browse all leads"}</button>}
                {!filtered && <button className="subtle-link" type="button" disabled={navigationLocked} onClick={() => changeView(location.view === "cases" ? "leads" : "cases")}>{location.view === "cases" ? "View all leads" : "View cases"} <span aria-hidden="true">→</span></button>}
              </div>
            </div> : <>
              <table className="admin-table"><thead><tr><th scope="col">Plaintiff and request</th><th scope="col">{location.view === "attention" ? "Needs attention" : "Status"}</th><th scope="col">Assigned firm</th><th scope="col">Category / Province</th><th scope="col">Submitted</th></tr></thead>
                <tbody>{items.map((item) => <tr key={item.id} data-selected={location.leadId === item.id || undefined}>
                  <td><button className="admin-record-link" type="button" data-record-id={item.id} aria-haspopup="dialog" aria-expanded={location.leadId === item.id} aria-label={`Open ${location.view === "cases" ? "case" : "lead"} for ${item.name}`} disabled={navigationLocked || !!pending} onClick={() => select(item)}><strong>{item.name}</strong><span>{firmIssueExcerpt(item.title || item.description, 105) || item.category}</span><small className="admin-mobile-classification">{item.category} · {item.region}</small><small className="admin-mobile-assignment">{item.firmName ?? "Unassigned"} · {dateFormat.format(new Date(item.createdAt))}</small></button></td>
                  <td>{location.view === "attention" ? <span className={`admin-attention-reason${item.status === "declined" ? " is-declined" : ""}`}>{item.status === "declined" ? "Declined by firm" : "Needs a firm"}</span> : <FirmStatusBadge status={location.view === "cases" ? item.caseStatus ?? "open" : item.status} />}</td>
                  <td className="admin-firm-cell">{item.firmName ?? <span className="admin-unassigned">Unassigned</span>}</td>
                  <td className="admin-classification"><span>{item.category}</span><small>{item.region}</small></td>
                  <td className="admin-date-cell"><time dateTime={item.createdAt}>{dateFormat.format(new Date(item.createdAt))}</time></td>
                </tr>)}</tbody>
              </table>
              {currentPage.nextCursor && <div className="admin-pagination"><button className="button small" type="button" disabled={navigationLocked || !!pending || loading || moreLoading} onClick={() => void loadMore()}>{moreLoading ? "Loading more…" : "Load more"}</button></div>}
              {moreError && <div className="admin-local-error" role="alert">{moreError}<button className="subtle-link" type="button" disabled={moreLoading} onClick={() => void loadMore()}>Try again</button></div>}
            </>}
        </section>
      </div>
      {drawer && <FirmRecordPanel drawer label={location.view === "cases" ? "Case details" : "Lead details"} busy={navigationLocked} onClose={() => select()}
        recordKey={`${location.leadId}:${location.caseId ?? "lead"}`}
        identity={<><p>{location.view === "cases" ? "Case" : "Lead"}{lead?.firmName ? ` · ${lead.firmName}` : " · Unassigned"}</p><h2>{lead?.name ?? "Loading record…"}</h2>{lead && <FirmStatusBadge status={location.view === "cases" ? lead.caseStatus ?? "open" : lead.status} />}</>}
        navigation={<div className="admin-record-navigation"><span>{selectedIndex >= 0 ? `${selectedIndex + 1} of ${items.length} shown` : "Outside current results"}</span><button className="button small" type="button" aria-label="Previous record" disabled={navigationLocked || !!pending || selectedIndex <= 0} onClick={() => select(items[selectedIndex - 1])}>←</button><button className="button small" type="button" aria-label="Next record" disabled={navigationLocked || !!pending || selectedIndex < 0 || selectedIndex >= items.length - 1} onClick={() => select(items[selectedIndex + 1])}>→</button></div>}>
        {checking && <p className="visually-hidden" role="status">Checking current access…</p>}
        {pending && <p className="visually-hidden" role="status">Opening the requested record…</p>}
        {notice && <div className="admin-drawer-message" role="status"><p>{notice}</p><button className="subtle-link" type="button" onClick={() => setNotice("")}>Dismiss</button></div>}
        {recordError && <div className="admin-drawer-message workspace-error" role="alert"><p>{recordError}</p><button className="subtle-link" type="button" onClick={() => setRecordAttempt((value) => value + 1)}>Try again</button></div>}
        {firmError && <div className="admin-drawer-message workspace-error" role="alert"><p>{firmError}</p><button className="subtle-link" type="button" onClick={() => setFirmAttempt((value) => value + 1)}>Reload firms</button></div>}
        {listError && retryLocation && <div className="admin-drawer-message workspace-error" role="alert"><p>{listError}</p><button className="subtle-link" type="button" onClick={() => void navigate(retryLocation)}>Try again</button></div>}
        {outcome && outcome.id === location.leadId && <div className="admin-drawer-outcome" role="status"><p ref={successHeading} tabIndex={-1}>{outcome.message}</p>{nextReview && <button className="button primary small" type="button" disabled={locked || loading} onClick={() => select(nextReview)}>Review next lead <span aria-hidden="true">→</span></button>}{location.view === "attention" && !nextReview && !loading && <button className="subtle-link" type="button" disabled={locked} onClick={() => select()}>Back to queue</button>}</div>}
        {lead ? <AdminRecordDetail lead={lead} caseView={location.view === "cases"} firms={firms} locked={locked} refreshVersion={refreshVersion} onUpdated={updated} onBusyChange={setChildBusy}
          onAccessLost={() => { void recheckRecordAccess(); }} onOpenCase={() => {
            if (lead.caseId) void navigate({ ...emptyAdminLocation("cases"), leadId: lead.id, caseId: lead.caseId });
          }} /> : !recordError && <p className="admin-drawer-message" role="status">Loading record…</p>}
      </FirmRecordPanel>}
    </main>
  </div>;
}
