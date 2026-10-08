import type { SupabaseClient } from "@supabase/supabase-js";
import type { Account, NewSignal, SeenItem, Store } from "./checker";

/** Checker store backed by the Supabase tables in supabase/migrations. */
export class SupabaseStore implements Store {
  constructor(private readonly db: SupabaseClient) {}

  async getSeen(accountId: string): Promise<SeenItem[]> {
    const { data, error } = await this.db.from("seen_items").select("kind, key, hash, content").eq("account_id", accountId);
    if (error) throw new Error(error.message);
    return (data ?? []) as SeenItem[];
  }

  async saveSeen(account: Account, items: SeenItem[]): Promise<void> {
    if (!items.length) return;
    const now = new Date().toISOString();
    const rows = items.map((i) => ({
      owner_id: account.owner_id,
      account_id: account.id,
      kind: i.kind,
      key: i.key,
      hash: i.hash ?? null,
      content: i.content ?? null,
      last_seen_at: now,
    }));
    const { error } = await this.db.from("seen_items").upsert(rows, { onConflict: "account_id,kind,key" });
    if (error) throw new Error(error.message);
  }

  async addSignals(signals: NewSignal[]): Promise<void> {
    const { error } = await this.db.from("signals").insert(signals);
    if (error) throw new Error(error.message);
  }

  async markChecked(accountId: string, at: Date): Promise<void> {
    const { error } = await this.db.from("accounts").update({ last_checked_at: at.toISOString() }).eq("id", accountId);
    if (error) throw new Error(error.message);
  }
}

export const ACCOUNT_COLUMNS = "id, owner_id, name, domain, role_keywords, pages, last_checked_at";
