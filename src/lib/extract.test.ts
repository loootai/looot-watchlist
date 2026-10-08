import { describe, expect, it } from "vitest";
import { changedLines, extractItems, extractMarkdown, isMatchingJob, normalizePage, tagHeadline } from "./extract";

describe("extractItems", () => {
  it("reads a Serper-style news answer", () => {
    const r = { news: [{ title: "Acme raises $20M Series B", link: "https://news.example.com/a", date: "2 days ago", source: "Example News" }] };
    expect(extractItems(r)).toEqual([{ url: "https://news.example.com/a", title: "Acme raises $20M Series B", date: "2 days ago", source: "Example News", company: undefined }]);
  });
  it("finds a nested jobs array and skips entries without a link", () => {
    const r = { data: { meta: { total: 2 }, jobs: [{ job_title: "Senior SDR", job_url: "https://jobs.example.com/1", company: { name: "Acme" } }, { job_title: "No link" }] } };
    const items = extractItems(r);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "Senior SDR", url: "https://jobs.example.com/1", company: "Acme" });
  });
  it("dedupes by url and returns [] for unknown shapes", () => {
    expect(extractItems({ a: [{ title: "x", url: "https://e.example.com" }, { title: "y", url: "https://e.example.com" }] })).toHaveLength(1);
    expect(extractItems({ message: "nothing" })).toEqual([]);
    expect(extractItems(null)).toEqual([]);
  });
});

describe("extractMarkdown", () => {
  it("prefers normalized.markdown, then result fields", () => {
    expect(extractMarkdown({ normalized: { markdown: "# A" }, result: { markdown: "# B" } })).toBe("# A");
    expect(extractMarkdown({ result: { data: { markdown: "# C" } } })).toBe("# C");
    expect(extractMarkdown({ result: { text: "plain" } })).toBe("plain");
    expect(extractMarkdown({ result: {} })).toBeNull();
  });
});

describe("page normalisation", () => {
  it("ignores dates and times so the hash only moves on real changes", () => {
    expect(normalizePage("Updated 2026-10-08T10:00:00Z\nTeam  $49")).toBe(normalizePage("Updated 2026-10-09T11:00:00Z\nTeam $49"));
    expect(normalizePage("Team $49")).not.toBe(normalizePage("Team $59"));
  });
  it("lists new lines", () => {
    expect(changedLines("Team $49\nPro $99", "Team $59\nPro $99")).toEqual(["Team $59"]);
  });
});

describe("tagHeadline", () => {
  it.each([
    ["Acme raises $20M Series B led by Example Ventures", "funding"],
    ["Acme appoints Jane Doe as CFO", "exec_change"],
    ["Acme launches an AI assistant", "launch"],
    ["Acme lays off 10% of staff", "layoffs"],
    ["Acme acquires Beta", "acquisition"],
    ["Acme and Beta announce partnership", "partnership"],
    ["Acme in the news", "other"],
  ])("%s -> %s", (title, tag) => expect(tagHeadline(title)).toBe(tag));
});

describe("isMatchingJob", () => {
  const job = (title: string, company?: string) => ({ title, url: "https://j.example.com", company });
  it("keeps roles at the account that match a role word", () => {
    expect(isMatchingJob(job("Senior SDR", "Acme Inc"), "Acme", ["SDR"])).toBe(true);
    expect(isMatchingJob(job("Account Executive", "Acme"), "Acme", ["SDR", "RevOps"])).toBe(false);
    expect(isMatchingJob(job("SDR", "Other Corp"), "Acme", ["SDR"])).toBe(false);
    expect(isMatchingJob(job("SDR"), "Acme", ["sdr"])).toBe(true);
  });
});
