"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserSupabase } from "@/lib/supabase/browser";
import { parseAccountForm } from "@/lib/accountInput";

export function AddAccountForm() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", domain: "", roles: "", pages: "/pricing\n/careers" });
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const row = parseAccountForm(f);
    if (typeof row === "string") return setErr(row);
    const { error } = await browserSupabase().from("accounts").insert(row);
    if (error) return setErr(error.message.includes("duplicate") ? "You already watch this domain." : error.message);
    setErr("");
    setF({ name: "", domain: "", roles: "", pages: "/pricing\n/careers" });
    router.refresh();
  }

  return (
    <form onSubmit={add} className="form-grid">
      <label>Company<input value={f.name} onChange={set("name")} placeholder="Acme" required /></label>
      <label>Domain<input value={f.domain} onChange={set("domain")} placeholder="acme.com" required /></label>
      <label>Role words that count as a hiring signal<input value={f.roles} onChange={set("roles")} placeholder="SDR, RevOps, data engineer" /></label>
      <label>Pages to watch (one per line, max 5)<textarea rows={3} value={f.pages} onChange={set("pages")} /></label>
      {err && <p className="err">{err}</p>}
      <div><button className="primary" type="submit">Add account</button></div>
    </form>
  );
}
