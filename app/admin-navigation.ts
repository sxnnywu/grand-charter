import { categories, regions } from "@/lib/intake-options";

export type AdminView = "attention" | "leads" | "cases";
export type AdminLocation = {
  view: AdminView;
  status: string;
  query: string;
  firmId: string;
  region: string;
  category: string;
  sort: "oldest" | "newest";
  leadId?: string;
  caseId?: string;
};

export const adminViews = [["attention", "Needs attention"], ["leads", "All leads"], ["cases", "Cases"]] as const;
export const adminStatuses = {
  attention: [["all", "All needing attention"], ["pending_assignment", "Needs a firm"], ["declined", "Declined by firm"]],
  leads: [["all", "All statuses"], ["pending_assignment", "Pending assignment"], ["awaiting_firm_review", "Awaiting firm review"], ["accepted", "Accepted"], ["declined", "Declined"], ["closed", "Closed"]],
  cases: [["all", "All statuses"], ["open", "New case"], ["in_progress", "In progress"], ["closed", "Closed"]],
} as const;

export function emptyAdminLocation(view: AdminView): AdminLocation {
  return { view, status: "all", query: "", firmId: "", region: "", category: "", sort: view === "attention" ? "oldest" : "newest" };
}

export function readAdminLocation(href = typeof window === "undefined" ? "http://localhost/" : window.location.href): AdminLocation {
  const params = new URL(href).searchParams;
  const view = params.get("view");
  const location = emptyAdminLocation(view === "attention" || view === "leads" || view === "cases" ? view
    : params.has("case") ? "cases" : params.has("lead") ? "leads" : "attention");
  const status = params.get("status") ?? params.get(location.view === "cases" ? "caseStatus" : "leadStatus");
  if (adminStatuses[location.view].some(([value]) => value === status)) location.status = status!;
  location.query = (params.get("q") ?? "").trim().slice(0, 120);
  location.firmId = params.get("firmId") ?? "";
  const region = params.get("region") ?? "";
  const category = params.get("category") ?? "";
  if (regions.includes(region)) location.region = region;
  if (categories.includes(category)) location.category = category;
  if (["oldest", "newest"].includes(params.get("sort") ?? "")) location.sort = params.get("sort") as AdminLocation["sort"];
  location.leadId = params.get("lead") || undefined;
  location.caseId = location.leadId ? params.get("case") || undefined : undefined;
  return location;
}

export function adminUrl(location: AdminLocation) {
  const url = new URL(window.location.href);
  for (const key of ["view", "status", "leadStatus", "caseStatus", "firmId", "region", "category", "q", "sort", "lead", "case", "layout"]) url.searchParams.delete(key);
  url.searchParams.set("view", location.view);
  if (location.status !== "all") url.searchParams.set("status", location.status);
  if (location.query) url.searchParams.set("q", location.query);
  if (location.firmId) url.searchParams.set("firmId", location.firmId);
  if (location.region) url.searchParams.set("region", location.region);
  if (location.category) url.searchParams.set("category", location.category);
  if (location.sort !== emptyAdminLocation(location.view).sort) url.searchParams.set("sort", location.sort);
  if (location.leadId) url.searchParams.set("lead", location.leadId);
  if (location.caseId && location.leadId) url.searchParams.set("case", location.caseId);
  return url;
}

export function adminListUrl(location: AdminLocation) {
  const params = new URLSearchParams({ count: "true", sort: location.sort });
  if (location.view === "attention") params.set("attention", "true");
  if (location.status !== "all") params.set("status", location.status);
  if (location.query) params.set("q", location.query);
  if (location.firmId) params.set("firmId", location.firmId);
  if (location.region) params.set("region", location.region);
  if (location.category) params.set("category", location.category);
  return `/api/${location.view === "cases" ? "cases" : "leads"}?${params}`;
}
