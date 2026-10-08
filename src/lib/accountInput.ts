export interface AccountInput {
  name: string;
  domain: string;
  role_keywords: string[];
  pages: string[];
}

/** Reduces "https://www.Acme.com/about" to "acme.com". Returns null when it cannot be a host name. */
export function normalizeDomain(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) ? s : null;
}

/** Turns the form fields into a row, or returns the first problem as a message. */
export function parseAccountForm(f: { name: string; domain: string; roles: string; pages: string }): AccountInput | string {
  const name = f.name.trim();
  if (!name) return "Add the company name.";
  const domain = normalizeDomain(f.domain);
  if (!domain) return "Add a domain like acme.com.";
  const role_keywords = [...new Set(f.roles.split(",").map((r) => r.trim()).filter(Boolean))].slice(0, 10);
  const pages: string[] = [];
  for (const line of f.pages.split(/\n|,/).map((l) => l.trim()).filter(Boolean)) {
    const url = line.startsWith("/") ? `https://${domain}${line}` : /^https?:\/\//i.test(line) ? line : `https://${line}`;
    try {
      const u = new URL(url);
      if (normalizeDomain(u.hostname) !== domain) return `Watched pages must be on ${domain}: ${line}`;
      pages.push(u.toString());
    } catch {
      return `Not a page address: ${line}`;
    }
  }
  if (pages.length > 5) return "Watch at most 5 pages per account.";
  return { name, domain, role_keywords, pages: [...new Set(pages)] };
}
