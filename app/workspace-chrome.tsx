"use client";

import { useEffect, useRef } from "react";
import type { Account, User } from "./workspace";

const glyphs = {
  folio: "M7 3.5h7l4 4V20H7V3.5ZM14 3.5v4h4M4 7v15h11M10 12h5m-5 4h5",
  down: "m6 9 6 6 6-6",
  check: "m5 12 4 4L19 6",
} as const;

function Icon({ name, size = 18 }: { name: keyof typeof glyphs; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={glyphs[name]} /></svg>;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("");
}

export function Brand() {
  return <div className="brand"><span className="brand-mark"><Icon name="folio" size={23} /></span>Brief</div>;
}

const accountGroups: { title: string; roles: User["role"][] }[] = [
  { title: "Plaintiffs", roles: ["plaintiff"] },
  { title: "Firm staff", roles: ["attorney", "paralegal"] },
  { title: "Admin", roles: ["admin"] },
];

export function AccountSwitcher({ user, accounts, disabled, switching, onSwitch }: {
  user: User; accounts: Account[]; disabled: boolean; switching: boolean; onSwitch: (email: string) => void;
}) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      const menu = disclosure.current;
      if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  function closeAndFocus() {
    if (disclosure.current) disclosure.current.open = false;
    trigger.current?.focus();
  }

  return (
    <details className="account-switcher" ref={disclosure}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && event.currentTarget.open) {
          event.preventDefault();
          closeAndFocus();
        }
      }}>
      <summary className="button small account-trigger" ref={trigger} aria-disabled={disabled || undefined}
        aria-label={switching ? "Switching account" : `Switch account, currently ${user.name}`}
        onClick={(event) => { if (disabled) event.preventDefault(); }}>
        <span className="account-avatar" aria-hidden="true">{initials(user.name)}</span>
        <span>{switching ? "Switching…" : "Switch account"}</span>
        <Icon name="down" size={14} />
      </summary>
      <div className="account-menu" aria-label="Demo accounts">
        {accountGroups.map(({ title, roles }) => {
          const group = accounts.filter((account) => roles.includes(account.role));
          return group.length > 0 && <div className="account-group" key={title}>
            <h2>{title}</h2>
            {group.map((account) => {
              const current = account.id === user.id;
              return (
                <button className="account-option" type="button" key={account.id} aria-current={current || undefined}
                  disabled={disabled || current} onClick={() => { closeAndFocus(); onSwitch(account.email); }}>
                  <span className="account-avatar" aria-hidden="true">{initials(account.name)}</span>
                  <span className="account-option-copy">
                    <strong>{account.name}</strong>
                    {account.firmName && <small>{account.role === "paralegal" ? "Paralegal" : "Attorney"} · {account.firmName}</small>}
                  </span>
                  {current && <Icon name="check" size={16} />}
                </button>
              );
            })}
          </div>;
        })}
      </div>
    </details>
  );
}
