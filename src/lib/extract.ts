import { createHash } from "node:crypto";

export interface Item {
  url: string;
  title: string;
  date?: string;
  source?: string;
  company?: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

const URL_KEYS = ["url", "link", "job_url", "jobUrl", "apply_link", "applyLink", "share_link", "redirect_url"];
const TITLE_KEYS = ["title", "headline", "job_title", "jobTitle", "name", "position"];
const DATE_KEYS = ["date", "published", "publishedAt", "published_at", "pubDate", "datePublished", "posted_at", "postedAt", "date_posted", "created"];
const SOURCE_KEYS = ["source", "publisher", "site", "domain"];
const COMPANY_KEYS = ["company", "company_name", "companyName", "employer", "employer_name", "organization"];

function pick(o: Obj, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    const s = str(v) ?? (isObj(v) ? str(v.name) ?? str(v.title) : undefined);
    if (s) return s;
  }
  return undefined;
}

function toItem(o: Obj): Item | null {
  const url = pick(o, URL_KEYS);
  const title = pick(o, TITLE_KEYS);
  if (!url || !title || !/^https?:\/\//i.test(url)) return null;
  return { url, title, date: pick(o, DATE_KEYS), source: pick(o, SOURCE_KEYS), company: pick(o, COMPANY_KEYS) };
}

/**
 * Finds the list of results in a provider's answer. Providers differ (news[], articles[], organic[],
 * data.jobs[] ...), so this walks the answer breadth first and returns the first array whose
 * entries carry a link and a title.
 */
export function extractItems(result: unknown, maxDepth = 5): Item[] {
  const queue: { v: unknown; d: number }[] = [{ v: result, d: 0 }];
  while (queue.length) {
    const { v, d } = queue.shift()!;
    if (Array.isArray(v)) {
      const items = v.filter(isObj).map(toItem).filter((x): x is Item => x !== null);
      if (items.length) return dedupe(items);
      if (d < maxDepth) for (const e of v) if (isObj(e)) queue.push({ v: e, d: d + 1 });
    } else if (isObj(v) && d < maxDepth) {
      for (const child of Object.values(v)) if (typeof child === "object" && child !== null) queue.push({ v: child, d: d + 1 });
    }
  }
  return [];
}

function dedupe(items: Item[]): Item[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)));
}

/** Reads page text from a scrape run: normalized.markdown first, then the usual result fields. */
export function extractMarkdown(run: { normalized?: Obj | null; result?: unknown }): string | null {
  const candidates: unknown[] = [run.normalized?.markdown, run.normalized?.text];
  const r = run.result;
  if (typeof r === "string") candidates.push(r);
  if (isObj(r)) {
    candidates.push(r.markdown, r.text, r.content);
    if (isObj(r.data)) candidates.push(r.data.markdown, r.data.text, r.data.content);
  }
  for (const c of candidates) if (typeof c === "string" && c.trim()) return c;
  return null;
}

/** Removes parts of a page that change on every load (dates, times, cache-busting query strings). */
export function normalizePage(markdown: string): string {
  return markdown
    .replace(/\b\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?\b/g, "")
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\s?(am|pm)?\b/gi, "")
    .replace(/\?(v|ver|cb|_)=[\w.-]+/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Lines present in the new page text and not in the old one, at most `max`. */
export function changedLines(before: string, after: string, max = 3): string[] {
  const old = new Set(before.split("\n"));
  return after
    .split("\n")
    .filter((l) => l.length > 2 && !old.has(l))
    .slice(0, max);
}

const TAGS: [string, RegExp][] = [
  ["funding", /\b(raises?|raised|funding|series [a-f]\b|seed round|investment led by)/i],
  ["layoffs", /\b(layoffs?|lays off|cuts? \d+ jobs|job cuts)\b/i],
  ["exec_change", /\b(appoints?|names? .{0,40}\b(ceo|cto|cfo|coo|cmo|cro|chief|president|vp)\b|joins as|steps down|new (ceo|cto|cfo))/i],
  ["acquisition", /\b(acquires?|acquired|acquisition|merger)\b/i],
  ["launch", /\b(launch(es|ed)?|introduc(es|ed)|unveil(s|ed)|releases?|rolls out)\b/i],
  ["partnership", /\b(partner(s|ship)?|teams up|integration with)\b/i],
];

/** Tags a news headline by the kind of event it reports. */
export function tagHeadline(title: string): string {
  for (const [tag, re] of TAGS) if (re.test(title)) return tag;
  return "other";
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(inc|ltd|llc|gmbh|sas|corp|co)\b/g, "").trim();

/** True when a job posting is from the account (by employer name) and matches one of the role words. */
export function isMatchingJob(item: Item, companyName: string, roleKeywords: string[]): boolean {
  if (item.company && !norm(item.company).includes(norm(companyName)) && !norm(companyName).includes(norm(item.company))) {
    return false;
  }
  if (!roleKeywords.length) return true;
  const t = item.title.toLowerCase();
  return roleKeywords.some((k) => k.trim() && t.includes(k.trim().toLowerCase()));
}
