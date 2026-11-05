const firmTabs = [
  ["review", "Active"],
  ["accepted", "Accepted"],
  ["declined", "Declined"],
];

const adminTabs = [
  ["pending", "Unmatched"],
  ["declined", "Declined"],
  ["all", "All leads"],
];

const stages = [
  ["open", "Open"],
  ["progress", "In progress"],
  ["closed", "Closed"],
];

function action(ctx, id, label, { value = "", kind = "", glyph = "" } = {}) {
  const { escape: e, icon } = ctx;
  return `<button type="button" class="button ${kind}" data-action="${id}" data-value="${e(value)}">${glyph ? icon(glyph, 16) : ""}${label}</button>`;
}

function renderFilters(ctx, isAdmin, isCase) {
  const { escape: e, icon, category, region, query, categories, regions } = ctx;
  function select(key, label, values, current) {
    return `<label class="staff-filter">
      ${icon(key === "region" ? "map" : "filter", 15)}
      <select data-filter="${key}" aria-label="${label}">
        <option value="">${label}</option>
        ${values.map(value => `<option value="${e(value)}" ${current === value ? "selected" : ""}>${e(value)}</option>`).join("")}
      </select>
    </label>`;
  }
  if (isAdmin || isCase) {
    const label = isCase ? "Search cases" : "Search leads";
    return `<div class="staff-toolbar">
      <label class="staff-search">
        ${icon("search", 17)}
        <input type="search" aria-label="${label}" placeholder="${label} by name or ID" data-filter="query" value="${e(query)}">
      </label>
    </div>`;
  }
  return `<div class="staff-toolbar">
    ${select("category", "All categories", categories, category)}
    ${select("region", "All regions", regions, region)}
  </div>`;
}

function renderTabs(ctx, tabs) {
  const { counts = {}, filter } = ctx;
  return `<nav class="staff-tabs" aria-label="Lead views">
    ${tabs.map(([key, label]) => `<button type="button" data-action="filter" data-value="${key}" class="staff-tab ${key === filter ? "is-active" : ""}" aria-pressed="${key === filter}">
      ${label}<span class="tab-count">${counts[key] ?? (key === "all" ? ["pending", "review", "accepted", "declined", "closed"].reduce((sum, status) => sum + (counts[status] ?? 0), 0) : 0)}</span>
    </button>`).join("")}
  </nav>`;
}

function renderRows(ctx, isCase) {
  const { escape: e, icon, status, date, initials, leads, lead } = ctx;
  const singular = isCase ? "case" : "lead";
  return `<div class="staff-list-label">${leads.length} ${singular}${leads.length === 1 ? "" : "s"}</div>
    ${leads.length ? `<div class="staff-rows">${leads.map(item => {
      const active = item.id === lead?.id;
      return `<button type="button" class="staff-row ${active ? "is-selected" : ""}" data-action="select" data-value="${e(item.id)}" aria-pressed="${active}">
        <span class="staff-row-avatar">${e(initials(item.name))}</span>
        <span class="staff-row-body">
          <span class="staff-row-heading">${e(item.name)}</span>
          <span class="staff-row-meta">${e(item.category)} <span aria-hidden="true">·</span> ${e(item.region)}</span>
          <span class="staff-row-status">${status(isCase ? item.caseStatus : item.status)}</span>
        </span>
        <span class="staff-row-side"><time datetime="${e(item.createdAt)}">${e(date(item.createdAt))}</time>${icon("chevron-right", 15)}</span>
      </button>`;
    }).join("")}</div>` : `<div class="empty-state staff-empty">
      ${icon(isCase ? "folder" : "inbox", 23)}
      <h3>No ${singular}s found</h3>
      <p>${ctx.query || ctx.category || ctx.region ? "Try clearing your filters or using a different search." : "New records will appear here when they’re ready."}</p>
    </div>`}`;
}

function renderAudit(ctx) {
  const { escape: e, icon, lead } = ctx;
  const timestamp = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short" });
  return `<section class="detail-section">
    <div class="detail-section-heading"><h3>Audit history</h3><span class="detail-section-icon">${icon("activity", 18)}</span></div>
    ${lead.audit.length ? `<ol class="audit-list">${lead.audit.map(event => `<li class="audit-entry">
      <span class="audit-marker" aria-hidden="true"></span>
      <div class="audit-entry-body">
        <strong>${e(event.title)}</strong>
        <p>${e(event.detail)}</p>
        <small>${e(event.actor)} <span aria-hidden="true">·</span> <time datetime="${e(event.at)}">${e(timestamp.format(new Date(event.at)))}</time></small>
      </div>
    </li>`).join("")}</ol>` : '<p class="detail-copy">There are no recorded changes yet.</p>'}
  </section>`;
}

function renderNotes(ctx, isAdmin) {
  const { escape: e, icon, date, notes, firms, lead } = ctx;
  return `<section class="detail-section">
    <div class="detail-section-heading"><h3>${icon("lock", 16)} Firm notes</h3>
      ${!isAdmin && lead.caseStatus !== "closed" ? action(ctx, "add-note", "Add note", { glyph: "plus" }) : ""}
    </div>
    <p class="detail-copy">${isAdmin ? "Notes stay with the firm that wrote them." : "Visible to your firm and authorized admins."}</p>
    ${notes.length ? `<ul class="note-list">${notes.map(note => `<li class="note-entry">
      <div><strong>${e(note.author)}</strong><time datetime="${e(note.at)}">${e(date(note.at))}</time></div>
      ${isAdmin ? `<small>${e(firms.find(firm => firm.id === note.firmId)?.name ?? "Firm")}</small>` : ""}
      <p>${e(note.text)}</p>
    </li>`).join("")}</ul>` : '<p class="detail-empty">No firm notes yet.</p>'}
  </section>`;
}

function renderDocuments(ctx, isCase) {
  const { icon, fileList, upload, files, lead } = ctx;
  return `<section class="detail-section">
    <div class="detail-section-heading"><h3>${icon("file", 17)} ${isCase ? "Shared documents" : "Attachments"}</h3>
      ${isCase && lead.caseStatus !== "closed" ? upload("Upload PDF") : ""}
    </div>
    ${fileList(files)}
  </section>`;
}

function renderMeta(ctx, isAdmin) {
  const { escape: e, date, lead, firms } = ctx;
  const firmName = firms.find(firm => firm.id === lead.firmId)?.name;
  const values = [
    ["Category", lead.category],
    ["Region", lead.region],
    ["Submitted", date(lead.createdAt)],
    ...(isAdmin ? [["Assigned firm", firmName ?? "Unassigned"]] : []),
  ];
  return `<dl class="detail-meta">${values.map(([label, value]) => `<div><dt>${label}</dt><dd>${e(value)}</dd></div>`).join("")}</dl>`;
}

function renderOverview(ctx, isAdmin, isCase) {
  const { escape: e, icon, lead } = ctx;
  const stage = stages.findIndex(([key]) => key === lead.caseStatus);
  return `${renderMeta(ctx, isAdmin)}
    ${isCase ? `<section class="detail-section">
      <h3>Case progress</h3>
      <ol class="case-progress" aria-label="Case progress">${stages.map(([key, label], index) => `<li class="progress-step ${index < stage ? "is-complete" : index === stage ? "is-current" : ""}" ${index === stage ? 'aria-current="step"' : ""}>
        <span class="progress-marker">${index < stage ? icon("check", 13) : index + 1}</span><span>${label}</span>
      </li>`).join("")}</ol>
    </section>` : ""}
    <section class="detail-section">
      <h3>${isCase ? "Original request" : "Request summary"}</h3>
      <p class="detail-copy description">${e(lead.description)}</p>
    </section>`;
}

function renderDetail(ctx, isAdmin, isCase) {
  const { escape: e, icon, status, lead, caseTab } = ctx;
  if (!lead) {
    return `<section class="staff-detail empty-state detail-empty">
      ${icon(isCase ? "folder" : "inbox", 26)}
      <h3>Select a ${isCase ? "case" : "lead"}</h3>
      <p>Choose a record from the list to see its details.</p>
    </section>`;
  }

  let actions = "";
  if (isAdmin) {
    if (lead.status === "declined" && !isCase) {
      actions += action(ctx, "close-lead", "Close lead", { kind: "danger", value: lead.id });
    }
    if (isCase || ["pending", "review", "declined"].includes(lead.status)) {
      actions += action(ctx, "assign", lead.firmId ? "Reassign" : "Assign firm", { kind: "primary", glyph: lead.firmId ? "swap" : "building", value: lead.id });
    }
  } else if (isCase && lead.caseStatus !== "closed") {
    actions = action(ctx, "advance", lead.caseStatus === "open" ? "Start work" : "Close case", { kind: "primary", glyph: "check", value: lead.id });
  } else if (!isCase && lead.status === "review") {
    actions = action(ctx, "decline", "Decline", { kind: "danger", value: lead.id })
      + action(ctx, "accept", "Accept lead", { kind: "primary", glyph: "check", value: lead.id });
  }

  if (!isCase && lead.caseId) {
    actions += action(ctx, "open-case", "Open case", { kind: "primary", glyph: "arrow-right", value: lead.id });
  }
  const tabs = isAdmin ? [["overview", "Overview"], ["notes", "Firm notes"]] : [["overview", "Overview"], ["documents", "Documents"], ["notes", "Firm notes"]];
  const activeTab = tabs.some(([key]) => key === caseTab) ? caseTab : "overview";
  let body;
  if (isCase) {
    if (activeTab === "notes") {
      body = renderNotes(ctx, isAdmin);
    } else if (activeTab === "documents") {
      body = renderDocuments(ctx, true);
    } else {
      body = renderOverview(ctx, isAdmin, true) + (isAdmin ? renderAudit(ctx) : "");
    }
  } else {
    body = renderOverview(ctx, isAdmin, false) + (isAdmin ? renderAudit(ctx) : renderDocuments(ctx, false));
  }
  return `<section class="staff-detail" aria-label="${isCase ? "Case" : "Lead"} details">
    <header class="detail-header">
      <div class="detail-breadcrumb">${icon(isCase ? "folder" : "inbox", 14)} ${isCase ? "Case" : "Lead"} ${e(isCase ? lead.caseId : lead.id)}</div>
      <div class="detail-title"><h2>${e(lead.name)}</h2>${status(isCase ? lead.caseStatus : lead.status)}</div>
      <span class="detail-contact">${icon("mail", 14)} ${e(lead.email)}</span>
      ${actions ? `<div class="detail-actions">${actions}</div>` : ""}
    </header>
    ${isCase ? `<nav class="case-tabs" aria-label="Case details">${tabs.map(([key, label]) => `<button type="button" class="staff-tab ${activeTab === key ? "is-active" : ""}" data-action="case-tab" data-value="${key}" aria-pressed="${activeTab === key}">${label}</button>`).join("")}</nav>` : ""}
    <div class="detail-body">${body}</div>
  </section>`;
}

export function renderStaff(ctx) {
  const { actor, page } = ctx;
  const isAdmin = actor.role === "admin";
  const isCase = page === "cases";
  const title = isCase ? "Cases" : isAdmin ? "Assignment queue" : "Lead inbox";
  const subtitle = isCase
    ? isAdmin ? "Find a case, review its history, and manage its assignment." : "Track progress, exchange documents, and add private notes."
    : isAdmin ? "Resolve unmatched and declined leads, or find a record across firms." : "Review new requests and follow leads your firm has already handled.";

  return `<div class="workspace-heading">
    <div>
      <div class="heading-kicker">${isAdmin ? "Platform operations" : "Firm workspace"}</div>
      <h1>${title}</h1>
      <p class="workspace-subtitle">${subtitle}</p>
    </div>
  </div>
  ${isCase ? "" : renderTabs(ctx, isAdmin ? adminTabs : firmTabs)}
  <div class="staff-workspace">
    <section class="staff-list" aria-label="${isCase ? "Case list" : "Lead list"}">
      ${renderFilters(ctx, isAdmin, isCase)}
      ${renderRows(ctx, isCase)}
    </section>
    ${renderDetail(ctx, isAdmin, isCase)}
  </div>`;
}
