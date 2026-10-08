import { costOf, type LoootRun } from "./looot";
import { JOBS, type JobId } from "./prices";
import { changedLines, extractItems, extractMarkdown, isMatchingJob, normalizePage, sha256, tagHeadline } from "./extract";

export interface Account {
  id: string;
  owner_id: string;
  name: string;
  domain: string;
  role_keywords: string[];
  pages: string[];
  /** Null until the first check, which only records a baseline. */
  last_checked_at?: string | null;
}

export type SignalKind = "news" | "job" | "page";

export interface SeenItem {
  kind: SignalKind;
  key: string;
  hash?: string | null;
  content?: string | null;
}

export interface NewSignal {
  owner_id: string;
  account_id: string;
  kind: SignalKind;
  tag: string;
  title: string;
  url: string | null;
  detail: string | null;
}

/** Where the checker reads and writes. The app uses Supabase; tests use memory. */
export interface Store {
  getSeen(accountId: string): Promise<SeenItem[]>;
  saveSeen(account: Account, items: SeenItem[]): Promise<void>;
  addSignals(signals: NewSignal[]): Promise<void>;
  markChecked(accountId: string, at: Date): Promise<void>;
}

/** The part of the looot client the checker needs. */
export interface Runner {
  runAndWait(jobId: string, input: Record<string, unknown>, idempotencyKey: string, maxCostUsd: number): Promise<LoootRun>;
}

export interface PlannedRun {
  account: Account;
  kind: SignalKind;
  job: JobId;
  input: Record<string, unknown>;
  key: string;
}

/** The looot runs one check of these accounts makes: news, jobs when role words are set, one per watched page. */
export function planRuns(accounts: Account[], day: string): PlannedRun[] {
  const plans: PlannedRun[] = [];
  for (const a of accounts) {
    plans.push({ account: a, kind: "news", job: JOBS.news, input: { query: `"${a.name}"` }, key: `wl-${a.id}-${day}-news` });
    const roles = a.role_keywords.map((r) => r.trim()).filter(Boolean);
    if (roles.length) {
      plans.push({
        account: a,
        kind: "job",
        job: JOBS.jobs,
        input: { query: `${a.name} ${roles.join(" OR ")}`, company: a.name },
        key: `wl-${a.id}-${day}-jobs`,
      });
    }
    for (const url of a.pages) {
      plans.push({ account: a, kind: "page", job: JOBS.page, input: { url }, key: `wl-${a.id}-${day}-page-${sha256(url).slice(0, 12)}` });
    }
  }
  return plans;
}

/** Sum of the per-call prices of the planned runs, in dollars. */
export function estimateCost(plans: PlannedRun[], prices: Record<JobId, number>): number {
  return round(plans.reduce((s, p) => s + prices[p.job], 0));
}

/** The most a check can spend: every run is capped at perRunCapUsd, so the total cannot pass runs x cap. */
export function worstCaseCost(plans: PlannedRun[], perRunCapUsd: number): number {
  return round(plans.length * perRunCapUsd);
}

export class QuoteError extends Error {
  constructor(
    message: string,
    readonly estimateUsd: number,
  ) {
    super(message);
    this.name = "QuoteError";
  }
}

export interface CheckOptions {
  accounts: Account[];
  runner: Runner;
  store: Store;
  prices: Record<JobId, number>;
  /** The most the user agreed to spend on this check. */
  maxCostUsd: number;
  /** Cap for one run, passed to looot as fallback.maxCostUsd. */
  perRunCapUsd: number;
  now?: Date;
}

export interface CheckSummary {
  accountsChecked: number;
  runs: number;
  signalsCreated: number;
  baselines: number;
  estimateUsd: number;
  spentUsd: number;
  stoppedForBudget: boolean;
  errors: string[];
}

/**
 * Runs one check. Refuses before any paid call when the estimate is above maxCostUsd. While running,
 * it stops before a run whose cap could push the total past maxCostUsd, so the spend never passes it.
 */
export async function runCheck(opts: CheckOptions): Promise<CheckSummary> {
  const now = opts.now ?? new Date();
  const day = now.toISOString().slice(0, 10);
  const plans = planRuns(opts.accounts, day);
  const estimateUsd = estimateCost(plans, opts.prices);
  if (estimateUsd > opts.maxCostUsd) {
    throw new QuoteError(`This check is estimated at $${estimateUsd.toFixed(4)}, above your limit of $${opts.maxCostUsd.toFixed(4)}.`, estimateUsd);
  }
  const summary: CheckSummary = {
    accountsChecked: 0,
    runs: 0,
    signalsCreated: 0,
    baselines: 0,
    estimateUsd,
    spentUsd: 0,
    stoppedForBudget: false,
    errors: [],
  };

  for (const account of opts.accounts) {
    const mine = plans.filter((p) => p.account.id === account.id);
    const results: { plan: PlannedRun; run: LoootRun }[] = [];
    for (const plan of mine) {
      const cap = Math.min(opts.perRunCapUsd, opts.maxCostUsd - summary.spentUsd);
      if (cap < opts.prices[plan.job]) {
        summary.stoppedForBudget = true;
        break;
      }
      try {
        const run = await opts.runner.runAndWait(plan.job, plan.input, plan.key, round(cap));
        summary.runs += 1;
        summary.spentUsd = round(summary.spentUsd + (costOf(run) ?? (run.status === "completed" ? opts.prices[plan.job] : 0)));
        if (run.status === "completed") results.push({ plan, run });
        else summary.errors.push(`${account.domain} ${plan.kind}: ${run.error?.message ?? run.status}`);
      } catch (e) {
        summary.errors.push(`${account.domain} ${plan.kind}: ${(e as Error).message}`);
      }
    }
    if (results.length) {
      const seen = await opts.store.getSeen(account.id);
      const { signals, seenUpdates, isBaseline } = diffResults(account, results, seen);
      await opts.store.saveSeen(account, seenUpdates);
      if (signals.length) await opts.store.addSignals(signals);
      summary.signalsCreated += signals.length;
      if (isBaseline) summary.baselines += 1;
      await opts.store.markChecked(account.id, now);
      summary.accountsChecked += 1;
    }
    if (summary.stoppedForBudget) break;
  }
  return summary;
}

/**
 * Compares run results with what was seen before. The first check of an account (never checked,
 * nothing seen) only records a baseline: everything it finds is saved as seen, no signal is created.
 */
export function diffResults(account: Account, results: { plan: PlannedRun; run: LoootRun }[], seen: SeenItem[]) {
  const isBaseline = !account.last_checked_at && seen.length === 0;
  const byKey = new Map(seen.map((s) => [`${s.kind}|${s.key}`, s]));
  const signals: NewSignal[] = [];
  const seenUpdates: SeenItem[] = [];
  const add = (s: Omit<NewSignal, "owner_id" | "account_id">) => {
    if (!isBaseline) signals.push({ owner_id: account.owner_id, account_id: account.id, ...s });
  };

  for (const { plan, run } of results) {
    if (plan.kind === "news") {
      for (const item of extractItems(run.result).slice(0, 20)) {
        if (byKey.has(`news|${item.url}`)) continue;
        seenUpdates.push({ kind: "news", key: item.url });
        add({ kind: "news", tag: tagHeadline(item.title), title: item.title, url: item.url, detail: [item.source, item.date].filter(Boolean).join(", ") || null });
      }
    } else if (plan.kind === "job") {
      for (const item of extractItems(run.result).slice(0, 50)) {
        if (!isMatchingJob(item, account.name, account.role_keywords)) continue;
        if (byKey.has(`job|${item.url}`)) continue;
        seenUpdates.push({ kind: "job", key: item.url });
        add({ kind: "job", tag: "hiring", title: item.title, url: item.url, detail: item.date ?? null });
      }
    } else {
      const url = String(plan.input.url);
      const md = extractMarkdown(run);
      if (!md) continue;
      const text = normalizePage(md).slice(0, 20_000);
      const hash = sha256(text);
      const prev = byKey.get(`page|${url}`);
      if (prev?.hash === hash) continue;
      seenUpdates.push({ kind: "page", key: url, hash, content: text });
      if (prev) {
        const lines = changedLines(prev.content ?? "", text);
        add({ kind: "page", tag: "page_change", title: `${new URL(url).pathname || "/"} changed`, url, detail: lines.join("\n") || null });
      }
    }
  }
  return { signals, seenUpdates, isBaseline };
}

function round(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
