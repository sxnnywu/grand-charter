import { categories, regions } from "@/lib/intake-options";

export const leadViews = [["awaiting_firm_review", "Needs review"], ["accepted", "Accepted"], ["declined", "Declined"]] as const;
export const caseViews = [["all", "All cases"], ["open", "New cases"], ["in_progress", "In progress"], ["closed", "Closed"]] as const;
export type FirmView = "leads" | "cases";
export type FirmLayout = "list" | "board";
export type FirmFilter = typeof leadViews[number][0] | typeof caseViews[number][0];
export type FirmLocation = {
  view: FirmView;
  filter: FirmFilter;
  region: string;
  category: string;
  query: string;
  layout: FirmLayout;
  leadId?: string;
  caseId?: string;
};

export function emptyFirmLocation(view: FirmView): FirmLocation {
  return { view, filter: view === "leads" ? "awaiting_firm_review" : "all", region: "", category: "", query: "", layout: "list" };
}

export function hasFirmDestination(href = typeof window === "undefined" ? "http://localhost/" : window.location.href) {
  const params = new URL(href).searchParams;
  return ["view", "leadStatus", "caseStatus", "region", "category", "q", "lead", "case", "layout"].some((key) => params.has(key));
}

export function readFirmLocation(href = typeof window === "undefined" ? "http://localhost/" : window.location.href): FirmLocation {
  const params = new URL(href).searchParams;
  const view = params.get("view") === "cases" || (!params.has("view") && (params.has("case") || params.get("layout") === "board")) ? "cases" : "leads";
  const location = emptyFirmLocation(view);
  const filter = params.get(view === "leads" ? "leadStatus" : "caseStatus");
  const views = view === "leads" ? leadViews : caseViews;
  if (views.some(([value]) => value === filter)) location.filter = filter as FirmFilter;
  location.layout = params.get("layout") === "board" ? "board" : "list";
  if (view === "cases" && location.layout === "board") location.filter = "all";
  const region = params.get("region") ?? "";
  const category = params.get("category") ?? "";
  location.region = regions.includes(region) ? region : "";
  location.category = categories.includes(category) ? category : "";
  location.query = (params.get("q") ?? "").trim().slice(0, 120);
  location.leadId = params.get("lead") || undefined;
  location.caseId = location.leadId ? params.get("case") || undefined : undefined;
  return location;
}

export function firmUrl(location: FirmLocation) {
  const url = new URL(window.location.href);
  for (const name of ["view", "leadStatus", "caseStatus", "region", "category", "q", "lead", "case", "layout"]) url.searchParams.delete(name);
  url.searchParams.set("view", location.view);
  if (location.view === "cases") url.searchParams.set("layout", location.layout);
  if (location.filter !== emptyFirmLocation(location.view).filter) {
    url.searchParams.set(location.view === "leads" ? "leadStatus" : "caseStatus", location.filter);
  }
  if (location.region) url.searchParams.set("region", location.region);
  if (location.category) url.searchParams.set("category", location.category);
  if (location.query) url.searchParams.set("q", location.query);
  if (location.leadId) url.searchParams.set("lead", location.leadId);
  if (location.caseId && location.leadId) url.searchParams.set("case", location.caseId);
  return url;
}

export function firmListUrl(location: FirmLocation) {
  const params = new URLSearchParams();
  if (location.filter !== "all") params.set("status", location.filter);
  if (location.region) params.set("region", location.region);
  if (location.category) params.set("category", location.category);
  if (location.query) params.set("q", location.query);
  return `/api/${location.view}?${params}`;
}
