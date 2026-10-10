"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { browserSupabase } from "@/lib/supabase/browser";
import { Icon } from "./icons";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Path prefixes that also count as this item. */
  also?: string[];
}

export interface SpendLine {
  label: string;
  value: string;
}

const COLLAPSE_KEY = "looot-sidebar-collapsed";
const THEME_KEY = "looot-theme";
const REPO = "https://github.com/loootai/looot-watchlist";

function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage is blocked, the choice lasts until reload */
  }
}

/** Fixed left sidebar on desktop, a drawer behind a menu button on phones and tablets. */
export function AppShell({ items, spend, groups, children }: { items: NavItem[]; spend: SpendLine[] | null; groups?: Record<string, string>; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const drawer = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setCollapsed(readStore(COLLAPSE_KEY) === "1");
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);

  useEffect(() => setOpen(false), [path]);

  const close = useCallback(() => {
    setOpen(false);
    menuButton.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const root = drawer.current;
    const focusable = () => Array.from(root?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []).filter((el) => el.offsetParent !== null);
    (root?.querySelector<HTMLElement>(".side-close") ?? focusable()[0])?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") return close();
      if (e.key !== "Tab") return;
      const list = focusable();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (path.startsWith("/login")) return <main className="plain-main">{children}</main>;

  const isOn = (it: NavItem) => (it.href === "/" ? path === "/" : [it.href, ...(it.also ?? [])].some((p) => path === p || path.startsWith(`${p}/`)));

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    writeStore(COLLAPSE_KEY, next ? "1" : "0");
  }

  function toggleTheme() {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    writeStore(THEME_KEY, next);
    setDark(!dark);
  }

  async function signOut() {
    await browserSupabase().auth.signOut();
    router.replace("/login");
  }

  let lastGroup = "";
  return (
    <div className={`shell${collapsed ? " collapsed" : ""}${open ? " drawer-open" : ""}`}>
      <a href="#main" className="skip">Skip to content</a>
      <header className="topbar">
        <button ref={menuButton} type="button" className="icon-btn" aria-label="Open navigation" aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen(true)}>
          <Icon name="menu" />
        </button>
        <img src="/brand/looot-mark.svg" alt="" width={24} height={24} />
        <strong>looot watchlist</strong>
      </header>
      {open && <div className="scrim" onClick={close} aria-hidden="true" />}
      <aside id="sidebar" ref={drawer} className="sidebar" aria-label="Sidebar" {...(open ? { role: "dialog", "aria-modal": true } : {})}>
        <div className="side-head">
          <Link href="/" className="brand" aria-label="looot watchlist, go to signals">
            <img src="/brand/looot-mark.svg" alt="" width={28} height={28} />
            <span className="label">looot watchlist</span>
          </Link>
          <button type="button" className="icon-btn side-close" aria-label="Close navigation" onClick={close}><Icon name="close" /></button>
        </div>
        <nav aria-label="Main" className="side-nav">
          {items.map((it) => {
            const heading = groups?.[it.href];
            const showHeading = heading && heading !== lastGroup;
            if (heading) lastGroup = heading;
            return (
              <div key={it.href} className="nav-entry">
                {showHeading && <p className="nav-heading label">{heading}</p>}
                <Link href={it.href} className={isOn(it) ? "nav-link on" : "nav-link"} aria-current={isOn(it) ? "page" : undefined} title={it.label}>
                  <Icon name={it.icon} />
                  <span className="label">{it.label}</span>
                </Link>
              </div>
            );
          })}
        </nav>
        <div className="side-foot">
          {spend && (
            <section className="spend label" aria-label="Spend">
              <p className="nav-heading">Spend</p>
              {spend.map((s) => (
                <p key={s.label} className="spend-line"><span>{s.label}</span><strong>{s.value}</strong></p>
              ))}
            </section>
          )}
          <div className="foot-links">
            <a className="nav-link" href={`${REPO}#readme`} target="_blank" rel="noreferrer noopener" title="Docs"><Icon name="docs" /><span className="label">Docs</span></a>
            <a className="nav-link" href={REPO} target="_blank" rel="noreferrer noopener" title="GitHub"><Icon name="github" /><span className="label">GitHub</span></a>
            <button type="button" className="nav-link" onClick={toggleTheme} title="Switch theme" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}><Icon name={dark ? "sun" : "moon"} /><span className="label">{dark ? "Light theme" : "Dark theme"}</span></button>
            <button type="button" className="nav-link" onClick={signOut} title="Sign out"><Icon name="signout" /><span className="label">Sign out</span></button>
            <button type="button" className="nav-link collapse-btn" onClick={toggleCollapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-pressed={collapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}><Icon name="collapse" /><span className="label">Collapse</span></button>
          </div>
        </div>
      </aside>
      <main id="main" tabIndex={-1}>{children}</main>
    </div>
  );
}
