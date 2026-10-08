import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase/server";
import { ACCOUNT_COLUMNS } from "@/lib/store";
import { QuoteError, type Account } from "@/lib/checker";
import { checkAndRecord } from "@/lib/checkService";
import { readLimits } from "@/lib/limits";

export const maxDuration = 300;

/**
 * Daily check of every user's accounts, called by Vercel Cron (vercel.json). Vercel sends
 * "Authorization: Bearer <CRON_SECRET>". The whole run spends at most CRON_MAX_COST_USD.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = adminSupabase();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set; the daily check is off." }, { status: 501 });

  const { data, error } = await db.from("accounts").select(ACCOUNT_COLUMNS).order("last_checked_at", { ascending: true, nullsFirst: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byOwner = new Map<string, Account[]>();
  for (const a of (data ?? []) as Account[]) byOwner.set(a.owner_id, [...(byOwner.get(a.owner_id) ?? []), a]);

  let left = readLimits().cronMaxCostUsd;
  const out: { owner: string; spentUsd?: number; signals?: number; skipped?: string }[] = [];
  for (const [owner, accounts] of byOwner) {
    if (left <= 0) {
      out.push({ owner, skipped: "cron budget used" });
      continue;
    }
    try {
      const s = await checkAndRecord(db, owner, accounts, left, "cron");
      left -= s.spentUsd;
      out.push({ owner, spentUsd: s.spentUsd, signals: s.signalsCreated });
    } catch (e) {
      out.push({ owner, skipped: e instanceof QuoteError ? `estimate $${e.estimateUsd} above the $${left} left` : (e as Error).message });
    }
  }
  return NextResponse.json({ owners: out.length, budgetLeftUsd: Math.max(0, left), results: out });
}
