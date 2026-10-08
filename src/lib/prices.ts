/** The three looot jobs this app runs. */
export const JOBS = {
  news: "news.search",
  jobs: "jobs.search",
  page: "web.scrape.markdown",
} as const;

export type JobId = (typeof JOBS)[keyof typeof JOBS];

/** Prices used when the catalog cannot be read: the cheapest provider on 2026-10-08, per call or per result x results per call, whichever is higher. */
export const FALLBACK_PRICES: Record<JobId, number> = {
  "news.search": 0.00099,
  "jobs.search": 0.00145,
  "web.scrape.markdown": 0.001,
};

interface OverviewJob {
  id: string;
  cheapestPerCall?: number | null;
  cheapestPerResult?: number | null;
}
interface Overview {
  categories?: { platforms?: { jobs?: OverviewJob[] }[] }[];
}

/** Results one call returns, used when a job is priced per result. A page read is one result. */
const RESULTS_PER_CALL: Record<JobId, number> = { "news.search": 10, "jobs.search": 10, "web.scrape.markdown": 1 };

/** Reads the cheapest per-call price of each job this app uses from a catalog overview answer. */
export function priceMapFromOverview(overview: Overview): Record<JobId, number> {
  const out: Record<JobId, number> = { ...FALLBACK_PRICES };
  const wanted = new Set<string>(Object.values(JOBS));
  for (const c of overview.categories ?? []) {
    for (const p of c.platforms ?? []) {
      for (const j of p.jobs ?? []) {
        if (!wanted.has(j.id)) continue;
        const perCall = typeof j.cheapestPerCall === "number" ? j.cheapestPerCall : null;
        const perResult = typeof j.cheapestPerResult === "number" ? j.cheapestPerResult * RESULTS_PER_CALL[j.id as JobId] : null;
        const price = Math.max(perCall ?? 0, perResult ?? 0);
        if (price > 0) out[j.id as JobId] = price;
      }
    }
  }
  return out;
}

/** Free, no key needed. Reads current prices from the public catalog overview, cached for an hour. */
export async function fetchPrices(baseUrl = process.env.LOOOT_API_URL ?? "https://api.looot.ai", f: typeof fetch = fetch) {
  try {
    const res = await f(`${baseUrl.replace(/\/+$/, "")}/v1/catalog/overview?depth=jobs`, {
      next: { revalidate: 3600 },
    } as RequestInit);
    if (!res.ok) return { prices: { ...FALLBACK_PRICES }, source: "fallback" as const };
    return { prices: priceMapFromOverview((await res.json()) as Overview), source: "catalog" as const };
  } catch {
    return { prices: { ...FALLBACK_PRICES }, source: "fallback" as const };
  }
}
