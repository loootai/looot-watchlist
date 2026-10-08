import Link from "next/link";
import { redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";
import { MarkRead } from "@/components/MarkRead";

export const dynamic = "force-dynamic";

interface SignalRow {
  id: number;
  kind: string;
  tag: string;
  title: string;
  url: string | null;
  detail: string | null;
  read_at: string | null;
  created_at: string;
  account_id: string;
  accounts: { name: string; domain: string } | null;
}

const KINDS = ["news", "job", "page"] as const;

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ account?: string; kind?: string; unread?: string }> }) {
  const sp = await searchParams;
  const db = await serverSupabase();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect("/login");

  let q = db
    .from("signals")
    .select("id, kind, tag, title, url, detail, read_at, created_at, account_id, accounts(name, domain)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (sp.account) q = q.eq("account_id", sp.account);
  if (sp.kind && (KINDS as readonly string[]).includes(sp.kind)) q = q.eq("kind", sp.kind);
  if (sp.unread) q = q.is("read_at", null);
  const { data, error } = await q;
  const rows = (data ?? []) as unknown as SignalRow[];
  const { count } = await db.from("accounts").select("id", { count: "exact", head: true });

  return (
    <>
      <header className="bar">
        <h1>Signals</h1>
        <div className="row filters">
          <Link href="/" className={!sp.kind && !sp.unread ? "on" : ""}>All</Link>
          <Link href="/?unread=1" className={sp.unread ? "on" : ""}>Unread</Link>
          {KINDS.map((k) => (
            <Link key={k} href={`/?kind=${k}`} className={sp.kind === k ? "on" : ""}>{k === "job" ? "hiring" : k}</Link>
          ))}
          {rows.some((r) => !r.read_at) && <MarkRead ids={rows.filter((r) => !r.read_at).map((r) => r.id)} label="Mark all read" />}
        </div>
      </header>
      {error && <p className="err">{error.message}</p>}
      {!rows.length && (
        <div className="card empty">
          {count ? (
            <p>No signals yet. The first check of an account records a baseline; new news, roles and page changes show up from the next check on.</p>
          ) : (
            <p>No accounts yet. <Link href="/accounts">Add the accounts you want to watch.</Link></p>
          )}
        </div>
      )}
      <ul className="feed">
        {rows.map((s) => (
          <li key={s.id} className={s.read_at ? "read" : ""}>
            <span className={`pill ${s.kind}`}>{s.tag.replace("_", " ")}</span>
            <div className="body">
              <div>
                <Link href={`/?account=${s.account_id}`} className="acct">{s.accounts?.name ?? "account"}</Link>{" "}
                {s.url ? <a href={s.url} target="_blank" rel="noreferrer noopener">{s.title}</a> : s.title}
              </div>
              {s.detail && <pre className="detail">{s.detail}</pre>}
              <div className="muted small">{new Date(s.created_at).toLocaleString()}</div>
            </div>
            {!s.read_at && <MarkRead ids={[s.id]} label="Read" />}
          </li>
        ))}
      </ul>
    </>
  );
}
