export const firms = [
  { id: "northline", name: "Northline Legal", initials: "NL" },
  { id: "harbour", name: "Harbour Law", initials: "HL" },
];

export const actors = [
  { id: "maya", role: "plaintiff", name: "Maya Patel" },
  { id: "northline-staff", role: "firm", name: "Alex Chen", firmId: "northline" },
  { id: "harbour-staff", role: "firm", name: "Sofia Martin", firmId: "harbour" },
  { id: "admin", role: "admin", name: "Morgan Ellis" },
  { id: "jordan", role: "plaintiff", name: "Jordan Lee" },
];

export const categories = ["Employment", "Housing", "Personal injury", "Contract dispute"];
export const regions = ["Ontario", "British Columbia", "Alberta", "Quebec"];

export const labels = {
  pending: "Pending assignment",
  review: "Awaiting firm review",
  accepted: "Accepted",
  declined: "Declined",
  open: "Open",
  progress: "In progress",
  closed: "Closed",
};

const routes = {
  "Ontario/Employment": "northline",
  "Ontario/Housing": "harbour",
};

const storageKey = "grand-charter-prototype-v1";
let memoryState;

function firmName(id) {
  return firms.find((firm) => firm.id === id)?.name ?? "Unassigned";
}

export function actorById(id) {
  return actors.find((actor) => actor.id === id);
}

function leadRecord(data) {
  return {
    caseId: null,
    caseStatus: null,
    files: [],
    notes: [],
    audit: [],
    notice: "",
    ...data,
  };
}

function seed() {
  const maya = { plaintiffId: "maya", name: "Maya Patel", email: "maya@example.com" };
  const jordan = { plaintiffId: "jordan", name: "Jordan Lee", email: "jordan@example.com" };
  return {
    nextLeadNumber: 1047,
    leads: [
      leadRecord({
        ...maya,
        id: "L-1042",
        category: "Employment",
        region: "Ontario",
        description: "I was let go from my job at a Toronto design studio after my role changed. I would like someone to review the separation letter and explain what happens next.",
        firmId: "northline",
        status: "accepted",
        createdAt: "2026-10-29T14:00:00.000Z",
        caseId: "C-1042",
        caseStatus: "progress",
        files: [
          { name: "Separation letter.pdf", url: "", size: 86420, at: "2026-10-29T14:00:00.000Z" },
          { name: "Initial review summary.pdf", url: "", size: 42506, firmId: "northline", at: "2026-11-02T17:05:00.000Z" },
        ],
        notes: [
          { text: "Review the separation letter and confirm the timeline with Maya before the next discussion.", author: "Alex Chen", firmId: "northline", at: "2026-11-02T17:15:00.000Z" },
        ],
        audit: [
          { title: "Case status changed", detail: "Open → In progress", actor: "Alex Chen", at: "2026-11-02T17:00:00.000Z" },
          { title: "Lead accepted", detail: "Case C-1042 created", actor: "Alex Chen", at: "2026-10-30T16:20:00.000Z" },
          { title: "Lead routed", detail: "Unassigned → Northline Legal", actor: "System", at: "2026-10-29T14:00:00.000Z" },
        ],
      }),
      leadRecord({
        ...maya,
        id: "L-1043",
        category: "Employment",
        region: "Ontario",
        description: "My employer changed my hours last month, and my latest pay statement is missing several shifts. I have copies of the schedule and pay statement and would like to know what my options are.",
        firmId: "northline",
        status: "review",
        createdAt: "2026-11-04T14:40:00.000Z",
        files: [
          { name: "October pay statement.pdf", url: "", size: 68912, at: "2026-11-04T14:40:00.000Z" },
        ],
        audit: [
          { title: "Lead routed", detail: "Unassigned → Northline Legal", actor: "System", at: "2026-11-04T14:40:00.000Z" },
        ],
      }),
      leadRecord({
        ...maya,
        id: "L-1044",
        category: "Employment",
        region: "Ontario",
        description: "I am considering a new employment agreement for a part-time position and would like help understanding its terms.",
        firmId: "northline",
        status: "declined",
        createdAt: "2026-11-02T16:00:00.000Z",
        audit: [
          { title: "Lead declined", detail: "Awaiting firm review → Declined", actor: "Alex Chen", at: "2026-11-03T14:25:00.000Z" },
          { title: "Lead routed", detail: "Unassigned → Northline Legal", actor: "System", at: "2026-11-02T16:00:00.000Z" },
        ],
      }),
      leadRecord({
        ...maya,
        id: "L-1045",
        category: "Contract dispute",
        region: "Ontario",
        description: "A contractor stopped work partway through a small home renovation in Toronto. I have the written agreement and invoices and would like help resolving the outstanding work.",
        firmId: null,
        status: "pending",
        createdAt: "2026-11-04T13:10:00.000Z",
      }),
      leadRecord({
        ...jordan,
        id: "L-1046",
        category: "Housing",
        region: "Ontario",
        description: "I received a notice about changes to the terms of my apartment lease. I would like to understand my options before I respond.",
        firmId: "harbour",
        status: "review",
        createdAt: "2026-11-03T15:35:00.000Z",
        audit: [
          { title: "Lead routed", detail: "Unassigned → Harbour Law", actor: "System", at: "2026-11-03T15:35:00.000Z" },
        ],
      }),
    ],
  };
}

function browserStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function getState() {
  let saved;
  try {
    saved = JSON.parse(browserStorage()?.getItem(storageKey) ?? "null");
  } catch {
    saved = null;
  }
  return Array.isArray(saved?.leads) && Number.isSafeInteger(saved.nextLeadNumber)
    ? saved
    : structuredClone(memoryState ?? seed());
}

function save(state) {
  try {
    browserStorage()?.setItem(storageKey, JSON.stringify(state));
  } catch (error) {
    if (error.name !== "SecurityError") {
      throw new Error("The browser could not save this change. If you attached a PDF, try a smaller file.");
    }
  }
  memoryState = state;
}

export function reset() {
  const state = seed();
  save(state);
  return structuredClone(state);
}

function canView(actor, lead) {
  if (!actor || !lead) return false;
  if (actor.role === "admin") return true;
  if (actor.role === "plaintiff") return actor.id === lead.plaintiffId;
  return actor.role === "firm" && actor.firmId === lead.firmId;
}

export function filesFor(actor, lead) {
  actor = actorById(actor?.id);
  if (!canView(actor, lead) || actor.role === "admin") return [];
  if (actor.role === "plaintiff") return lead.files;
  return lead.files.filter((file) => !file.firmId || file.firmId === actor.firmId);
}

export function notesFor(actor, lead) {
  actor = actorById(actor?.id);
  if (!canView(actor, lead) || actor.role === "plaintiff") return [];
  if (actor.role === "admin") return lead.notes;
  return lead.notes.filter((note) => note.firmId === actor.firmId);
}

function visibleLead(actor, lead) {
  return {
    ...lead,
    files: filesFor(actor, lead),
    notes: notesFor(actor, lead),
    audit: actor.role === "admin" ? lead.audit : [],
    notice: actor.role === "plaintiff" ? lead.notice : "",
    latestUpdateAt: actor.role === "plaintiff"
      ? lead.audit.find(({ title }) => [
        "Lead accepted", "Lead assigned", "Lead reassigned", "Lead closed", "Case reassigned", "Case status changed",
      ].includes(title))?.at
      : undefined,
  };
}

export function leadsFor(actor) {
  actor = actorById(actor?.id);
  return getState().leads
    .filter((lead) => canView(actor, lead))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((lead) => visibleLead(actor, lead));
}

export function getLead(actor, id) {
  actor = actorById(actor?.id);
  const lead = getState().leads.find((record) => record.id === id);
  return canView(actor, lead) ? visibleLead(actor, lead) : undefined;
}

function audit(lead, title, detail, actor, at) {
  lead.audit.unshift({ title, detail, actor, at });
}

function preparedFile(file, at, firmId) {
  const name = file?.name?.trim();
  if (!name || !name.toLowerCase().endsWith(".pdf")) throw new Error("Choose a PDF file.");
  const url = file.url ?? "";
  if (url && !url.startsWith("data:application/pdf;base64,")) throw new Error("Choose a PDF file.");
  return {
    name,
    url,
    size: file.size ?? 0,
    at,
    ...(firmId ? { firmId } : {}),
  };
}

export function submitLead(actor, details, file) {
  actor = actorById(actor?.id);
  if (actor?.role !== "plaintiff") throw new Error("Switch to a plaintiff to submit a request.");

  const { category, region } = details;
  const name = details.name?.trim();
  const email = details.email?.trim();
  const description = details.description?.trim();
  if (!name || !description) throw new Error("Enter your name and describe your request.");
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address.");
  if (!categories.includes(category) || !regions.includes(region)) throw new Error("Choose a category and region.");

  const state = getState();
  const at = new Date().toISOString();
  const firmId = routes[`${region}/${category}`] ?? null;
  const lead = leadRecord({
    id: `L-${state.nextLeadNumber++}`,
    plaintiffId: actor.id,
    name,
    email,
    category,
    region,
    description,
    firmId,
    status: firmId ? "review" : "pending",
    createdAt: at,
    files: file ? [preparedFile(file, at)] : [],
  });
  if (firmId) audit(lead, "Lead routed", `Unassigned → ${firmName(firmId)}`, "System", at);
  state.leads.push(lead);
  save(state);
  return visibleLead(actor, lead);
}

function changeLead(actor, id, change) {
  actor = actorById(actor?.id);
  const state = getState();
  const lead = state.leads.find((record) => record.id === id);
  if (!canView(actor, lead)) throw new Error("You no longer have access to this request.");
  change(lead, actor, new Date().toISOString());
  save(state);
  return visibleLead(actor, lead);
}

function requireFirmReview(lead, actor) {
  if (actor.role !== "firm" || lead.status !== "review") {
    throw new Error("Only the assigned firm can act on a request awaiting review.");
  }
}

export function acceptLead(actor, id) {
  return changeLead(actor, id, (lead, actor, at) => {
    requireFirmReview(lead, actor);
    lead.status = "accepted";
    lead.caseId = lead.id.replace("L-", "C-");
    lead.caseStatus = "open";
    audit(lead, "Lead accepted", `Case ${lead.caseId} created`, actor.name, at);
  });
}

export function declineLead(actor, id) {
  return changeLead(actor, id, (lead, actor, at) => {
    requireFirmReview(lead, actor);
    lead.status = "declined";
    audit(lead, "Lead declined", "Awaiting firm review → Declined", actor.name, at);
  });
}

export function assignLead(actor, id, firmId) {
  return changeLead(actor, id, (lead, actor, at) => {
    if (actor.role !== "admin" || lead.status === "closed") throw new Error("This request cannot be assigned.");
    if (!firms.some((firm) => firm.id === firmId)) throw new Error("Choose a firm.");
    if (lead.firmId === firmId && lead.status !== "declined") throw new Error("Choose a different firm.");

    const previousFirmId = lead.firmId;
    const wasDeclined = lead.status === "declined";
    const caseMoved = lead.status === "accepted";
    lead.firmId = firmId;
    if (!caseMoved) lead.status = "review";
    const title = caseMoved ? "Case reassigned" : previousFirmId ? "Lead reassigned" : "Lead assigned";
    const previousFirm = firmName(previousFirmId);
    const nextFirm = firmName(firmId);
    const assignment = `${previousFirm} → ${nextFirm}`;
    const detail = wasDeclined ? `${assignment} · Returned to firm review` : assignment;
    audit(lead, title, detail, actor.name, at);
    lead.notice = caseMoved
      ? `Your case has been transferred to ${nextFirm}. You can still view your documents and case progress here.`
      : `Your request has been sent to ${nextFirm} for review.`;
  });
}

export function closeLead(actor, id) {
  return changeLead(actor, id, (lead, actor, at) => {
    if (actor.role !== "admin" || lead.status !== "declined") throw new Error("Only an admin can close a declined request.");
    const previousFirm = firmName(lead.firmId);
    lead.status = "closed";
    lead.firmId = null;
    lead.notice = "Your request was closed without placement at a firm.";
    audit(lead, "Lead closed", `Declined → Closed · ${previousFirm} → Unassigned`, actor.name, at);
  });
}

export function advanceCase(actor, id) {
  return changeLead(actor, id, (lead, actor, at) => {
    const nextStatus = { open: "progress", progress: "closed" }[lead.caseStatus];
    if (actor.role !== "firm" || !nextStatus) throw new Error("This case status cannot be changed.");
    const previousStatus = lead.caseStatus;
    lead.caseStatus = nextStatus;
    audit(lead, "Case status changed", `${labels[previousStatus]} → ${labels[nextStatus]}`, actor.name, at);
  });
}

export function addNote(actor, id, text) {
  return changeLead(actor, id, (lead, actor, at) => {
    if (actor.role !== "firm" || !lead.caseId || lead.caseStatus === "closed") {
      throw new Error("Only the assigned firm can add notes to an active case.");
    }
    if (!text?.trim()) throw new Error("Enter a note.");
    lead.notes.unshift({ text: text.trim(), author: actor.name, firmId: actor.firmId, at });
  });
}

export function addFile(actor, id, file) {
  return changeLead(actor, id, (lead, actor, at) => {
    const canUpload = actor.role === "plaintiff" || (actor.role === "firm" && lead.caseId);
    if (!canUpload || lead.status === "closed" || lead.caseStatus === "closed") {
      throw new Error("You cannot add documents to this request.");
    }
    lead.files.push(preparedFile(file, at, actor.firmId));
  });
}
