import { describe, expect, it, vi } from "vitest";
import { FALLBACK_PRICES, fetchPrices, priceMapFromOverview } from "./prices";

const overview = {
  categories: [
    { platforms: [{ jobs: [{ id: "news.search", cheapestPerCall: 0.002, cheapestPerResult: null }, { id: "other.job", cheapestPerCall: 9 }] }] },
    { platforms: [{ jobs: [{ id: "jobs.search", cheapestPerCall: 0.0005, cheapestPerResult: 0.000145 }] }] },
  ],
};

describe("priceMapFromOverview", () => {
  it("takes per-call prices, and per-result x 10 when that is higher", () => {
    const p = priceMapFromOverview(overview);
    expect(p["news.search"]).toBe(0.002);
    expect(p["jobs.search"]).toBeCloseTo(0.00145);
    expect(p["web.scrape.markdown"]).toBe(FALLBACK_PRICES["web.scrape.markdown"]);
  });
});

describe("fetchPrices", () => {
  it("falls back to the dated prices when the catalog is down", async () => {
    const f = vi.fn().mockResolvedValue(new Response("nope", { status: 503 }));
    expect(await fetchPrices("https://api.example.com", f)).toEqual({ prices: FALLBACK_PRICES, source: "fallback" });
    expect(f.mock.calls[0][0]).toBe("https://api.example.com/v1/catalog/overview?depth=jobs");
  });
  it("reads the catalog when it answers", async () => {
    const f = vi.fn().mockResolvedValue(Response.json(overview));
    expect((await fetchPrices("https://api.example.com", f)).source).toBe("catalog");
  });
});
