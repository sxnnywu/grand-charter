"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { categories, regions } from "@/lib/intake-options";
import { isAccessError, messageFor, request } from "./api-client";
import { AccountSwitcher, Brand } from "./workspace-chrome";
import { FirmCaseDetail, FirmLeadDetail, FirmStatusBadge, firmIssueExcerpt, type FirmCaseRecord } from "./firm-records";
import { FirmCaseBoard, hasFirmBoardData, prepareFirmBoard, type FirmBoardCache, type FirmBoardGroup, type FirmBoardSummary } from "./firm-case-board";
import { FirmRecordPanel } from "./firm-record-panel";
import { caseViews, emptyFirmLocation, firmListUrl, firmUrl, hasFirmDestination, leadViews, readFirmLocation, type FirmFilter, type FirmLayout, type FirmLocation, type FirmView } from "./firm-navigation";
import { animateWorkspace, stopWorkspaceTransition } from "./workspace-motion";
import type { Account, Lead, User } from "./workspace";
import "./firm-workspace.css";

type Decision = "accept" | "decline";
type Page = { path: string; items: Lead[]; nextCursor: string | null };
type LeadResult = { id: string; lead: Lead } | { id: string; error: string };
const dateFormat = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" });

async function loadPage(path: string, signal?: AbortSignal): Promise<Page> {
  if (path.startsWith("/api/cases")) {
    const result = await request<{ cases: { lead: Lead }[]; nextCursor: string | null }>(path, { signal });
    return { path, items: result.cases.map(({ lead }) => lead), nextCursor: result.nextCursor };
  }
  const result = await request<{ leads: Lead[]; nextCursor: string | null }>(path, { signal });
  return { path, items: result.leads, nextCursor: result.nextCursor };
}

async function loadWindow(path: string, previous: Page | undefined, signal: AbortSignal): Promise<Page> {
  let loaded = await loadPage(path, signal);
  if (previous?.path !== path || previous.items.length === 0) return loaded;
  const boundary = previous.items.at(-1)!;
  const pages = Math.ceil(previous.items.length / 50);
  let fetched = 1;
  const reachedBoundary = () => {
    const last = loaded.items.at(-1);
    if (!last) return true;
    const time = new Date(last.createdAt).getTime() - new Date(boundary.createdAt).getTime();
    return time < 0 || (time === 0 && last.id <= boundary.id);
  };
  while (loaded.nextCursor && (fetched < pages || (!reachedBoundary() && fetched < pages + 2))) {
    const next = await loadPage(`${path}&before=${encodeURIComponent(loaded.nextCursor)}`, signal);
    const known = new Set(loaded.items.map(({ id }) => id));
    loaded = { path, items: [...loaded.items, ...next.items.filter(({ id }) => !known.has(id))], nextCursor: next.nextCursor };
    fetched += 1;
  }
  return loaded;
}

function Message({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={`workspace-message${error ? " workspace-error" : ""}`} role={error ? "alert" : "status"}>{children}</div>;
}

function Chevron({ down = false }: { down?: boolean }) {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={down ? "m6 9 6 6 6-6" : "m9 6 6 6-6 6"} /></svg>;
}

function initialLocation(userId: string): FirmLocation {
  const location = readFirmLocation();
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("layout") && !params.has("caseStatus")) {
      try { location.layout = localStorage.getItem(`brief:case-layout:${userId}`) === "board" ? "board" : "list"; } catch {}
    }
  }
  if (location.view === "cases" && location.layout === "board") location.filter = "all";
  return location;
}

function LayoutIcon({ layout }: { layout: FirmLayout }) {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {layout === "board" ? <path d="M3 4h5v16H3ZM10 4h5v16h-5ZM17 4h4v16h-4Z" /> : <path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1" />}
  </svg>;
}

export function FirmWorkspace({ user, accounts, switchAccount, signOut, sessionAction, sessionError, verifySession }: {
  user: User; accounts: Account[]; switchAccount: (email: string) => void; signOut: () => void;
  sessionAction: "sign-out" | "switch" | null; sessionError: string;
  verifySession: (signal?: AbortSignal) => Promise<boolean>;
}) {
  const [location, setLocation] = useState(() => initialLocation(user.id));
  const preferredLayout = useRef(location.layout);
  const listFilter = useRef<FirmFilter>(location.view === "cases" ? location.filter : "all");
  const freshArrival = useRef(!hasFirmDestination());
  const autoOpenSingle = useRef(true);
  const [openingWorkspace, setOpeningWorkspace] = useState(true);
  const locationRef = useRef(location);
  locationRef.current = location;
  const memories = useRef<Record<FirmView, FirmLocation>>({ leads: emptyFirmLocation("leads"), cases: { ...emptyFirmLocation("cases"), layout: location.layout } });
  const [search, setSearch] = useState(location.query);
  const searchInput = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState<Page>();
  const pageRef = useRef(page);
  const settledPages = useRef(new Map<string, Page>());
  const boardCache = useRef<FirmBoardCache>(new Map());
  const navigationRequest = useRef<AbortController | undefined>(undefined);
  const [pendingCollection, setPendingCollection] = useState<FirmLocation>();
  const [collectionError, setCollectionError] = useState("");
  const [pendingRecord, setPendingRecord] = useState<string>();
  const preparedLead = useRef<Lead | undefined>(undefined);
  const preparedCases = useRef(new Map<string, FirmCaseRecord>());
  if (page) {
    settledPages.current.delete(page.path);
    settledPages.current.set(page.path, page);
    while (settledPages.current.size > 20) settledPages.current.delete(settledPages.current.keys().next().value!);
  }
  const [boardRecords, setBoardRecords] = useState<{ path: string; groups: FirmBoardGroup[] }>();
  const [boardSummary, setBoardSummary] = useState<{ path: string; summary: FirmBoardSummary }>();
  const arrivalPage = useRef<Page | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [listAttempt, setListAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");
  const moreRequest = useRef<AbortController | undefined>(undefined);
  const listRevision = useRef(0);
  const [result, setResult] = useState<LeadResult>();
  const lead = result && result.id === location.leadId && "lead" in result ? result.lead : undefined;
  const recordError = result && result.id === location.leadId && "error" in result ? result.error : undefined;
  const [action, setAction] = useState<Decision>();
  const [actionError, setActionError] = useState("");
  const [outcome, setOutcome] = useState<"accepted" | "declined">();
  const [notice, setNotice] = useState("");
  const [childBusy, setChildBusy] = useState(false);
  const mutationBusy = useRef(false);
  mutationBusy.current = !!action || childBusy;
  const [accessChecking, setAccessChecking] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const recheckAccess = useRef<() => void>(() => {});
  const pendingRecheck = useRef(false);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const discardDialog = useRef<HTMLDialogElement>(null);
  const pendingNavigation = useRef<(() => void) | undefined>(undefined);
  const historyHandler = useRef<(event: PopStateEvent) => void>(() => {});
  const historyIndex = useRef(0);
  const currentHref = useRef("");
  const historyRestore = useRef<(() => void) | undefined>(undefined);
  const allowHistory = useRef(false);
  const navigationRevision = useRef(0);
  const listElement = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const listPosition = useRef({ window: 0, panel: 0 });
  const legacyLead = useRef(typeof window !== "undefined" && !new URLSearchParams(window.location.search).has("view") && !!location.leadId && !location.caseId);
  const navigationLocked = !!sessionAction || !!action || childBusy;
  const locked = navigationLocked || accessChecking || !!accessError || !!pendingRecord;
  const board = location.view === "cases" && location.layout === "board";
  const drawer = !!location.leadId;
  const path = firmListUrl(location);
  const currentPage = page?.path === path ? page : settledPages.current.get(path);
  pageRef.current = currentPage;
  const items = currentPage?.items.filter((item) => location.view === "cases"
    ? !!item.caseId && (location.filter === "all" || item.caseStatus === location.filter)
    : item.status === location.filter) ?? [];
  const filtered = !!(location.query || location.region || location.category);
  const filteredBoardEmpty = board && filtered && boardSummary?.path === path && !boardSummary.summary.loading
    && !boardSummary.summary.error && boardSummary.summary.empty;
  const emptyList = !!currentPage && items.length === 0;
  const priorFilterVisibility = useRef(false);
  const showFilters = board || filtered || (currentPage ? !emptyList || drawer : priorFilterVisibility.current);
  useLayoutEffect(() => { priorFilterVisibility.current = showFilters; }, [showFilters]);
  const searchScope = location.view === "leads"
    ? location.filter === "awaiting_firm_review" ? "leads needing review" : `${location.filter} leads`
    : location.filter === "all" ? "all cases" : location.filter === "open" ? "new cases" : location.filter === "in_progress" ? "cases in progress" : `${location.filter} cases`;

  const reportDraft = useCallback((value: boolean) => {
    dirtyRef.current = value;
    setDirty(value);
  }, []);

  const receiveBoardRecords = useCallback((groups: FirmBoardGroup[]) => setBoardRecords({ path, groups }), [path]);
  const receiveBoardSummary = useCallback((summary: FirmBoardSummary) => setBoardSummary({ path, summary }), [path]);

  useEffect(() => () => navigationRequest.current?.abort(), []);
  useEffect(() => {
    if (!sessionAction) return;
    navigationRequest.current?.abort();
    navigationRequest.current = undefined;
    setPendingCollection(undefined);
    setPendingRecord(undefined);
  }, [sessionAction]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function confirmLeaving(change: () => void) {
    if (!dirtyRef.current) { change(); return; }
    pendingNavigation.current = change;
    discardDialog.current?.showModal();
  }

  function applyLocation(next: FirmLocation, history: "push" | "replace" | "none" = "push") {
    navigationRequest.current?.abort();
    navigationRequest.current = undefined;
    setPendingCollection(undefined);
    setPendingRecord(undefined);
    const previous = locationRef.current;
    if (history === "none") {
      preparedLead.current = undefined;
      preparedCases.current.clear();
    }
    if (firmListUrl(previous) !== firmListUrl(next) || previous.layout !== next.layout) {
      if (history === "none") setListAttempt((current) => current + 1);
      setListError("");
      setMoreError("");
      setLoadingMore(false);
      setLoading(!(next.view === "cases" && next.layout === "board") && !settledPages.current.has(firmListUrl(next)));
    }
    if (next.view === "cases" && next.layout !== previous.layout) {
      preferredLayout.current = next.layout;
      try { localStorage.setItem(`brief:case-layout:${user.id}`, next.layout); } catch {}
    }
    memories.current[previous.view] = previous;
    memories.current[next.view] = next;
    if (next.view === "cases" && next.layout === "list") listFilter.current = next.filter;
    locationRef.current = next;
    setLocation(next);
    setSearch(next.query);
    setAccessError("");
    setActionError("");
    setNotice("");
    if (previous.leadId !== next.leadId || previous.caseId !== next.caseId) {
      setOutcome(undefined);
      reportDraft(false);
      if (previous.leadId !== next.leadId && preparedLead.current?.id !== next.leadId) setResult(undefined);
    }
    if (history !== "none") {
      const url = firmUrl(next);
      if (url.href !== window.location.href) {
        if (history === "push") historyIndex.current += 1;
        window.history[history === "push" ? "pushState" : "replaceState"](
          { ...window.history.state, briefFirmIndex: historyIndex.current }, "", url,
        );
      }
    }
    currentHref.current = window.location.href;
  }

  function navigate(next: FirmLocation, scope: "page" | "detail" | "drawer" | "record" | "collection" = "collection", openSingle = false) {
    if (navigationLocked) return;
    const change = () => {
      navigationRevision.current += 1;
      const revision = navigationRevision.current;
      freshArrival.current = false;
      autoOpenSingle.current = openSingle;
      setOpeningWorkspace(false);
      setCollectionError("");
      const current = locationRef.current;
      const changesCollection = scope === "collection" && (next.view !== current.view || next.layout !== current.layout);
      const changesRecord = !!next.leadId && (next.leadId !== current.leadId || next.caseId !== current.caseId);
      if (!changesCollection && !changesRecord) {
        animateWorkspace(scope, () => applyLocation(next));
        return;
      }
      navigationRequest.current?.abort();
      const controller = new AbortController();
      navigationRequest.current = controller;
      const targetBoard = next.view === "cases" && next.layout === "board";
      const targetPath = firmListUrl(next);
      const cached = targetBoard ? hasFirmBoardData(next, boardCache.current) : settledPages.current.has(targetPath);
      const needsCollection = changesCollection && !cached;
      const version = changesCollection ? listAttempt + 1 : listAttempt;
      if (!needsCollection && !changesRecord) {
        arrivalPage.current = undefined;
        if (!targetBoard) setPage(settledPages.current.get(targetPath));
        setListAttempt((value) => Math.max(value, version));
        applyLocation(next);
        return;
      }
      setPendingCollection(changesCollection ? next : undefined);
      setPendingRecord(changesRecord ? next.leadId : undefined);
      const loadDetail = async (target: FirmLocation) => {
        const [{ lead }, result] = await Promise.all([
          request<{ lead: Lead }>(`/api/leads/${encodeURIComponent(target.leadId!)}`, { signal: controller.signal }),
          target.caseId ? request<{ case: FirmCaseRecord }>(`/api/cases/${encodeURIComponent(target.caseId)}`, { signal: controller.signal }) : Promise.resolve(undefined),
        ]);
        return { lead, record: result?.case };
      };
      void (async () => {
        const [loaded, initialDetail] = await Promise.all([
          needsCollection ? targetBoard
            ? prepareFirmBoard(next, boardCache.current, version, controller.signal).then(() => undefined)
            : loadPage(targetPath, controller.signal) : Promise.resolve(undefined),
          changesRecord ? loadDetail(next) : Promise.resolve(undefined),
        ]);
        let destination = next;
        let detail = initialDetail;
        if (loaded && openSingle && !next.leadId && loaded.items.length === 1 && !loaded.nextCursor) {
          const only = loaded.items[0];
          destination = { ...next, leadId: only.id, caseId: next.view === "cases" ? only.caseId ?? undefined : undefined };
          setPendingRecord(only.id);
          detail = await loadDetail(destination);
        }
        if (controller.signal.aborted || revision !== navigationRevision.current) return;
        const commit = () => {
          if (controller.signal.aborted || revision !== navigationRevision.current) return;
          if (detail) {
            preparedLead.current = locationRef.current.leadId !== detail.lead.id ? detail.lead : undefined;
            setResult({ id: detail.lead.id, lead: detail.lead });
            if (detail.record) {
              preparedCases.current.set(detail.record.id, detail.record);
              while (preparedCases.current.size > 20) preparedCases.current.delete(preparedCases.current.keys().next().value!);
            }
          }
          if (loaded) {
            settledPages.current.set(targetPath, loaded);
            arrivalPage.current = loaded;
            setPage(loaded);
            setLoading(false);
            autoOpenSingle.current = false;
          } else if (changesCollection && !targetBoard) setPage(settledPages.current.get(targetPath));
          if (changesCollection) setListAttempt((value) => Math.max(value, version));
          applyLocation(destination);
        };
        animateWorkspace(scope, commit);
      })().catch((failure: unknown) => {
        if (controller.signal.aborted || revision !== navigationRevision.current) return;
        controller.abort();
        navigationRequest.current = undefined;
        setPendingCollection(undefined);
        setPendingRecord(undefined);
        setCollectionError(messageFor(failure));
        if (isAccessError(failure)) void verifySession().catch(() => {});
      });
    };
    const current = locationRef.current;
    if (next.view === current.view && next.leadId === current.leadId && next.caseId === current.caseId) change();
    else confirmLeaving(change);
  }

  function changeView(view: FirmView) {
    if (view === location.view) {
      if (pendingCollection) {
        navigationRevision.current += 1;
        navigationRequest.current?.abort();
        navigationRequest.current = undefined;
        setPendingCollection(undefined);
        setPendingRecord(undefined);
      }
      if (location.leadId) select();
      return;
    }
    navigate(memories.current[view], "collection", true);
  }

  function changeFilter(filter: FirmFilter) {
    if (filter !== location.filter) {
      navigate({ ...location, filter, leadId: undefined, caseId: undefined });
    }
  }

  function changeLayout(layout: FirmLayout) {
    if (navigationLocked) return;
    if (layout === location.layout) {
      if (pendingCollection) {
        navigationRevision.current += 1;
        navigationRequest.current?.abort();
        navigationRequest.current = undefined;
        setPendingCollection(undefined);
        setPendingRecord(undefined);
      }
      return;
    }
    if (layout === "board") listFilter.current = location.filter;
    const next = { ...location, layout, filter: layout === "board" ? "all" as const : listFilter.current };
    navigate(next, "collection");
  }

  function select(item?: Lead) {
    if (!item && !location.leadId) return;
    if (item && location.leadId === item.id && (location.view !== "cases" || location.caseId === item.caseId)) return;
    if (item && !location.leadId) listPosition.current = { window: window.scrollY, panel: listElement.current?.scrollTop ?? 0 };
    navigate({ ...location, leadId: item?.id, caseId: location.view === "cases" ? item?.caseId ?? undefined : undefined },
      item && location.leadId ? "record" : "drawer");
  }

  historyHandler.current = (event) => {
    navigationRevision.current += 1;
    freshArrival.current = false;
    autoOpenSingle.current = false;
    setOpeningWorkspace(false);
    if (historyRestore.current) {
      const restored = historyRestore.current;
      historyRestore.current = undefined;
      restored();
      return;
    }
    const target = readFirmLocation();
    const targetIndex: unknown = event.state?.briefFirmIndex;
    const sameRecord = target.view === locationRef.current.view && target.leadId === locationRef.current.leadId && target.caseId === locationRef.current.caseId;
    if (dirtyRef.current && !allowHistory.current && !sameRecord) {
      if (typeof targetIndex === "number" && targetIndex !== historyIndex.current) {
        const distance = historyIndex.current - targetIndex;
        historyRestore.current = () => confirmLeaving(() => { allowHistory.current = true; window.history.go(-distance); });
        window.history.go(distance);
      } else {
        window.history.replaceState({ ...window.history.state, briefFirmIndex: historyIndex.current }, "", currentHref.current);
        confirmLeaving(() => animateWorkspace(target.leadId ? "drawer" : "collection", () => applyLocation(target, "replace")));
      }
      return;
    }
    allowHistory.current = false;
    if (typeof targetIndex === "number") historyIndex.current = targetIndex;
    const motion = target.leadId && locationRef.current.leadId ? "record" : target.leadId || locationRef.current.leadId ? "drawer" : "collection";
    animateWorkspace(motion, () => applyLocation(target, "none"));
  };

  useEffect(() => {
    historyIndex.current = typeof window.history.state?.briefFirmIndex === "number" ? window.history.state.briefFirmIndex : 0;
    window.history.replaceState({ ...window.history.state, briefFirmIndex: historyIndex.current }, "", window.location.href);
    currentHref.current = window.location.href;
    const restore = (event: PopStateEvent) => historyHandler.current(event);
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  useLayoutEffect(() => {
    if (!location.leadId && !openingWorkspace) {
      window.scrollTo(0, listPosition.current.window);
      if (listElement.current) listElement.current.scrollTop = listPosition.current.panel;
      heading.current?.focus({ preventScroll: true });
    }
  }, [location.leadId, location.caseId, location.view, openingWorkspace]);

  const onAccessLost = useCallback(() => {
    if (locationRef.current.leadId !== location.leadId) return;
    navigationRevision.current += 1;
    freshArrival.current = false;
    autoOpenSingle.current = false;
    arrivalPage.current = undefined;
    navigationRequest.current?.abort();
    navigationRequest.current = undefined;
    setPendingCollection(undefined);
    setPendingRecord(undefined);
    settledPages.current.clear();
    boardCache.current.clear();
    preparedCases.current.clear();
    preparedLead.current = undefined;
    setOpeningWorkspace(false);
    stopWorkspaceTransition();
    discardDialog.current?.close();
    pendingNavigation.current = undefined;
    reportDraft(false);
    setResult(undefined);
    setPage((current) => current && { ...current, items: current.items.filter(({ id }) => id !== location.leadId) });
    const next = { ...locationRef.current, leadId: undefined, caseId: undefined };
    locationRef.current = next;
    setLocation(next);
    setOutcome(undefined);
    setActionError("");
    setAccessError("");
    setListAttempt((attempt) => attempt + 1);
    const url = firmUrl(next);
    window.history.replaceState({ ...window.history.state, briefFirmIndex: historyIndex.current }, "", url);
    currentHref.current = url.href;
    setNotice("This record is no longer available to your account. The list has been refreshed.");
    void verifySession().catch(() => {});
  }, [location.leadId, reportDraft, verifySession]);

  useEffect(() => {
    const stopMore = () => { moreRequest.current?.abort(); moreRequest.current = undefined; };
    if (board) {
      autoOpenSingle.current = false;
      arrivalPage.current = undefined;
      setLoading(false);
      setListError("");
      setOpeningWorkspace(false);
      return stopMore;
    }
    if (arrivalPage.current?.path === path) {
      arrivalPage.current = undefined;
      setLoading(false);
      setOpeningWorkspace(false);
      return stopMore;
    }
    const controller = new AbortController();
    const revision = listRevision.current;
    setLoading(true);
    setListError("");
    setMoreError("");
    setLoadingMore(false);
    const navigation = navigationRevision.current;
    loadWindow(path, pageRef.current, controller.signal).then(async (loaded) => {
      const current = () => !controller.signal.aborted && revision === listRevision.current;
      if (!current()) return;
      let destination = locationRef.current;
      if (freshArrival.current && navigation === navigationRevision.current && loaded.items.length === 0) {
        const casesLocation = { ...emptyFirmLocation("cases"), layout: preferredLayout.current };
        const cases = await loadPage(firmListUrl(casesLocation), controller.signal);
        if (!current()) return;
        if (navigation === navigationRevision.current && cases.items.length > 0) { destination = casesLocation; loaded = cases; }
        else destination = locationRef.current;
      }
      freshArrival.current = false;
      if (autoOpenSingle.current && navigation === navigationRevision.current && !(destination.view === "cases" && destination.layout === "board") && !destination.leadId && loaded.items.length === 1 && !loaded.nextCursor) {
        const only = loaded.items[0];
        destination = { ...destination, leadId: only.id, caseId: destination.view === "cases" ? only.caseId ?? undefined : undefined };
      }
      autoOpenSingle.current = false;
      if (destination !== locationRef.current) {
        if (destination.view !== locationRef.current.view) arrivalPage.current = loaded;
        applyLocation(destination, "replace");
      }
      setPage(loaded);
      setOpeningWorkspace(false);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && revision === listRevision.current) setListError(messageFor(error));
    }).finally(() => {
      if (!controller.signal.aborted && revision === listRevision.current) { setLoading(false); setOpeningWorkspace(false); }
    });
    return () => { controller.abort(); stopMore(); };
  }, [path, listAttempt, board]);

  useEffect(() => {
    if (!location.leadId) return;
    const id = location.leadId;
    if (preparedLead.current?.id === id) {
      preparedLead.current = undefined;
      return;
    }
    const controller = new AbortController();
    request<{ lead: Lead }>(`/api/leads/${encodeURIComponent(id)}`, { signal: controller.signal }).then(({ lead }) => {
      if (controller.signal.aborted) return;
      setResult({ id, lead });
      if (legacyLead.current) {
        legacyLead.current = false;
        if (["awaiting_firm_review", "accepted", "declined"].includes(lead.status)) {
          const next = { ...locationRef.current, filter: lead.status as FirmFilter };
          locationRef.current = next;
          setLocation(next);
          const url = firmUrl(next);
          window.history.replaceState({ ...window.history.state, briefFirmIndex: historyIndex.current }, "", url);
          currentHref.current = url.href;
        }
      }
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (isAccessError(error)) onAccessLost();
      else setResult({ id, error: messageFor(error) });
    });
    return () => controller.abort();
  }, [location.leadId, onAccessLost]);

  useEffect(() => {
    let disposed = false;
    let controller: AbortController | undefined;
    async function check() {
      if (controller || document.visibilityState === "hidden") return;
      if (mutationBusy.current) { pendingRecheck.current = true; return; }
      pendingRecheck.current = false;
      controller = new AbortController();
      setAccessChecking(true);
      setAccessError("");
      try {
        const signal = controller.signal;
        if (!await verifySession(signal) || disposed) return;
        if (location.leadId) {
          const [{ lead }] = await Promise.all([
            request<{ lead: Lead }>(`/api/leads/${location.leadId}`, { signal }),
            location.caseId ? request(`/api/cases/${location.caseId}`, { signal }) : Promise.resolve(),
          ]);
          if (disposed || signal.aborted) return;
          setResult({ id: location.leadId, lead });
        }
        setRefreshVersion((version) => version + 1);
        setListAttempt((attempt) => attempt + 1);
      } catch (error) {
        if (disposed || controller.signal.aborted) return;
        if (isAccessError(error)) onAccessLost();
        else setAccessError("We couldn’t check your current access. Your unsent work is still here. Reconnect and try again.");
      } finally {
        if (!disposed) { controller = undefined; setAccessChecking(false); }
      }
    }
    recheckAccess.current = () => { void check(); };
    const onFocus = recheckAccess.current;
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => { disposed = true; controller?.abort(); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisible); };
  }, [location.leadId, location.caseId, verifySession, onAccessLost]);

  useEffect(() => {
    if (!action && !childBusy && pendingRecheck.current) recheckAccess.current();
  }, [action, childBusy]);

  async function more(): Promise<Lead[]> {
    if (!currentPage?.nextCursor || moreRequest.current || loading) return [];
    const controller = new AbortController();
    const revision = listRevision.current;
    moreRequest.current = controller;
    setLoadingMore(true);
    setMoreError("");
    try {
      const loaded = await loadPage(`${path}&before=${encodeURIComponent(currentPage.nextCursor)}`, controller.signal);
      if (controller.signal.aborted || revision !== listRevision.current) return [];
      setPage((current) => {
        if (current?.path !== path) return current;
        const seen = new Set(current.items.map(({ id }) => id));
        return { path, items: [...current.items, ...loaded.items.filter(({ id }) => !seen.has(id))], nextCursor: loaded.nextCursor };
      });
      return loaded.items;
    } catch (error) {
      if (!controller.signal.aborted) setMoreError(messageFor(error));
      return [];
    } finally {
      if (moreRequest.current === controller) { moreRequest.current = undefined; setLoadingMore(false); }
    }
  }

  async function decide(decision: Decision) {
    if (!lead || locked || mutationBusy.current) return;
    mutationBusy.current = true;
    const revision = navigationRevision.current;
    setAction(decision);
    setActionError("");
    try {
      let updated: Lead;
      if (decision === "accept") {
        const { caseId } = await request<{ caseId: string }>(`/api/leads/${lead.id}/accept`, { method: "POST" });
        updated = { ...lead, status: "accepted", caseId, caseStatus: "open" };
      } else updated = (await request<{ lead: Lead }>(`/api/leads/${lead.id}/decline`, { method: "POST" })).lead;
      listRevision.current += 1;
      setPage((current) => current && { ...current, items: current.items.map((item) => item.id === updated.id ? updated : item) });
      setListAttempt((attempt) => attempt + 1);
      if (revision !== navigationRevision.current || locationRef.current.leadId !== updated.id) {
        setNotice(decision === "accept" ? "Lead accepted. Its case is available in Cases." : "Lead declined. Admin will handle the next step.");
        return;
      }
      setResult({ id: updated.id, lead: updated });
      setOutcome(decision === "accept" ? "accepted" : "declined");
    } catch (error) {
      if (isAccessError(error)) onAccessLost();
      else if (revision === navigationRevision.current) setActionError(messageFor(error));
    } finally { mutationBusy.current = false; setAction(undefined); }
  }

  const updateCase = useCallback((record: Pick<FirmCaseRecord, "id" | "leadId" | "name" | "status" | "firmName">) => {
    const update = (item: Lead): Lead => item.id === record.leadId && item.caseId === record.id
      ? { ...item, name: record.name, caseStatus: record.status, firmName: record.firmName } : item;
    setResult((current) => current && "lead" in current ? { ...current, lead: update(current.lead) } : current);
    setPage((current) => current && { ...current, items: current.items.map(update) });
  }, []);

  function openCase() {
    if (lead?.caseId) navigate({ ...emptyFirmLocation("cases"), layout: preferredLayout.current, leadId: lead.id, caseId: lead.caseId });
  }

  async function reviewNext() {
    let next = items.find((item) => item.status === "awaiting_firm_review" && item.id !== lead?.id);
    if (!next && currentPage?.nextCursor) next = (await more()).find((item) => item.status === "awaiting_firm_review");
    if (next) select(next);
    else select();
  }

  const nextReview = items.some((item) => item.status === "awaiting_firm_review" && item.id !== lead?.id) || !!currentPage?.nextCursor;
  const activeBoardGroup = boardRecords?.path === path ? boardRecords.groups.find((group) => group.items.some(({ id }) => id === location.leadId)) : undefined;
  const browseItems = board ? activeBoardGroup?.items ?? [] : items;
  const browseIndex = browseItems.findIndex(({ id }) => id === location.leadId);
  const browseMore = board ? !!activeBoardGroup?.nextCursor : !!currentPage?.nextCursor;
  const previousRecord = browseIndex > 0 ? browseItems[browseIndex - 1] : undefined;
  const nextRecord = browseIndex >= 0 ? browseItems[browseIndex + 1] : undefined;
  const recordNavigation = browseIndex >= 0 && <div className="firm-record-navigation" role="group" aria-label={`Browse ${location.view}`}>
    <span>{browseIndex + 1} of {browseItems.length}{browseMore ? " shown" : ""}</span>
    <button className="button small" type="button" aria-label={`Previous ${location.view === "cases" ? "case" : "lead"}`}
      disabled={navigationLocked || !!pendingRecord || !previousRecord} onClick={() => select(previousRecord)}><span aria-hidden="true">←</span></button>
    <button className="button small" type="button" aria-label={`Next ${location.view === "cases" ? "case" : "lead"}`}
      disabled={navigationLocked || !!pendingRecord || !nextRecord} title={!nextRecord && browseMore ? "More records are available in the list." : undefined}
      onClick={() => select(nextRecord)}><span aria-hidden="true">→</span></button>
  </div>;
  function clearFilters() {
    navigate({ ...location, query: "", region: "", category: "", leadId: undefined, caseId: undefined });
  }

  const emptyState = <div className="firm-empty">
    <h2>{filtered ? `No matching ${location.view}` : location.view === "cases" ? location.filter === "all" ? "No cases yet" : `No ${location.filter === "open" ? "new cases" : location.filter === "in_progress" ? "cases in progress" : `${location.filter} cases`}`
      : location.filter === "awaiting_firm_review" ? "No leads need review" : location.filter === "accepted" ? "No accepted leads" : "No declined leads"}</h2>
    <p>{filtered ? `Search applies to ${searchScope}. Try another name or full record ID, or clear your filters.` : location.view === "cases"
      ? location.filter === "all" ? "When your firm accepts a lead, its case appears here." : "You can find your firm’s other cases in All cases."
      : location.filter === "awaiting_firm_review" ? "You’re caught up. Continue working on your firm’s cases." : "Your firm’s past lead decisions will appear here."}</p>
    <button className="button primary" type="button" disabled={navigationLocked}
      onClick={() => filtered ? clearFilters() : location.view === "leads" ? changeView("cases") : location.filter === "all" ? changeView("leads") : changeFilter("all")}>
      {filtered ? "Clear filters" : location.view === "leads" ? "View cases" : location.filter === "all" ? "Review leads" : "View all cases"}
    </button>
  </div>;
  const role = user.role === "paralegal" ? "paralegal" : "attorney";
  const record = lead ? location.caseId && lead.caseId === location.caseId ? <FirmCaseDetail key={location.caseId}
    id={location.caseId} initialRecord={preparedCases.current.get(location.caseId)} lead={lead} role={role} drawer onBack={() => select()} locked={locked} onBusyChange={setChildBusy}
    onAccessLost={onAccessLost} refreshVersion={refreshVersion} onLoaded={updateCase} onDraftChange={reportDraft}
    onStatusChange={(status) => { updateCase({ id: lead.caseId!, leadId: lead.id, name: lead.name,
      firmName: lead.firmName, status }); setListAttempt((attempt) => attempt + 1); }} />
    : <FirmLeadDetail key={lead.id} lead={lead} role={role} drawer onBack={() => select()} onOpenCase={openCase}
      onReviewNext={() => { void reviewNext(); }} hasNextReview={nextReview} decision={action} decisionError={actionError}
      decisionNotice={outcome} onDecide={(decision) => { void decide(decision); }} locked={locked} onBusyChange={setChildBusy}
      onAccessLost={onAccessLost} refreshVersion={refreshVersion} />
    : <div className="firm-record-placeholder">
      {recordError ? <Message error>{recordError}{" "}<button className="subtle-link" type="button" onClick={() => recheckAccess.current()}>Try again</button></Message>
        : <h2>Loading details…</h2>}
    </div>;

  return <div className="shell demo-portal firm-shell">
    <main className="main">
      <header className="topbar firm-topbar" inert={drawer}>
        <Brand />
        <nav className="firm-navigation" aria-label="Main navigation">
          {(["leads", "cases"] as const).map((view) => <button type="button" key={view} disabled={navigationLocked}
            aria-busy={pendingCollection?.view === view} data-pending={pendingCollection?.view === view || undefined}
            aria-current={location.view === view ? "page" : undefined} onClick={() => changeView(view)}>{view === "leads" ? "Review leads" : "Manage cases"}</button>)}
        </nav>
        <span className="firm-workspace-name">{user.firmName}</span>
        <div className="topbar-actions">
          <AccountSwitcher user={user} accounts={accounts} disabled={navigationLocked} switching={sessionAction === "switch"}
            onSwitch={(email) => confirmLeaving(() => switchAccount(email))} />
          <button className="button small" type="button" disabled={navigationLocked} onClick={() => confirmLeaving(signOut)}>{sessionAction === "sign-out" ? "Signing out…" : "Sign out"}</button>
        </div>
      </header>
      <div className="content firm-content" inert={!!sessionAction}>
        <div inert={drawer}>
        {sessionError && <Message error>{sessionError}</Message>}
        {!drawer && collectionError && <Message error>{collectionError}</Message>}
        <span className="visually-hidden" role="status">{pendingCollection ? `Loading ${pendingCollection.view === location.view ? pendingCollection.layout === "board" ? "board" : "list" : pendingCollection.view}…` : ""}</span>
        {notice && <Message>{notice}</Message>}
        {!drawer && accessChecking && <p className="visually-hidden" role="status">Checking current access…</p>}
        {!drawer && accessError && <Message error>{accessError}{" "}<button className="subtle-link" type="button" onClick={() => recheckAccess.current()}>Try again</button></Message>}
        </div>
        {openingWorkspace ? <div className="portal-page firm-arriving" role="status">Opening your workspace…</div> : <div className={`portal-page firm-page${location.leadId ? " has-selection" : ""}${board ? " is-board" : ""}`}>
          <header className="page-heading firm-page-heading" inert={drawer}>
            <div className="firm-heading-copy">
            <h1 tabIndex={-1} ref={heading}>{location.view === "leads" ? "Leads" : "Cases"}</h1>
            <p>{location.view === "leads" ? "Review requests. Accept a lead to start a case." : "Your firm’s accepted work."}</p>
            </div>
            {location.view === "cases" && <div className="firm-layout-controls" role="group" aria-label="Case layout">
              {(["list", "board"] as const).map((layout) => <button type="button" key={layout} aria-pressed={location.layout === layout}
                aria-busy={pendingCollection?.view === "cases" && pendingCollection.layout === layout}
                data-pending={pendingCollection?.view === "cases" && pendingCollection.layout === layout || undefined}
                disabled={navigationLocked} onClick={() => changeLayout(layout)}><LayoutIcon layout={layout} />{layout === "list" ? "List" : "Board"}</button>)}
            </div>}
          </header>
          <div className="firm-list-controls" inert={drawer}>
            {!board && <nav className="firm-view-tabs" aria-label={location.view === "leads" ? "Lead views" : "Case views"}>
              {(location.view === "leads" ? leadViews : caseViews).map(([value, title]) => <button className="staff-tab" type="button" key={value}
                aria-pressed={location.filter === value} disabled={navigationLocked} onClick={() => changeFilter(value)}>{title}</button>)}
            </nav>}
            {showFilters && <div className="firm-filters">
              <form role="search" className="firm-search" onSubmit={(event) => { event.preventDefault(); navigate({ ...location, query: search.trim(), leadId: undefined, caseId: undefined }); }}>
                <div className="field"><label htmlFor="firm-search">Search {searchScope}</label><span className="firm-search-input"><input ref={searchInput} id="firm-search" name="q" type="search" maxLength={120} value={search}
                  placeholder="Plaintiff name or full record ID" disabled={navigationLocked} onChange={(event) => {
                    const value = event.target.value;
                    if (!value && location.query) navigate({ ...location, query: "", leadId: undefined, caseId: undefined });
                    else setSearch(value);
                  }} />
                  {search && <button className="firm-clear-search" type="button" aria-label="Clear search" disabled={navigationLocked} onClick={() => {
                    if (location.query) navigate({ ...location, query: "", leadId: undefined, caseId: undefined });
                    else setSearch("");
                    searchInput.current?.focus();
                  }}><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg></button>}
                </span></div>
                <button className="button" type="submit" disabled={navigationLocked}>Search</button>
              </form>
              <label className="field">Province<span className="firm-select"><select value={location.region} disabled={navigationLocked}
                onChange={(event) => navigate({ ...location, region: event.target.value, leadId: undefined, caseId: undefined })}>
                <option value="">All provinces</option>{regions.map((region) => <option key={region}>{region}</option>)}</select><Chevron down /></span></label>
              <label className="field">Category<span className="firm-select"><select value={location.category} disabled={navigationLocked}
                onChange={(event) => navigate({ ...location, category: event.target.value, leadId: undefined, caseId: undefined })}>
                <option value="">All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select><Chevron down /></span></label>
            </div>}
            <div className="firm-active-filters" aria-label="Active filters">
              {location.query && <button type="button" className="firm-filter-chip" disabled={navigationLocked} aria-label="Remove search filter"
                onClick={() => navigate({ ...location, query: "", leadId: undefined, caseId: undefined })}><span>“{location.query}”</span><span aria-hidden="true">×</span></button>}
              {location.region && <button type="button" className="firm-filter-chip" disabled={navigationLocked} aria-label="Remove province filter"
                onClick={() => navigate({ ...location, region: "", leadId: undefined, caseId: undefined })}><span>{location.region}</span><span aria-hidden="true">×</span></button>}
              {location.category && <button type="button" className="firm-filter-chip" disabled={navigationLocked} aria-label="Remove category filter"
                onClick={() => navigate({ ...location, category: "", leadId: undefined, caseId: undefined })}><span>{location.category}</span><span aria-hidden="true">×</span></button>}
              {filtered && <button type="button" className="subtle-link" disabled={navigationLocked} onClick={clearFilters}>Clear filters</button>}
            </div>
          </div>
          {!board && listError && <Message error>{listError}{" "}<button className="subtle-link" type="button" onClick={() => setListAttempt((attempt) => attempt + 1)}>Try again</button></Message>}
          <div className={`firm-workspace-grid${board ? " firm-board-grid" : !location.leadId && items.length === 0 ? " is-empty" : ""}`}>
            {board ? <div className={`firm-board-canvas${filteredBoardEmpty ? " is-filtered-empty" : ""}`} inert={drawer}>
              {filteredBoardEmpty && <div className="firm-board-no-matches" role="status"><div><h2>No cases match these filters</h2>
                <p>{[location.query && `Name or record ID: ${location.query}`, location.region, location.category].filter(Boolean).join(" · ")}</p></div>
                <button className="button" type="button" disabled={navigationLocked} onClick={clearFilters}>Clear filters</button></div>}
              <FirmCaseBoard location={location} selectedId={location.leadId} locked={navigationLocked}
              cache={boardCache.current}
              onRecordsChange={receiveBoardRecords} onSummaryChange={receiveBoardSummary}
              refreshVersion={listAttempt} onSelect={select} onAccessLost={() => {
                if (locationRef.current.leadId) onAccessLost();
                else void verifySession().catch(() => {});
              }} /></div> : <section className="firm-list" aria-label={location.view === "leads" ? "Firm leads" : "Firm cases"} aria-busy={loading}>
              {(!emptyList || !!location.leadId) && (currentPage || loading) && <div className="firm-list-label">{!currentPage && loading ? `Loading ${location.view}…` : `${items.length} ${location.view === "leads" ? "lead" : "case"}${items.length === 1 ? "" : "s"} shown${loading ? " · Updating…" : currentPage?.nextCursor ? " · More available" : ""}`}</div>}
              <div className="firm-list-scroll" ref={listElement}>
                {items.map((item) => <button className={`firm-row${location.leadId === item.id ? " is-selected" : ""}`} type="button" key={item.id}
                  data-record-id={item.id} disabled={navigationLocked} aria-pressed={location.leadId === item.id} onClick={() => select(item)}>
                  <span className="firm-row-heading"><span className="firm-row-title">{item.name}</span></span>
                  <span className="firm-row-issue">{firmIssueExcerpt(item.description, 110)}</span>
                  <span className="firm-row-context">{item.category} · {item.region}</span>
                  <FirmStatusBadge status={location.view === "cases" ? item.caseStatus ?? "open" : item.status} />
                  <time dateTime={item.createdAt}>Submitted {dateFormat.format(new Date(item.createdAt))}</time>
                  <Chevron />
                </button>)}
                {emptyList && emptyState}
                {moreError && <Message error>{moreError}</Message>}
                {currentPage?.nextCursor && <button className="button firm-load-more" type="button" disabled={navigationLocked || loadingMore || loading} onClick={() => { void more(); }}>{loadingMore ? "Loading…" : "Load more"}</button>}
              </div>
            </section>}
            {!!location.leadId && <FirmRecordPanel drawer={drawer} navigation={recordNavigation} recordKey={`${location.leadId}:${location.caseId ?? ""}`}
              identity={lead ? <><h2>{lead.name}</h2><FirmStatusBadge status={location.caseId ? lead.caseStatus ?? "open" : lead.status} /></> : undefined}
              label={location.view === "cases" ? "Case details" : "Lead details"} busy={navigationLocked} onClose={() => select()}>
              <div className="firm-record-access-feedback">
                {collectionError && <Message error>{collectionError}</Message>}
                {pendingRecord && <p className="visually-hidden" role="status">Loading record…</p>}
                {drawer && accessChecking && <p className="visually-hidden" role="status">Checking current access…</p>}
                {drawer && accessError && <Message error>{accessError}{" "}<button className="subtle-link" type="button" onClick={() => recheckAccess.current()}>Try again</button></Message>}
              </div>
              {record}
            </FirmRecordPanel>}
          </div>
        </div>}
      </div>
      <dialog ref={discardDialog} aria-labelledby="firm-discard-title" aria-describedby="firm-discard-description" onClose={() => {
        if (!discardDialog.current?.open) pendingNavigation.current = undefined;
      }}>
        <div className="dialog-head"><h2 id="firm-discard-title">Discard unsent work?</h2></div>
        <div className="dialog-body"><p id="firm-discard-description">Your unsent changes will be lost if you continue.</p></div>
        <form method="dialog" className="dialog-footer">
          <button className="button" type="submit">Keep editing</button>
          <button className="button primary danger" type="button" disabled={navigationLocked} onClick={() => {
            const change = pendingNavigation.current;
            discardDialog.current?.close();
            change?.();
          }}>Discard and continue</button>
        </form>
      </dialog>
    </main>
  </div>;
}
