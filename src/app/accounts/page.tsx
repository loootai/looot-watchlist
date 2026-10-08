import { redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";
import { ACCOUNT_COLUMNS } from "@/lib/store";
import type { Account } from "@/lib/checker";
import { AddAccountForm } from "@/components/AddAccountForm";
import { CheckPanel } from "@/components/CheckPanel";
import { DeleteAccount } from "@/components/DeleteAccount";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const db = await serverSupabase();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data } = await db.from("accounts").select(ACCOUNT_COLUMNS).order("created_at", { ascending: true });
  const accounts = (data ?? []) as Account[];
  const { data: runs } = await db
    .from("check_runs")
    .select("created_at, trigger, accounts_checked, signals_created, spent_usd, stopped_for_budget")
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <>
      <header className="bar"><h1>Accounts ({accounts.length})</h1></header>
      <CheckPanel hasAccounts={accounts.length > 0} />
      <div className="card">
        <h2>Add an account</h2>
        <AddAccountForm />
      </div>
      {accounts.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Company</th><th>Role words</th><th>Watched pages</th><th>Last check</th><th /></tr></thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.name}</strong><div className="muted small">{a.domain}</div></td>
                  <td>{a.role_keywords.join(", ") || <span className="muted">none</span>}</td>
                  <td className="small">{a.pages.map((p) => <div key={p}>{p.replace(/^https?:\/\//, "")}</div>)}</td>
                  <td className="small">{a.last_checked_at ? new Date(a.last_checked_at).toLocaleString() : <span className="muted">never</span>}</td>
                  <td><DeleteAccount id={a.id} name={a.name} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {runs && runs.length > 0 && (
        <div className="card">
          <h2>Recent checks</h2>
          <ul className="plain small">
            {runs.map((r) => (
              <li key={r.created_at}>
                {new Date(r.created_at).toLocaleString()} ({r.trigger}): {r.accounts_checked} accounts, {r.signals_created} signals, ${Number(r.spent_usd).toFixed(4)}
                {r.stopped_for_budget ? ", stopped at the spend limit" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
