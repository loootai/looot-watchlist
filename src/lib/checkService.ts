import type { SupabaseClient } from "@supabase/supabase-js";
import { runCheck, type Account, type CheckSummary } from "./checker";
import { loootFromEnv } from "./looot";
import { fetchPrices } from "./prices";
import { SupabaseStore } from "./store";
import { readLimits } from "./limits";

/** Runs a check for one owner's accounts and records it in check_runs. Server only. */
export async function checkAndRecord(
  db: SupabaseClient,
  ownerId: string,
  accounts: Account[],
  maxCostUsd: number,
  trigger: "manual" | "cron",
): Promise<CheckSummary> {
  const { prices } = await fetchPrices();
  const summary = await runCheck({
    accounts,
    runner: loootFromEnv(),
    store: new SupabaseStore(db),
    prices,
    maxCostUsd,
    perRunCapUsd: readLimits().perRunCapUsd,
  });
  await db.from("check_runs").insert({
    owner_id: ownerId,
    trigger,
    accounts_checked: summary.accountsChecked,
    runs: summary.runs,
    signals_created: summary.signalsCreated,
    estimate_usd: summary.estimateUsd,
    max_cost_usd: maxCostUsd,
    spent_usd: summary.spentUsd,
    stopped_for_budget: summary.stoppedForBudget,
    errors: summary.errors.slice(0, 20),
  });
  return summary;
}
