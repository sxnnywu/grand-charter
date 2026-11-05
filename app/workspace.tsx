"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { categories, regions } from "@/lib/intake-options";

type Role = "plaintiff" | "attorney" | "paralegal" | "admin";
type Account = { id: string; name: string; email: string; role: Role; firmName: string | null };
type User = Omit<Account, "email"> & { firmId: string | null };
type Session = { user: User | null; accounts: Account[] };
type LeadStatus = "pending_assignment" | "awaiting_firm_review" | "accepted" | "declined" | "closed";
type CaseStatus = "open" | "in_progress" | "closed";
type Lead = {
  id: string;
  name: string;
  email: string;
  category: string;
  region: string;
  description: string;
  status: LeadStatus;
  createdAt: string;
  caseId: string | null;
  firmName: string | null;
};

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
  return <div role={error ? "alert" : "status"} className={`workspace-message${error ? " workspace-error" : ""}`}>{children}</div>;
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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...options });
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    throw new Error(data?.error ?? "The workspace couldn’t finish that request. Try again.");
  }
  return data as T;
}

function post<T>(path: string, body: Record<string, string>) {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
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
  const [sessionError, setSessionError] = useState("");
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    request<Session>("/api/session", { signal: controller.signal })
      .then(setSession)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setSessionError(messageFor(error));
      });
    return () => controller.abort();
  }, [sessionAttempt]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setSessionError("");
    setSigning(true);
    try {
      const { user } = await post<Pick<Session, "user">>("/api/session", {
        email: String(fields.get("email")),
        password: "grand-charter-demo",
      });
      setSession((current) => current && { ...current, user });
    } catch (error) {
      setSessionError(messageFor(error));
    } finally {
      setSigning(false);
    }
  }

  async function signOut() {
    setSessionError("");
    setSigning(true);
    try {
      await request("/api/session", { method: "DELETE" });
      writeRecordUrl(undefined, undefined, true);
      setSession((current) => current && { ...current, user: null });
    } catch (error) {
      setSessionError(messageFor(error));
    } finally {
      setSigning(false);
    }
  }

  if (session?.user) {
    const email = session.accounts.find((account) => account.id === session.user?.id)?.email ?? "";
    return <Portal key={session.user.id} user={session.user} email={email} signOut={signOut}
      signingOut={signing} sessionError={sessionError} />;
  }

  return (
    <main className="demo-entry">
      <section className="panel demo-entry-card" aria-labelledby="demo-heading">
        <Brand />
        <header className="page-heading">
          <h1 id="demo-heading">Sign in to the demo</h1>
          <p>Choose a demo account to try the workspace.</p>
        </header>
        {sessionError && <Message error>{sessionError}</Message>}
        {session ? (
          <form className="form-stack" onSubmit={signIn}>
            <label className="field">Demo account
              <select name="email" required defaultValue="">
                <option value="" disabled>Choose an account</option>
                {session.accounts.map((account) => (
                  <option key={account.id} value={account.email}>{account.name} · {roleName(account)}</option>
                ))}
              </select>
            </label>
            <button className="button primary" disabled={signing || session.accounts.length === 0} type="submit">
              {signing ? "Signing in…" : "Sign in"} <Icon name="arrow" size={16} />
            </button>
          </form>
        ) : sessionError ? (
          <button className="button" onClick={() => { setSessionError(""); setSessionAttempt((attempt) => attempt + 1); }}>
            Try again
          </button>
        ) : <p className="muted" role="status">Loading demo accounts…</p>}
        <p className="demo-notice">Use fictional information in this demo.</p>
      </section>
    </main>
  );
}

function Portal({ user, email, signOut, signingOut, sessionError }: {
  user: User; email: string; signOut: () => void; signingOut: boolean; sessionError: string;
}) {
  const isPlaintiff = user.role === "plaintiff";
  const isAdmin = user.role === "admin";
  const home = isPlaintiff ? "My requests" : isAdmin ? "Lead queue" : "Lead inbox";
  const [composing, setComposing] = useState(false);
  const [leads, setLeads] = useState<Lead[]>();
  const [listError, setListError] = useState("");
  const [listAttempt, setListAttempt] = useState(0);
  const [notice, setNotice] = useState("");
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState("");
  const [filter, setFilter] = useState<LeadStatus | "all">(isAdmin ? "all" : "awaiting_firm_review");

  useEffect(() => {
    const controller = new AbortController();
    request<{ leads: Lead[] }>("/api/leads", { signal: controller.signal })
      .then(({ leads }) => setLeads(leads))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setListError(messageFor(error));
      });
    return () => controller.abort();
  }, [listAttempt]);

  function showIntake(show: boolean) {
    setComposing(show);
  }

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setActionError("");
    setActing(true);
    try {
      const input = Object.fromEntries(["name", "email", "region", "category", "description"]
        .map((name) => [name, String(form.get(name) ?? "")]));
      const { lead: created } = await post<{ lead: Lead }>("/api/leads", input);
      setLeads((current) => [created, ...(current ?? [])]);
      setComposing(false);
      setNotice("Your request was submitted.");
    } catch (error) {
      setActionError(messageFor(error));
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Workspace">
        <Brand />
        <div className="workspace-label">Workspace</div>
        <nav className="nav-list" aria-label="Main navigation">
          <button className="nav-item" aria-current={!composing ? "page" : undefined} onClick={() => showIntake(false)} disabled={acting}>
            <Icon name={isPlaintiff ? "requests" : "inbox"} />{home}
          </button>
          {isPlaintiff && (
            <button className="nav-item" aria-current={composing ? "page" : undefined} onClick={() => showIntake(true)} disabled={!leads || acting}>
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
          <button className="button small" onClick={signOut} disabled={signingOut || acting}>
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </header>
        <div className="content">
          {sessionError && <Message error>{sessionError}</Message>}
          {notice && <Message>{notice}</Message>}
          {composing ? (
            <Intake name={user.name} email={email} submit={submitLead} cancel={() => showIntake(false)}
              submitting={acting} error={actionError} />
          ) : (
            <div className={isPlaintiff ? "plaintiff-home" : undefined}>
              <header className="page-heading split-heading">
                <div><h1>{home}</h1><p>{isPlaintiff ? "Track your requests and open your cases." :
                  isAdmin ? "View leads and their current assignments across firms." : "Review new leads assigned to your firm."}</p></div>
                {isPlaintiff && <button className="button primary" onClick={() => showIntake(true)} disabled={!leads || acting}>
                  <Icon name="plus" size={16} />Submit a request
                </button>}
              </header>
              {listError ? <Message error>{listError}{" "}
                <button className="subtle-link" onClick={() => { setListError(""); setListAttempt((attempt) => attempt + 1); }}>Try again</button>
              </Message> : !leads ? <Message>Loading {isPlaintiff ? "requests" : "leads"}…</Message> :
                isPlaintiff ? (
                  <div className="bookshelf">
                    <section className="bookshelf-index request-list" aria-labelledby="requests-heading">
                      <div className="card-heading"><h2 id="requests-heading">All requests</h2></div>
                      {leads.length ? leads.map((item) => (
                        <article key={item.id} className="request-card">
                          <span className="request-icon"><Icon name="file" /></span>
                          <span className="request-copy">
                            <strong className="request-title">{requestTitle(item)}</strong>
                            <small>{item.category} · {dateFormat.format(new Date(item.createdAt))}</small>
                            <span className="request-meta"><Badge status={item.status}
                              label={item.status === "declined" ? "Awaiting admin review" : undefined} /></span>
                          </span>
                        </article>
                      )) : <p className="empty">You haven’t submitted a request yet.</p>}
                    </section>
                  </div>
                ) : (
                  <StaffList leads={leads} admin={isAdmin} filter={filter} changeFilter={setFilter} locked={acting} />
                )}
            </div>
          )}
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
      <header className="page-heading"><h1>Submit a request</h1><p>Tell us about your situation so we can match you with a firm.</p></header>
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

function StaffList({ leads, admin, filter, changeFilter, locked }: {
  leads: Lead[]; admin: boolean;
  filter: LeadStatus | "all"; changeFilter: (value: LeadStatus | "all") => void; locked: boolean;
}) {
  const tabs = admin ? [["all", "All leads"], ["pending_assignment", "Unmatched"]] as const :
    [["awaiting_firm_review", "Active"], ["accepted", "Accepted"]] as const;
  const filtered = leads.filter((lead) => filter === "all" || lead.status === filter);
  return (
    <>
      <nav className="staff-tabs" aria-label="Lead views">
        {tabs.map(([value, title]) => (
          <button key={value} className={`staff-tab${filter === value ? " is-active" : ""}`} aria-pressed={filter === value}
            disabled={locked} onClick={() => changeFilter(value)}>
            {title}<span className="tab-count">{value === "all" ? leads.length : leads.filter((item) => item.status === value).length}</span>
          </button>
        ))}
      </nav>
      <div className="staff-workspace">
        <section className="staff-list" aria-label="Leads">
          <div className="staff-list-label">{filtered.length} {filtered.length === 1 ? "lead" : "leads"}</div>
          {filtered.length ? <div className="staff-rows">
            {filtered.map((item) => (
              <article key={item.id} className="staff-row">
                <span className="staff-row-avatar" aria-hidden="true">{initials(item.name)}</span>
                <span className="staff-row-body">
                  <strong className="staff-row-heading">{item.name}</strong>
                  <span className="staff-row-meta">{item.category} · {item.region}</span>
                  <span className="staff-row-status"><Badge status={item.status} /></span>
                </span>
                <span className="staff-row-side"><time dateTime={item.createdAt}>{dateFormat.format(new Date(item.createdAt))}</time>
                  </span>
              </article>
            ))}
          </div> : <div className="empty-state staff-empty"><Icon name="inbox" size={23} /><h3>No leads here yet</h3></div>}
        </section>
      </div>
    </>
  );
}
