"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserSupabase } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);

  async function submit(e: React.FormEvent, mode: "in" | "up") {
    e.preventDefault();
    const auth = browserSupabase().auth;
    const { data, error } = mode === "in" ? await auth.signInWithPassword({ email, password }) : await auth.signUp({ email, password });
    if (error) return setMsg({ text: error.message, bad: true });
    if (mode === "up" && !data.session) return setMsg({ text: "Check your inbox to confirm the address, then sign in.", bad: false });
    router.replace("/");
    router.refresh();
  }

  return (
    <form className="card narrow" onSubmit={(e) => submit(e, "in")}>
      <h1>looot watchlist</h1>
      <p className="muted">Buying signals on your target accounts. Sign in with your email and password.</p>
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
      <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="current-password" /></label>
      {msg && <p className={msg.bad ? "err" : "ok"}>{msg.text}</p>}
      <div className="row">
        <button className="primary" type="submit">Sign in</button>
        <button type="button" onClick={(e) => submit(e, "up")}>Create account</button>
      </div>
    </form>
  );
}
