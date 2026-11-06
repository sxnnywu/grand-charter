"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { isAccessError, messageFor, request } from "./api-client";
import { firmIssueExcerpt } from "./firm-records";
import type { Lead } from "./workspace";
import "./firm-case-board.css";

const columns = [
  { status: "open", title: "New cases", empty: "No new cases" },
  { status: "in_progress", title: "In progress", empty: "No cases in progress" },
  { status: "closed", title: "Closed", empty: "No closed cases" },
] as const;
type Column = typeof columns[number];
type CaseStatus = Column["status"];
type CasePage = { cases: { lead: Lead }[]; nextCursor: string | null; totalCount?: number };
export type FirmBoardGroup = { status: CaseStatus; items: Lead[]; nextCursor: string | null };
export type FirmBoardSummary = { loading: boolean; empty: boolean; error: boolean; totalCount?: number };
type BoardLocation = { query: string; region: string; category: string; firmId?: string; sort?: "oldest" | "newest" };
type ColumnData = { items: Lead[]; nextCursor: string | null; totalCount?: number; pages: number; newIds: Set<string> };
type ColumnResult = { path: string; requestKey: string; data?: ColumnData; error?: string };
export type FirmBoardCache = Map<string, ColumnResult>;
type ColumnReport = FirmBoardGroup & { path: string; totalCount?: number; loading: boolean; error: boolean; ready: boolean };
type Props = {
  location: BoardLocation;
  showFirm?: boolean;
  selectedId?: string;
  locked: boolean;
  refreshVersion: number;
  onSelect: (lead: Lead) => void;
  onAccessLost: () => void;
  onRecordsChange?: (groups: FirmBoardGroup[]) => void;
  onSummaryChange?: (summary: FirmBoardSummary) => void;
  cache?: FirmBoardCache;
};
const emptyItems: Lead[] = [];
const dateFormat = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" });
const numberFormat = new Intl.NumberFormat("en-CA");

function columnPath(location: BoardLocation, status: CaseStatus) {
  const params = new URLSearchParams({ status });
  if (location.query) params.set("q", location.query);
  if (location.region) params.set("region", location.region);
  if (location.category) params.set("category", location.category);
  if (location.firmId) params.set("firmId", location.firmId);
  if (location.sort) params.set("sort", location.sort);
  return `/api/cases?${params}`;
}

function appendCases(items: Lead[], page: CasePage, status: CaseStatus) {
  const seen = new Set(items.map(({ id }) => id));
  for (const { lead } of page.cases) {
    if (lead.caseId && lead.caseStatus === status && !seen.has(lead.id)) {
      seen.add(lead.id);
      items.push(lead);
    }
  }
}

export async function prepareFirmBoard(location: BoardLocation, cache: FirmBoardCache, version: number, signal: AbortSignal) {
  const prepared = await Promise.all(columns.map(async (column): Promise<ColumnResult> => {
    const path = columnPath(location, column.status);
    const page = await request<CasePage>(`${path}&count=true`, { signal });
    const items: Lead[] = [];
    appendCases(items, page, column.status);
    return { path, requestKey: `${path}|${version}|0`, data: { items, nextCursor: page.nextCursor, pages: 1,
      totalCount: Number.isSafeInteger(page.totalCount) && page.totalCount! >= 0 ? page.totalCount : undefined,
      newIds: new Set() } };
  }));
  if (signal.aborted) return;
  for (const result of prepared) cache.set(result.path, result);
}

export function hasFirmBoardData(location: BoardLocation, cache: FirmBoardCache) {
  return columns.every((column) => !!cache.get(columnPath(location, column.status))?.data);
}

function CaseColumn({ column, location, selectedId, locked, refreshVersion, onSelect, onAccessLost, onReport, cache, showFirm }: Props & {
  column: Column;
  onReport: (report: ColumnReport) => void;
}) {
  const path = columnPath(location, column.status);
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${path}|${refreshVersion}|${attempt}`;
  const liveKey = useRef(requestKey);
  liveKey.current = requestKey;
  const [result, setResult] = useState<ColumnResult | undefined>(() => cache?.get(path));
  const current = result?.path === path ? result : cache?.get(path);
  const data = current?.data;
  const pending = current?.requestKey !== requestKey;
  const error = !pending ? current?.error : undefined;
  const initialLoading = !data && pending;
  const refreshing = !!data && pending;
  const latestData = useRef(data);
  latestData.current = data;
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<{ key: string; message: string }>();
  const moreRequest = useRef<AbortController | undefined>(undefined);
  const accessLost = useRef(onAccessLost);
  accessLost.current = onAccessLost;
  const scroll = useRef<HTMLDivElement>(null);
  const scrollAnchor = useRef<{ id: string; offset: number; top: number } | undefined>(undefined);
  const filtered = !!(location.query || location.region || location.category || location.firmId);
  const headingId = `firm-board-${column.status}-heading`;

  useLayoutEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
    scrollAnchor.current = undefined;
  }, [path]);

  useLayoutEffect(() => {
    const saved = scrollAnchor.current;
    const element = scroll.current;
    if (!saved || !element) return;
    scrollAnchor.current = undefined;
    const card = Array.from(element.querySelectorAll<HTMLElement>("[data-lead-id]")).find((item) => item.dataset.leadId === saved.id);
    if (card) element.scrollTop += card.getBoundingClientRect().top - element.getBoundingClientRect().top - saved.offset;
    else element.scrollTop = saved.top;
  }, [data]);

  useEffect(() => {
    const prepared = cache?.get(path);
    if (prepared?.requestKey === requestKey) {
      setResult(prepared);
      return () => {
        moreRequest.current?.abort();
        moreRequest.current = undefined;
      };
    }
    const controller = new AbortController();
    setLoadingMore(false);
    setMoreError(undefined);
    const previous = latestData.current;
    const boundary = previous?.items.at(-1);
    // Refresh the loaded window, with a small allowance for newly inserted rows.
    const previousPages = previous?.pages ?? 1;

    async function refresh() {
      const items: Lead[] = [];
      let nextCursor: string | null = null;
      let totalCount: number | undefined;
      let pages = 0;
      const cursors = new Set<string>();
      do {
        const pagePath: string = pages === 0 ? `${path}&count=true` : `${path}&before=${encodeURIComponent(nextCursor!)}`;
        const page: CasePage = await request<CasePage>(pagePath, { signal: controller.signal });
        if (controller.signal.aborted || liveKey.current !== requestKey) return;
        appendCases(items, page, column.status);
        if (pages === 0) totalCount = Number.isSafeInteger(page.totalCount) && page.totalCount! >= 0 ? page.totalCount : undefined;
        nextCursor = page.nextCursor;
        pages += 1;
        const last = items.at(-1);
        const comparison = last && boundary ? Date.parse(last.createdAt) - Date.parse(boundary.createdAt)
          || (last.id < boundary.id ? -1 : last.id > boundary.id ? 1 : 0) : 0;
        const reachedBoundary = !boundary || !!last && (location.sort === "oldest" ? comparison >= 0 : comparison <= 0);
        if (!nextCursor || (pages >= previousPages && reachedBoundary) || pages >= previousPages + 2 || cursors.has(nextCursor)) break;
        cursors.add(nextCursor);
      } while (nextCursor);

      if (controller.signal.aborted || liveKey.current !== requestKey) return;
      const element = scroll.current;
      if (previous && element) {
        const top = element.getBoundingClientRect().top;
        const card = Array.from(element.querySelectorAll<HTMLElement>("[data-lead-id]")).find((item) => item.getBoundingClientRect().bottom > top);
        if (card?.dataset.leadId) scrollAnchor.current = { id: card.dataset.leadId, offset: card.getBoundingClientRect().top - top, top: element.scrollTop };
      }
      const oldIds = new Set(previous?.items.map(({ id }) => id));
      setResult({ path, requestKey, data: { items, nextCursor, totalCount, pages,
        newIds: new Set(previous ? items.filter(({ id }) => !oldIds.has(id)).map(({ id }) => id) : []) } });
    }

    void refresh().catch((failure: unknown) => {
      if (controller.signal.aborted || liveKey.current !== requestKey) return;
      const lost = isAccessError(failure);
      setResult((previousResult) => ({ path, requestKey, error: messageFor(failure),
        data: !lost && previousResult?.path === path ? previousResult.data : undefined }));
      if (lost) accessLost.current();
    });
    return () => {
      controller.abort();
      moreRequest.current?.abort();
      moreRequest.current = undefined;
    };
  }, [path, requestKey, column.status, cache]);

  useEffect(() => {
    if (!result || !cache) return;
    cache.delete(result.path);
    cache.set(result.path, result.data ? { ...result, data: { ...result.data, newIds: new Set() } } : result);
    while (cache.size > 30) cache.delete(cache.keys().next().value!);
  }, [result, cache]);

  useEffect(() => {
    onReport({ status: column.status, path, items: data?.items ?? emptyItems, nextCursor: data?.nextCursor ?? null,
      totalCount: data?.totalCount, loading: pending, error: !!error, ready: !!data });
  }, [column.status, path, data, pending, error, onReport]);

  async function loadMore() {
    if (!data?.nextCursor || pending || locked || moreRequest.current) return;
    const controller = new AbortController();
    moreRequest.current = controller;
    setLoadingMore(true);
    setMoreError(undefined);
    try {
      const page = await request<CasePage>(`${path}&before=${encodeURIComponent(data.nextCursor)}`, { signal: controller.signal });
      if (controller.signal.aborted || liveKey.current !== requestKey) return;
      setResult((previous) => {
        if (previous?.path !== path || previous.requestKey !== requestKey || !previous.data) return previous;
        const items = [...previous.data.items];
        const oldIds = new Set(items.map(({ id }) => id));
        appendCases(items, page, column.status);
        return { path, requestKey, data: { ...previous.data, items, nextCursor: page.nextCursor, pages: previous.data.pages + 1,
          newIds: new Set(items.filter(({ id }) => !oldIds.has(id)).map(({ id }) => id)) } };
      });
    } catch (failure) {
      if (controller.signal.aborted || liveKey.current !== requestKey) return;
      if (isAccessError(failure)) {
        setResult({ path, requestKey, error: messageFor(failure) });
        accessLost.current();
      } else setMoreError({ key: requestKey, message: messageFor(failure) });
    } finally {
      if (moreRequest.current === controller) {
        moreRequest.current = undefined;
        setLoadingMore(false);
      }
    }
  }

  const countLabel = data?.totalCount !== undefined
    ? `${numberFormat.format(data.totalCount)} ${data.totalCount === 1 ? "case" : "cases"} ${pending || error ? "at last update" : "total"}`
    : initialLoading ? "Loading count" : "Count unavailable";
  return <section className="firm-case-column" id={`firm-board-${column.status}-column`} data-status={column.status}
    aria-labelledby={headingId} aria-busy={pending}>
    <header className="firm-case-column-heading">
      <h2 id={headingId}><span className={`firm-case-column-dot is-${column.status}`} aria-hidden="true" />{column.title}</h2>
      <span className={`firm-case-column-count${data?.totalCount === undefined ? " is-pending" : ""}`} aria-label={countLabel}>
        {data?.totalCount !== undefined ? numberFormat.format(data.totalCount) : initialLoading ? "…" : "-"}
      </span>
    </header>
    <div className="firm-case-column-scroll" ref={scroll}>
      {initialLoading ? <p className="firm-case-column-message" role="status">Loading cases…</p> : !data && error ? <div className="firm-case-column-error" role="alert">
        <p>{error}</p><button className="button small" type="button" disabled={locked} aria-label={`Retry ${column.title.toLowerCase()}`}
          onClick={() => setAttempt((value) => value + 1)}>Try again</button>
      </div> : data && <>
        <div className={`firm-case-column-update${refreshing || error ? " has-feedback" : ""}`} aria-live="polite">
          {refreshing ? <span>Updating…</span> : error ? <div className="firm-case-column-update-error">
            <p>{error} Showing the last loaded cases.</p>
            <button className="subtle-link" type="button" disabled={locked} aria-label={`Retry updating ${column.title.toLowerCase()}`}
              onClick={() => setAttempt((value) => value + 1)}>Try again</button>
          </div> : null}
        </div>
        <div className="firm-case-column-cards">
          {data.items.map((lead) => <button className={`firm-case-card${selectedId === lead.id ? " is-selected" : ""}${data.newIds.has(lead.id) ? " is-new" : ""}`}
            type="button" key={lead.id} data-lead-id={lead.id} data-record-id={lead.id} disabled={locked} aria-pressed={selectedId === lead.id}
            aria-label={`Open case for ${lead.name}: ${firmIssueExcerpt(lead.title || lead.description, 100)} ${lead.category}, ${lead.region}.${showFirm ? ` Firm: ${lead.firmName ?? "Unassigned"}.` : ""}`} onClick={() => onSelect(lead)}>
            <span className="firm-case-card-heading"><strong>{showFirm ? lead.title || `${lead.category} · ${lead.region}` : lead.name}</strong><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg></span>
            <span className="firm-case-card-issue">{showFirm ? lead.name : firmIssueExcerpt(lead.title || lead.description, 120)}</span>
            <span className="firm-case-card-context">{lead.category} · {lead.region}</span>
            {showFirm && <span className="firm-case-card-context">{lead.firmName ?? "Unassigned"}</span>}
            <time dateTime={lead.createdAt}>Submitted {dateFormat.format(new Date(lead.createdAt))}</time>
          </button>)}
        </div>
        {!data.items.length && <p className="firm-case-column-message">{filtered ? "No matching cases" : column.empty}</p>}
        {(data.items.length > 0 || data.nextCursor) && <div className="firm-case-column-pagination">
          <p>{numberFormat.format(data.items.length)}{data.totalCount !== undefined ? ` of ${numberFormat.format(data.totalCount)}` : ""} shown</p>
          {moreError?.key === requestKey && <p className="firm-case-column-more-error" role="alert">{moreError.message}</p>}
          {data.nextCursor && <button className="button small" type="button" disabled={locked || loadingMore || pending}
            aria-label={`${moreError?.key === requestKey ? "Retry loading more" : "Load more"} ${column.title.toLowerCase()}`} onClick={() => { void loadMore(); }}>
            {loadingMore ? "Loading…" : moreError?.key === requestKey ? "Try again" : "Load more"}
          </button>}
        </div>}
      </>}
    </div>
  </section>;
}

export function FirmCaseBoard(props: Props) {
  const [reports, setReports] = useState<Partial<Record<CaseStatus, ColumnReport>>>({});
  const [activeColumn, setActiveColumn] = useState<CaseStatus>("open");
  const [viewportWidth, setViewportWidth] = useState(0);
  const activeRef = useRef(activeColumn);
  activeRef.current = activeColumn;
  const viewport = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ records: props.onRecordsChange, summary: props.onSummaryChange });
  callbacks.current = { records: props.onRecordsChange, summary: props.onSummaryChange };
  const filterKey = columnPath(props.location, "open");
  const initialLane = useRef({ path: filterKey, chosen: false, settled: false });
  if (initialLane.current.path !== filterKey) initialLane.current = { path: filterKey, chosen: false, settled: false };
  const onReport = useCallback((report: ColumnReport) => {
    setReports((previous) => ({ ...previous, [report.status]: report }));
  }, []);
  const currentReports = columns.map((column) => {
    const report = reports[column.status];
    return report?.path === columnPath(props.location, column.status) ? report : undefined;
  });

  useEffect(() => {
    const current = columns.map((column) => {
      const report = reports[column.status];
      return report?.path === columnPath(props.location, column.status) ? report : undefined;
    });
    callbacks.current.records?.(columns.map((column, index) => ({ status: column.status,
      items: current[index]?.items ?? emptyItems, nextCursor: current[index]?.nextCursor ?? null })));
    const loading = current.some((report) => !report || report.loading);
    const error = current.some((report) => report?.error);
    const totalCount = current.every((report) => report?.totalCount !== undefined)
      ? current.reduce((sum, report) => sum + report!.totalCount!, 0) : undefined;
    callbacks.current.summary?.({ loading, error, totalCount, empty: !loading && !error && current.every((report) => report?.ready && !report.items.length && !report.nextCursor) });
  }, [reports, filterKey]);

  const jumpToColumn = useCallback((status: CaseStatus, smooth: boolean) => {
    const element = viewport.current;
    const column = element?.querySelector<HTMLElement>(`[data-status="${status}"]`);
    if (!element || !column) return;
    element.scrollTo({ left: element.scrollLeft + column.getBoundingClientRect().left - element.getBoundingClientRect().left,
      behavior: smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "instant" });
    setActiveColumn(status);
  }, []);

  useEffect(() => {
    const element = viewport.current;
    if (!element || !viewportWidth || element.scrollWidth <= element.clientWidth + 1
      || initialLane.current.chosen || initialLane.current.settled) return;
    const current = columns.map((column) => reports[column.status]);
    if (current.some((report, index) => !report || report.path !== columnPath(props.location, columns[index].status)
      || !report.ready || report.loading || report.error)) return;
    initialLane.current.settled = true;
    const active = current.find((report) => report?.status === activeRef.current);
    const firstWork = current.find((report) => report?.items.length);
    if (!active?.items.length && firstWork) jumpToColumn(firstWork.status, false);
  }, [reports, filterKey, viewportWidth, jumpToColumn]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    let width = element.clientWidth;
    setViewportWidth(width);
    const resize = new ResizeObserver(() => {
      if (element.clientWidth === width) return;
      width = element.clientWidth;
      jumpToColumn(activeRef.current, false);
      setViewportWidth(width);
    });
    resize.observe(element);
    return () => resize.disconnect();
  }, [jumpToColumn]);

  function onScroll() {
    const element = viewport.current;
    if (!element) return;
    const maximum = element.scrollWidth - element.clientWidth;
    if (maximum <= 1) return;
    if (element.scrollLeft <= 1) { setActiveColumn("open"); return; }
    if (element.scrollLeft >= maximum - 1) { setActiveColumn("closed"); return; }
    const left = element.getBoundingClientRect().left;
    const nearest = Array.from(element.querySelectorAll<HTMLElement>(".firm-case-column")).sort((a, b) =>
      Math.abs(a.getBoundingClientRect().left - left) - Math.abs(b.getBoundingClientRect().left - left))[0];
    if (nearest) setActiveColumn(nearest.dataset.status as CaseStatus);
  }

  return <section className="firm-case-board" aria-label="Cases by progress">
    <nav className="firm-case-board-jumps" aria-label="Jump to case column">
      {columns.map((column, index) => {
        const report = currentReports[index];
        const count = report?.totalCount;
        const countLabel = count === undefined ? "" : `, ${count} ${count === 1 ? "case" : "cases"}${report?.loading || report?.error ? " at last update" : ""}`;
        return <button type="button" key={column.status} disabled={props.locked}
        aria-current={activeColumn === column.status ? "true" : undefined} aria-controls={`firm-board-${column.status}-column`}
        aria-label={`Show ${column.title.toLowerCase()} column${countLabel}`}
        onClick={() => { initialLane.current.chosen = true; jumpToColumn(column.status, true); }}>
          <span>{column.title}</span><span aria-hidden="true">{count ?? (report?.error ? "-" : "…")}</span>
        </button>;
      })}
    </nav>
    <div className="firm-case-board-scroll" ref={viewport} onScroll={onScroll} tabIndex={0} role="group"
      onPointerDown={() => { initialLane.current.chosen = true; }} onWheel={() => { initialLane.current.chosen = true; }}
      onKeyDown={() => { initialLane.current.chosen = true; }} aria-label="Case columns. Scroll horizontally to see each status.">
      <div className="firm-case-board-columns">{columns.map((column) => <CaseColumn {...props} column={column} key={column.status} onReport={onReport} />)}</div>
    </div>
  </section>;
}
