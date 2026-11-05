"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

type Role = "plaintiff" | "attorney" | "paralegal" | "admin";
type Account = { id: string; name: string; email: string; role: Role; firmName: string | null };
type User = Omit<Account, "email"> & { firmId: string | null };
type Session = { user: User | null; accounts: Account[] };

const glyphs = {
  folio: "M7 3.5h7l4 4V20H7V3.5ZM14 3.5v4h4M4 7v15h11M10 12h5m-5 4h5",
  arrow: "M4 12h15m-6-6 6 6-6 6",
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

function Message({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div role={error ? "alert" : "status"} className={`workspace-message${error ? " workspace-error" : ""}`}>{children}</div>;
}

function roleName(user: Pick<User, "role" | "firmName">) {
  if (user.role === "plaintiff") return "Plaintiff portal";
  if (user.role === "admin") return "Platform admin";
  return user.firmName ?? "Firm workspace";
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
    const { user } = session;
    return (
      <main className="demo-entry">
        <section className="panel demo-entry-card" aria-labelledby="signed-in-heading">
          <Brand />
          <header className="page-heading">
            <h1 id="signed-in-heading">{roleName(user)}</h1>
            <p>Signed in as {user.name}.</p>
          </header>
          {sessionError && <Message error>{sessionError}</Message>}
          <button className="button" onClick={signOut} disabled={signing}>
            {signing ? "Signing out…" : "Sign out"}
          </button>
        </section>
      </main>
    );
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
