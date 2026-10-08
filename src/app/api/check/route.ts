import { NextResponse } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";
import { ACCOUNT_COLUMNS } from "@/lib/store";
import { QuoteError, type Account } from "@/lib/checker";
import { checkAndRecord } from "@/lib/checkService";
import { readLimits } from "@/lib/limits";

export const maxDuration = 300;

/** Paid. Runs a check after the user confirmed a maximum spend. Refuses when the estimate is above it. */
export async function POST(req: Request) {
  const db = await serverSupabase();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { accountIds?: string[]; maxCostUsd?: number };
  const maxCostUsd = Number(body.maxCostUsd);
  const { maxCheckCostUsd } = readLimits();
  if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0) {
    return NextResponse.json({ error: "Confirm a maximum spend first (maxCostUsd)." }, { status: 400 });
  }
  if (maxCostUsd > maxCheckCostUsd) {
    return NextResponse.json({ error: `The server limit for one check is $${maxCheckCostUsd}. Raise MAX_CHECK_COST_USD to allow more.` }, { status: 400 });
  }

  let q = db.from("accounts").select(ACCOUNT_COLUMNS);
  if (body.accountIds?.length) q = q.in("id", body.accountIds);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const summary = await checkAndRecord(db, auth.user.id, (data ?? []) as Account[], maxCostUsd, "manual");
    return NextResponse.json(summary);
  } catch (e) {
    if (e instanceof QuoteError) return NextResponse.json({ error: e.message, estimateUsd: e.estimateUsd }, { status: 409 });
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
