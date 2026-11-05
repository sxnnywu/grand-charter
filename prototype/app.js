import {
  actors, firms, categories, regions, labels, leadsFor, getLead, filesFor, notesFor,
  submitLead, acceptLead, declineLead, assignLead, closeLead, advanceCase, addNote, addFile, reset,
} from './state.js';
import { renderStaff } from './staff.js';
import { icon } from './icons.js';

const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const toast = document.querySelector('#toast');
const preferredActor = localStorage.getItem('grand-charter-actor');
const view = { actor: actors.find(item => item.id === preferredActor) ?? actors[0] };
const maxFileBytes = 750 * 1024;
let dialogSubmit;
let toastTimer;
let previewUrl;
let displayedFiles = [];

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const initials = name => name.split(/\s+/).slice(0, 2).map(part => part[0]).join('');
const date = value => new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
const firmName = id => firms.find(firm => firm.id === id)?.name ?? 'Unassigned';
const status = (key, label = labels[key]) => `<span class="badge status-${escape(key)}"><span class="status-dot"></span>${escape(label)}</span>`;
const option = (value, label = value) => `<option value="${escape(value)}">${escape(label)}</option>`;
const button = (action, label, style = 'secondary', symbol, value) =>
  `<button type="button" class="button ${style}" data-action="${action}" ${value ? `data-value="${escape(value)}"` : ''}>${symbol ? icon(symbol, 16) : ''}${label}</button>`;

function roleName(actor) {
  if (actor.role === 'firm') return firmName(actor.firmId);
  return actor.role === 'admin' ? 'Platform admin' : 'Plaintiff portal';
}

function resetView() {
  view.page = { plaintiff: 'requests', firm: 'inbox', admin: 'queue' }[view.actor.role];
  view.filter = view.actor.role === 'admin' ? 'pending' : 'review';
  view.selected = null;
  view.category = '';
  view.region = '';
  view.query = '';
  view.caseTab = 'overview';
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.innerHTML = `${icon('check-circle')}<span>${escape(message)}</span>`;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
}

function fileList(files) {
  displayedFiles = files;
  if (!files.length) return '<p class="muted">No documents have been shared yet.</p>';
  return `<ul class="file-list">${files.map((file, index) => `
    <li class="file-row">
      <span class="document-icon">${icon('file', 18)}</span>
      <span class="file-meta"><strong>${escape(file.name)}</strong><small>${file.firmId ? escape(firmName(file.firmId)) : 'Plaintiff'} · PDF${file.size ? ` · ${Math.max(1, Math.round(file.size / 1024))} KB` : ''}</small></span>
      ${button('view-file', 'View', 'ghost small', 'external', String(index))}
    </li>`).join('')}</ul>`;
}

function upload(label = 'Upload PDF') {
  return button('upload', escape(label), 'secondary small', 'upload');
}

function navigation() {
  return {
    plaintiff: [['requests', 'My requests', 'grid'], ['new', 'Submit a request', 'plus']],
    firm: [['inbox', 'Lead inbox', 'inbox'], ['cases', 'Cases', 'briefcase']],
    admin: [['queue', 'Lead queue', 'inbox'], ['cases', 'Cases', 'briefcase']],
  }[view.actor.role];
}

function shell(content) {
  const actor = view.actor;
  const nav = navigation();
  const current = nav.find(item => item[0] === view.page)?.[1] ?? 'Request details';
  return `<div class="shell">
    <aside class="sidebar" aria-label="Workspace">
      <button class="brand" type="button" data-action="home">
        <span class="brand-mark"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 19V5l8 4 8-4v14l-8 3-8-3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 9v13M8 11v5m8-5v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>
        <span class="brand-text">Grand Charter</span>
      </button>
      <div class="workspace-label">Workspace</div>
      <nav class="nav-list" aria-label="Main navigation">${nav.map(([page, label, symbol]) => `
        <button type="button" class="nav-item ${view.page === page || (page === 'requests' && view.page === 'detail') ? 'active' : ''}" data-action="page" data-value="${page}">${icon(symbol)}<span>${label}</span></button>`).join('')}
      </nav>
      <div class="sidebar-bottom">
        <div class="actor-card"><span class="avatar">${escape(initials(actor.name))}</span><div><strong>${escape(actor.name)}</strong><small>${escape(roleName(actor))}</small></div></div>
      </div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="breadcrumbs"><span>${escape(roleName(actor))}</span>${icon('chevron-right', 13)}<strong>${current}</strong></div>
        <div class="topbar-actions">
          <label class="demo-select"><span class="topbar-demo-label">Demo role</span>
            <select aria-label="Switch demo role" data-role-switch>${actors.map(item => {
              const label = item.role === 'plaintiff' ? `Plaintiff · ${item.name}` : roleName(item);
              return `<option value="${escape(item.id)}" ${item.id === actor.id ? 'selected' : ''}>${escape(label)}</option>`;
            }).join('')}</select>${icon('chevron-down', 14)}
          </label>
          <button type="button" class="icon-button" data-action="reset" title="Reset demo" aria-label="Reset demo">${icon('refresh', 17)}</button>
        </div>
      </header>
      <div class="content">${content}</div>
    </main>
  </div>`;
}

function plaintiffStatus(lead) {
  if (lead.status === 'declined') return status('pending', 'Awaiting admin review');
  if (lead.status === 'accepted') return status(lead.caseStatus);
  return status(lead.status);
}

function requestList(leads) {
  const firstName = escape(view.actor.name.split(' ')[0]);
  const stats = [
    ['folder', 'Total requests', leads.length],
    ['clock', 'Awaiting review', leads.filter(lead => ['pending', 'review', 'declined'].includes(lead.status)).length],
    ['briefcase', 'Open cases', leads.filter(lead => lead.caseId && lead.caseStatus !== 'closed').length],
  ];
  return `<section class="page-heading split-heading">
    <div><p class="eyebrow">Plaintiff portal</p><h1>My requests</h1><p>Track your requests, see case progress, and share documents with your firm.</p></div>
    ${button('page', 'Submit a request', 'primary', 'plus', 'new')}
  </section>
  <div class="hero-card">
    <div class="hero-copy"><p class="eyebrow">Your workspace</p><h2>Welcome, ${firstName}.</h2><p>Find your requests and case updates here whenever you need them.</p></div>
    <div class="hero-art" aria-hidden="true"><svg viewBox="0 0 250 140" fill="none"><circle cx="185" cy="65" r="89" stroke="currentColor"/><circle cx="185" cy="65" r="69" stroke="currentColor"/><circle cx="185" cy="65" r="49" stroke="currentColor"/><path d="M44 111h139M75 94h109M102 77h82" stroke="currentColor" stroke-linecap="round"/><rect x="121" y="23" width="53" height="66" rx="8" fill="#f8f8ff" stroke="#8c8fbd"/><path d="M133 42h26m-26 11h29m-29 11h19" stroke="#8c8fbd" stroke-linecap="round"/><circle cx="177" cy="77" r="13" fill="#555895"/><path d="m172 77 3 3 6-6" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
  </div>
  <div class="summary-grid">${stats.map(([symbol, label, value]) => `<div class="summary-card"><span class="metric-icon">${icon(symbol)}</span><div><strong class="metric-value">${value}</strong><div class="muted">${label}</div></div></div>`).join('')}</div>
  <div class="plaintiff-grid">
    <section class="panel request-list">
      <div class="card-heading"><div><h2>Your requests</h2><p>Open a request to see its details and documents.</p></div></div>
      ${leads.length ? leads.map(lead => `<button class="request-card" type="button" data-action="open-request" data-value="${escape(lead.id)}"><span class="request-icon">${icon('file')}</span><span class="request-copy"><strong>${escape(lead.category)}</strong><small>${escape(lead.id)} · Submitted ${date(lead.createdAt)}</small></span><span class="request-meta">${plaintiffStatus(lead)}${icon('chevron-right', 16)}</span></button>`).join('') : '<p class="empty">You haven’t submitted a request yet.</p>'}
    </section>
    <aside class="panel demo-guide">
      <div class="card-heading"><div><h2>What happens next</h2><p>From request to case</p></div></div>
      <ol class="step-list">
        <li class="guide-step"><span>1</span><div><strong>Tell us about your situation</strong><p>Share a few details and any relevant PDFs.</p></div></li>
        <li class="guide-step"><span>2</span><div><strong>A firm reviews your request</strong><p>If we can’t match it, an admin will review it.</p></div></li>
        <li class="guide-step"><span>3</span><div><strong>Follow your case</strong><p>If a firm accepts, you’ll see case updates and shared documents here.</p></div></li>
      </ol>
    </aside>
  </div>`;
}

function newRequest() {
  return `<button class="subtle-link" type="button" data-action="page" data-value="requests">${icon('arrow-left', 16)} My requests</button>
  <section class="page-heading"><p class="eyebrow">Plaintiff portal</p><h1>Submit a request</h1><p>Tell us about your situation so we can match your request with a firm.</p></section>
  <div class="plaintiff-grid">
    <form class="panel detail-card form-stack" id="intake">
      <div class="card-heading"><div><h2>Request details</h2><p>All fields are required except the PDF.</p></div></div>
      <div class="form-grid">
        <label class="field">Full name<input name="name" autocomplete="name" value="${escape(view.actor.name)}" required maxlength="100"></label>
        <label class="field">Email address<input type="email" name="email" autocomplete="email" value="${escape(view.actor.email ?? '')}" required maxlength="180"></label>
        <label class="field">Region<select name="region" required>${option('', 'Select a region')}${regions.map(item => option(item)).join('')}</select></label>
        <label class="field">Category<select name="category" required>${option('', 'Select a category')}${categories.map(item => option(item)).join('')}</select></label>
      </div>
      <label class="field">What happened?<textarea name="description" rows="5" required maxlength="2500" placeholder="Briefly describe what happened and what you need help with."></textarea></label>
      <label class="field">Supporting PDF <span class="form-hint">Optional · Up to 750 KB in this demo</span><input type="file" name="file" accept=".pdf,application/pdf"></label>
      <p class="form-error" role="alert" hidden></p>
      <div class="detail-actions">${button('page', 'Cancel', 'secondary', undefined, 'requests')}<button class="button primary" type="submit">Submit request ${icon('arrow-right', 16)}</button></div>
    </form>
    <aside class="panel demo-guide"><div class="card-heading"><div><h2>Before you submit</h2><p>Include what happened, where it happened, and what help you’re looking for.</p></div></div><div class="notice">${icon('info')}<span>This is a local prototype. Use fictional information and sample PDFs.</span></div></aside>
  </div>`;
}

function requestDetail(lead) {
  if (!lead) return '<p class="empty">This request is unavailable.</p>';
  const documents = filesFor(view.actor, lead);
  const progress = [['open', 'Case opened'], ['progress', 'In progress'], ['closed', 'Closed']];
  const current = progress.findIndex(([key]) => key === lead.caseStatus);
  return `<button class="subtle-link" type="button" data-action="page" data-value="requests">${icon('arrow-left', 16)} My requests</button>
  <section class="page-heading split-heading"><div><p class="eyebrow">Request ${escape(lead.id)}${lead.caseId ? ` · Case ${escape(lead.caseId)}` : ''}</p><h1>${escape(lead.category)}</h1><p>Submitted ${date(lead.createdAt)} · ${escape(lead.region)}</p></div>${plaintiffStatus(lead)}</section>
  ${lead.notice ? `<div class="notice" role="status">${icon('info')}<span>${escape(lead.notice)}</span></div>` : ''}
  <div class="plaintiff-grid detail-layout">
    <div class="stack">
      <section class="panel detail-card"><div class="card-heading"><div><h2>Request details</h2><p>${lead.firmId ? escape(firmName(lead.firmId)) : 'Awaiting assignment or admin review'}</p></div></div><p class="detail-copy">${escape(lead.description)}</p></section>
      <section class="panel detail-card"><div class="card-heading"><div><h2>Documents</h2><p>PDFs shared with your case or request.</p></div>${lead.status !== 'closed' && lead.caseStatus !== 'closed' ? upload() : ''}</div>${fileList(documents)}</section>
    </div>
    <aside class="panel demo-guide">
      <div class="card-heading"><div><h2>Progress</h2><p>${lead.caseId ? 'Updates from your assigned firm' : 'Current request status'}</p></div></div>
      ${lead.caseId ? `<ol class="timeline">${progress.map(([key, label], index) => `<li class="timeline-item ${index <= current ? 'active' : ''}">${icon(index < current ? 'check-circle' : 'circle', 17)}<span>${label}</span>${key === lead.caseStatus ? '<small>Current</small>' : ''}</li>`).join('')}</ol>` : `<div class="notice">${icon('clock')}<span>${lead.status === 'closed' ? 'Your request is closed.' : lead.status === 'review' ? 'Your request is with a firm for review.' : 'Your request is waiting for an admin to review it.'}</span></div>`}
    </aside>
  </div>`;
}

function staffContent(all) {
  const counts = { all: all.length, cases: all.filter(lead => lead.caseId).length };
  for (const lead of all) {
    counts[lead.status] = (counts[lead.status] ?? 0) + 1;
    if (lead.caseStatus) counts[lead.caseStatus] = (counts[lead.caseStatus] ?? 0) + 1;
  }

  const term = view.query.trim().toLowerCase();
  const leads = all.filter(lead => {
    if (view.page === 'cases') {
      if (!lead.caseId) return false;
    } else if (view.filter !== 'all' && lead.status !== view.filter) {
      return false;
    }
    if (view.category && lead.category !== view.category) return false;
    if (view.region && lead.region !== view.region) return false;
    return !term || [lead.id, lead.caseId, lead.name, lead.category, firmName(lead.firmId)]
      .some(value => String(value ?? '').toLowerCase().includes(term));
  });
  const lead = leads.find(item => item.id === view.selected) ?? leads[0];
  view.selected = lead?.id ?? null;
  return renderStaff({
    ...view, leads, lead, firms, categories, regions, labels, counts,
    files: lead ? filesFor(view.actor, lead) : [],
    notes: lead ? notesFor(view.actor, lead) : [],
    escape, icon, status, date, fileList, upload, initials,
  });
}

function render() {
  displayedFiles = [];
  const leads = leadsFor(view.actor).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const content = view.actor.role === 'plaintiff'
    ? view.page === 'new' ? newRequest() : view.page === 'detail' ? requestDetail(getLead(view.actor, view.selected)) : requestList(leads)
    : staffContent(leads);
  app.innerHTML = shell(content);
}

function openDialog({ title, copy = '', body = '', label, danger = false, submit }) {
  dialogSubmit = submit;
  dialog.innerHTML = `<form id="dialog-form">
    <div class="dialog-head"><div><h2 id="dialog-title">${escape(title)}</h2>${copy ? `<p>${escape(copy)}</p>` : ''}</div>
      <button class="icon-button dialog-close" type="button" data-action="dismiss" aria-label="Close dialog">${icon('close')}</button>
    </div>
    <div class="dialog-body">${body}<p class="form-error" role="alert" hidden></p></div>
    <div class="dialog-footer">${button('dismiss', label ? 'Cancel' : 'Done')}${label ? `<button type="submit" class="button ${danger ? 'danger' : 'primary'}">${escape(label)}</button>` : ''}</div>
  </form>`;
  dialog.showModal();
}

async function readPdf(file) {
  if (!file?.size) return undefined;
  if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf')) throw new Error('Choose a PDF file.');
  if (file.size > maxFileBytes) throw new Error('Choose a PDF under 750 KB.');
  const header = await file.slice(0, 5).text();
  if (header !== '%PDF-') throw new Error('This file could not be read as a PDF.');
  const url = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('The PDF could not be read.'));
    reader.readAsDataURL(new Blob([file], { type: 'application/pdf' }));
  });
  return { name: file.name, size: file.size, url };
}

function done(message) {
  render();
  showToast(message);
}

function currentLead() {
  return getLead(view.actor, view.selected);
}

function route(page) {
  view.page = page;
  view.selected = null;
  view.category = '';
  view.region = '';
  view.query = '';
  view.caseTab = 'overview';
  if (page === 'inbox') view.filter = 'review';
  if (page === 'queue') view.filter = 'pending';
  render();
  window.scrollTo(0, 0);
}

async function previewFile(index) {
  const file = displayedFiles[index];
  if (!file) return;
  let body = `<div class="notice">${icon('file')}<span>Sample document for the prototype. Upload a PDF to try the document viewer.</span></div>`;
  if (file.url) {
    const response = await fetch(file.url);
    previewUrl = URL.createObjectURL(await response.blob());
    body = `<iframe class="pdf-preview" title="${escape(file.name)}" src="${escape(previewUrl)}"></iframe>`;
  }
  openDialog({ title: file.name, body });
}

async function handleAction(action, value) {
  const actor = view.actor;
  const lead = currentLead();
  switch (action) {
    case 'home': route(navigation()[0][0]); break;
    case 'page': route(value); break;
    case 'filter':
      view.filter = value;
      view.selected = null;
      view.caseTab = 'overview';
      render();
      break;
    case 'select':
      view.selected = value;
      view.caseTab = 'overview';
      render();
      break;
    case 'open-request':
      view.page = 'detail';
      view.selected = value;
      render();
      window.scrollTo(0, 0);
      break;
    case 'open-case':
      view.page = 'cases';
      view.selected = value || view.selected;
      view.category = '';
      view.region = '';
      view.query = '';
      view.caseTab = 'overview';
      render();
      break;
    case 'case-tab': view.caseTab = value; render(); break;
    case 'dismiss': dialog.close(); break;
    case 'view-file': await previewFile(Number(value)); break;
    case 'reset':
      openDialog({
        title: 'Reset the demo?', copy: 'Restore sample records and clear changes made in this browser.',
        label: 'Reset demo', danger: true,
        submit: () => { reset(); resetView(); done('Demo reset.'); },
      });
      break;
    case 'accept':
      openDialog({
        title: 'Accept this lead?', copy: 'Accepting opens a case and moves the lead to your Accepted inbox.',
        label: 'Accept lead',
        submit: () => { acceptLead(actor, lead.id); view.filter = 'accepted'; done('Lead accepted. The case is ready to open.'); },
      });
      break;
    case 'decline':
      openDialog({
        title: 'Decline this lead?', copy: 'The lead will leave your active inbox and go to an admin for review.',
        label: 'Decline lead', danger: true,
        submit: () => { declineLead(actor, lead.id); view.filter = 'declined'; done('Lead declined and sent to admin review.'); },
      });
      break;
    case 'assign': {
      const isCase = lead.status === 'accepted';
      const isAssigned = Boolean(lead.firmId);
      const candidates = firms.filter(firm => firm.id !== lead.firmId || lead.status === 'declined');
      const verb = isAssigned ? 'Reassign' : 'Assign';
      openDialog({
        title: `${verb} ${isCase ? 'case' : 'lead'}`,
        copy: isCase
          ? `The new firm receives the case, linked lead, and plaintiff PDFs. ${firmName(lead.firmId)} loses access and keeps ownership of its private notes.`
          : 'The lead will appear in the receiving firm’s active inbox.',
        body: `<label class="field">Receiving firm<select name="firmId" required>${option('', 'Choose a firm')}${candidates.map(firm => option(firm.id, firm.name)).join('')}</select></label>`,
        label: verb,
        submit: data => {
          assignLead(actor, lead.id, data.get('firmId'));
          if (view.page === 'queue') view.filter = 'all';
          done(`${isCase ? 'Case' : 'Lead'} ${isAssigned ? 'reassigned' : 'assigned'}.`);
        },
      });
      break;
    }
    case 'close-lead':
      openDialog({
        title: 'Close this lead?', copy: 'The firm assignment ends, and the plaintiff will see a notice when they return.',
        label: 'Close lead', danger: true,
        submit: () => { closeLead(actor, lead.id); view.filter = 'all'; done('Lead closed. An in-app notice was added.'); },
      });
      break;
    case 'advance': {
      const closing = lead.caseStatus === 'progress';
      openDialog({
        title: closing ? 'Close this case?' : 'Start working on this case?',
        copy: 'The updated status will be visible to the plaintiff.',
        label: closing ? 'Close case' : 'Mark in progress',
        submit: () => { advanceCase(actor, lead.id); done('Case status updated.'); },
      });
      break;
    }
    case 'add-note':
      openDialog({
        title: 'Add a private note', copy: 'Visible to your firm and authorized admins.',
        body: '<label class="field">Note<textarea name="note" rows="5" required maxlength="1600"></textarea></label>',
        label: 'Add note',
        submit: data => { addNote(actor, lead.id, String(data.get('note')).trim()); done('Private note added.'); },
      });
      break;
    case 'upload':
      openDialog({
        title: 'Upload a PDF',
        copy: actor.role === 'firm' ? 'This PDF will be shared with the plaintiff.' : 'This PDF will be visible to the assigned firm.',
        body: '<label class="field">PDF file <span class="form-hint">Up to 750 KB in this demo</span><input type="file" name="file" accept=".pdf,application/pdf" required></label>',
        label: 'Upload PDF',
        submit: async data => {
          const file = await readPdf(data.get('file'));
          if (!file) throw new Error('Choose a PDF to upload.');
          addFile(actor, lead.id, file);
          done('PDF uploaded.');
        },
      });
      break;
  }
}

document.addEventListener('click', async event => {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  try {
    await handleAction(control.dataset.action, control.dataset.value);
  } catch (error) {
    openDialog({ title: 'Action unavailable', copy: error.message });
  }
});

document.addEventListener('change', event => {
  const target = event.target;
  if (target.matches('[data-role-switch]')) {
    view.actor = actors.find(actor => actor.id === target.value) ?? actors[0];
    localStorage.setItem('grand-charter-actor', view.actor.id);
    resetView();
    render();
    window.scrollTo(0, 0);
  } else if (target.matches('select[data-filter]')) {
    view[target.dataset.filter] = target.value;
    view.selected = null;
    render();
  }
});

document.addEventListener('input', event => {
  const target = event.target;
  if (!target.matches('input[data-filter="query"]')) return;
  view.query = target.value;
  const cursor = target.selectionStart;
  render();
  const updated = app.querySelector('input[data-filter="query"]');
  updated?.focus();
  if (cursor !== null) updated?.setSelectionRange(cursor, cursor);
});

document.addEventListener('submit', async event => {
  const form = event.target;
  if (!['dialog-form', 'intake'].includes(form.id)) return;
  event.preventDefault();
  const submit = form.querySelector('button[type="submit"]');
  const errorMessage = form.querySelector('.form-error');
  submit.disabled = true;
  errorMessage.hidden = true;

  try {
    const data = new FormData(form);
    if (form.id === 'dialog-form') {
      await dialogSubmit?.(data);
      dialog.close();
    } else {
      const fields = Object.fromEntries(data);
      const lead = submitLead(view.actor, fields, await readPdf(data.get('file')));
      view.page = 'detail';
      view.selected = lead.id;
      done('Your request was submitted.');
      window.scrollTo(0, 0);
    }
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
  } finally {
    submit.disabled = false;
  }
});

dialog.addEventListener('close', () => {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = undefined;
  dialogSubmit = undefined;
});

resetView();
render();
