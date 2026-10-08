import { NextResponse } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";
import { ACCOUNT_COLUMNS } from "@/lib/store";
import { estimateCost, planRuns, worstCaseCost, type Account } from "@/lib/checker";
import { fetchPrices } from "@/lib/prices";
import { readLimits } from "@/lib/limits";

/** Free. What a check of the signed-in user's accounts would cost, before anything runs. */
export async function GET(req: Request) {
  const db = await serverSupabase();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const ids = new URL(req.url).searchParams.get("ids")?.split(",").filter(Boolean);
  let q = db.from("accounts").select(ACCOUNT_COLUMNS);
  if (ids?.length) q = q.in("id", ids);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const accounts = (data ?? []) as Account[];
  const plans = planRuns(accounts, new Date().toISOString().slice(0, 10));
  const { prices, source } = await fetchPrices();
  const limits = readLimits();
  return NextResponse.json({
    accounts: accounts.length,
    runs: plans.length,
    estimateUsd: estimateCost(plans, prices),
    worstCaseUsd: worstCaseCost(plans, limits.perRunCapUsd),
    perRunCapUsd: limits.perRunCapUsd,
    maxCheckCostUsd: limits.maxCheckCostUsd,
    prices,
    priceSource: source,
  });
}
