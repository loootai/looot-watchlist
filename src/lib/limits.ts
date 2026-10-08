/** Spending limits, read from the environment with safe defaults. */
export function readLimits(env: Record<string, string | undefined> = process.env) {
  const num = (v: string | undefined, d: number) => {
    const n = Number(v);
    return v && Number.isFinite(n) && n > 0 ? n : d;
  };
  return {
    /** Cap on one looot run, sent as fallback.maxCostUsd. */
    perRunCapUsd: num(env.PER_RUN_CAP_USD, 0.02),
    /** The most one manual check may spend, whatever the user types. */
    maxCheckCostUsd: num(env.MAX_CHECK_COST_USD, 1),
    /** The most the daily cron may spend across all users. */
    cronMaxCostUsd: num(env.CRON_MAX_COST_USD, 0.5),
  };
}
