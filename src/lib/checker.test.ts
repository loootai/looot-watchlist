import { describe, expect, it, vi } from "vitest";
import { QuoteError, estimateCost, planRuns, runCheck, worstCaseCost, type Account, type NewSignal, type SeenItem, type Store } from "./checker";
import type { LoootRun } from "./looot";

const prices = { "news.search": 0.001, "jobs.search": 0.0015, "web.scrape.markdown": 0.0002 };
const NOW = new Date("2026-10-08T07:00:00Z");

function account(over: Partial<Account> = {}): Account {
  return { id: "a1", owner_id: "u1", name: "Acme", domain: "acme.com", role_keywords: ["SDR"], pages: ["https://acme.com/pricing"], last_checked_at: null, ...over };
}

class MemoryStore implements Store {
  seen = new Map<string, SeenItem[]>();
  signals: NewSignal[] = [];
  checked: string[] = [];
  async getSeen(id: string) {
    return this.seen.get(id) ?? [];
  }
  async saveSeen(a: Account, items: SeenItem[]) {
    const cur = this.seen.get(a.id) ?? [];
    for (const i of items) {
      const k = cur.findIndex((c) => c.kind === i.kind && c.key === i.key);
      if (k >= 0) cur[k] = i;
      else cur.push(i);
    }
    this.seen.set(a.id, cur);
  }
  async addSignals(s: NewSignal[]) {
    this.signals.push(...s);
  }
  async markChecked(id: string) {
    this.checked.push(id);
  }
}

/** Fake looot: answers each job from a table, records calls. */
function fakeRunner(answers: Record<string, unknown>, cost = 0.001) {
  const calls: { job: string; key: string; cap: number }[] = [];
  return {
    calls,
    runAndWait: vi.fn(async (job: string, _input: Record<string, unknown>, key: string, cap: number): Promise<LoootRun> => {
      calls.push({ job, key, cap });
      const result = answers[job];
      if (result instanceof Error) throw result;
      return { runId: key, status: "completed", result, actualCost: Math.min(cost, cap) };
    }),
  };
}

const day1 = {
  "news.search": { news: [{ title: "Acme opens Paris office", link: "https://n.example.com/1" }] },
  "jobs.search": { jobs: [{ title: "SDR", link: "https://j.example.com/1", company: "Acme" }] },
  "web.scrape.markdown": { markdown: "Team $49 per seat" },
};
const day2 = {
  "news.search": { news: [{ title: "Acme opens Paris office", link: "https://n.example.com/1" }, { title: "Acme raises $20M Series B", link: "https://n.example.com/2" }] },
  "jobs.search": { jobs: [{ title: "SDR", link: "https://j.example.com/1", company: "Acme" }, { title: "Senior SDR", link: "https://j.example.com/2", company: "Acme" }, { title: "Designer", link: "https://j.example.com/3", company: "Acme" }] },
  "web.scrape.markdown": { markdown: "Team $59 per seat" },
};

describe("planRuns and estimates", () => {
  it("plans news, jobs (only with role words) and one run per page, with dated idempotency keys", () => {
    const plans = planRuns([account(), account({ id: "a2", role_keywords: [], pages: [] })], "2026-10-08");
    expect(plans.map((p) => `${p.account.id}:${p.job}`)).toEqual(["a1:news.search", "a1:jobs.search", "a1:web.scrape.markdown", "a2:news.search"]);
    expect(plans[0].key).toBe("wl-a1-2026-10-08-news");
    expect(estimateCost(plans, prices)).toBeCloseTo(0.0037);
    expect(worstCaseCost(plans, 0.02)).toBe(0.08);
  });
});

describe("runCheck", () => {
  it("refuses before any paid call when the estimate is above the confirmed maximum", async () => {
    const runner = fakeRunner(day1);
    await expect(runCheck({ accounts: [account()], runner, store: new MemoryStore(), prices, maxCostUsd: 0.001, perRunCapUsd: 0.02, now: NOW })).rejects.toBeInstanceOf(QuoteError);
    expect(runner.runAndWait).not.toHaveBeenCalled();
  });

  it("records a baseline on the first check, then creates only new signals", async () => {
    const store = new MemoryStore();
    const first = await runCheck({ accounts: [account()], runner: fakeRunner(day1), store, prices, maxCostUsd: 0.1, perRunCapUsd: 0.02, now: NOW });
    expect(first).toMatchObject({ accountsChecked: 1, runs: 3, signalsCreated: 0, baselines: 1, spentUsd: 0.003 });
    expect(store.seen.get("a1")).toHaveLength(3);

    const second = await runCheck({
      accounts: [account({ last_checked_at: NOW.toISOString() })],
      runner: fakeRunner(day2),
      store,
      prices,
      maxCostUsd: 0.1,
      perRunCapUsd: 0.02,
      now: new Date("2026-10-09T07:00:00Z"),
    });
    expect(second.signalsCreated).toBe(3);
    expect(store.signals.map((s) => [s.kind, s.tag, s.title])).toEqual([
      ["news", "funding", "Acme raises $20M Series B"],
      ["job", "hiring", "Senior SDR"],
      ["page", "page_change", "/pricing changed"],
    ]);
    expect(store.signals[2].detail).toBe("Team $59 per seat");
    expect(store.signals.every((s) => s.owner_id === "u1" && s.account_id === "a1")).toBe(true);
  });

  it("never lets the total pass the maximum: it stops before a run whose cap does not fit", async () => {
    const runner = fakeRunner(day1, 0.004);
    const accounts = [account({ id: "a1" }), account({ id: "a2", domain: "b.example.com" })];
    const s = await runCheck({ accounts, runner, store: new MemoryStore(), prices, maxCostUsd: 0.01, perRunCapUsd: 0.02, now: NOW });
    expect(s.stoppedForBudget).toBe(true);
    expect(s.spentUsd).toBeLessThanOrEqual(0.01);
    expect(runner.calls.every((c) => c.cap <= 0.01)).toBe(true);
    expect(runner.calls[0].cap).toBe(0.01);
  });

  it("keeps going when one run fails and reports it", async () => {
    const s = await runCheck({
      accounts: [account()],
      runner: fakeRunner({ ...day1, "jobs.search": new Error("provider timeout") }),
      store: new MemoryStore(),
      prices,
      maxCostUsd: 0.1,
      perRunCapUsd: 0.02,
      now: NOW,
    });
    expect(s.runs).toBe(2);
    expect(s.errors).toEqual(["acme.com job: provider timeout"]);
    expect(s.accountsChecked).toBe(1);
  });

  it("counts a failed run as an error and does not save anything from it", async () => {
    const store = new MemoryStore();
    const runner = { runAndWait: vi.fn(async (): Promise<LoootRun> => ({ runId: "x", status: "failed", error: { message: "route_capped" }, actualCost: 0 })) };
    const s = await runCheck({ accounts: [account()], runner, store, prices, maxCostUsd: 0.1, perRunCapUsd: 0.02, now: NOW });
    expect(s.errors).toHaveLength(3);
    expect(s.spentUsd).toBe(0);
    expect(store.checked).toEqual([]);
  });
});
