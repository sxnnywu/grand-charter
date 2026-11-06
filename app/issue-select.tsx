"use client";

import { useEffect, useRef, useState } from "react";
import { categories } from "@/lib/intake-options";
import "./issue-select.css";

const issueDetails: Record<string, { description: string; terms: string }> = {
  Employment: { description: "Work, pay, or dismissal", terms: "job employer employee fired termination unpaid wages overtime discrimination workplace" },
  Housing: { description: "Renting or a landlord", terms: "rent tenant tenancy deposit eviction apartment lease repairs" },
  "Personal injury": { description: "An accident or injury", terms: "hurt injured accident car collision slip fall medical damage" },
  "Contract dispute": { description: "A disagreement about an agreement", terms: "contract agreement business payment invoice contractor service refund" },
};

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
};

export function IssueSelect({ id, value, onChange, disabled, ...accessibility }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = categories.filter(category => terms.every(term =>
    `${category} ${issueDetails[category].description} ${issueDetails[category].terms}`.toLowerCase().includes(term)));
  const optionId = (category: string) => `${id}-option-${categories.indexOf(category)}`;

  function choose(category: string) {
    onChange(category);
    setOpen(false);
    setQuery("");
    input.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (!open) return;
    const option = list.current?.querySelector<HTMLElement>('[data-active="true"]');
    if (option && list.current) {
      const top = option.offsetTop - list.current.offsetTop;
      if (top < list.current.scrollTop) list.current.scrollTop = top;
      else if (top + option.offsetHeight > list.current.scrollTop + list.current.clientHeight) {
        list.current.scrollTop = top + option.offsetHeight - list.current.clientHeight;
      }
    }
  }, [open, active, query]);

  return <div className="issue-select" data-open={open || undefined} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setQuery(""); }
  }}>
    <input type="hidden" name="category" value={value} disabled={disabled} />
    <div className="issue-select-control">
      <input {...accessibility} id={id} ref={input} role="combobox" type="text" autoComplete="off"
        value={open ? query : value} placeholder="Search for a type of legal help" disabled={disabled}
        aria-expanded={open} aria-controls={`${id}-options`} aria-autocomplete="list" aria-required="true"
        aria-activedescendant={open && matches[active] ? optionId(matches[active]) : undefined}
        onFocus={() => { setQuery(""); setActive(Math.max(0, categories.indexOf(value))); setOpen(true); }}
        onClick={() => { if (!open) { setQuery(""); setActive(Math.max(0, categories.indexOf(value))); setOpen(true); } }}
        onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); }}
        onKeyDown={event => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActive(index => Math.max(0, Math.min(matches.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))));
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            if (matches[active]) choose(matches[active]);
          } else if (event.key === "Escape" && open) {
            event.preventDefault(); event.stopPropagation(); setOpen(false); setQuery("");
          } else if (event.key === "Home" && open) { event.preventDefault(); setActive(0); }
          else if (event.key === "End" && open) { event.preventDefault(); setActive(Math.max(0, matches.length - 1)); }
          else if (event.key === "Tab") { setOpen(false); setQuery(""); }
        }} />
      <button type="button" tabIndex={-1} aria-label="Show types of legal help" disabled={disabled}
        onPointerDown={event => event.preventDefault()} onClick={() => {
          input.current?.focus({ preventScroll: true }); setQuery(""); setOpen(!open);
        }}><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m6 9 6 6 6-6" /></svg></button>
    </div>
    <ul id={`${id}-options`} ref={list} className="issue-select-options" role="listbox" aria-label="Types of legal help"
      aria-hidden={!open} inert={!open}>
      {matches.map((category, index) => <li id={optionId(category)} key={category} role="option"
        aria-selected={value === category} data-active={active === index} onPointerMove={() => setActive(index)}
        onPointerDown={event => event.preventDefault()} onClick={() => choose(category)}>
        <div><strong>{category}</strong><span>{issueDetails[category].description}</span></div>
        {value === category && <span aria-hidden="true" className="issue-select-check">✓</span>}
      </li>)}
      {!matches.length && <li className="issue-select-empty" role="presentation">No types found. Try pay, rent, injury, or agreement.</li>}
    </ul>
    <span className="visually-hidden" role="status">{open ? `${matches.length} ${matches.length === 1 ? "type" : "types"} available.` : ""}</span>
  </div>;
}
