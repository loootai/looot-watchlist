import { describe, expect, it } from "vitest";
import { normalizeDomain, parseAccountForm } from "./accountInput";

describe("normalizeDomain", () => {
  it("reduces URLs to the host", () => {
    expect(normalizeDomain("https://www.Acme.com/about?x=1")).toBe("acme.com");
    expect(normalizeDomain("not a domain")).toBeNull();
    expect(normalizeDomain("")).toBeNull();
  });
});

describe("parseAccountForm", () => {
  it("builds a row with absolute page URLs on the account's domain", () => {
    expect(parseAccountForm({ name: " Acme ", domain: "acme.com", roles: "SDR, RevOps, SDR", pages: "/pricing\nhttps://acme.com/careers" })).toEqual({
      name: "Acme",
      domain: "acme.com",
      role_keywords: ["SDR", "RevOps"],
      pages: ["https://acme.com/pricing", "https://acme.com/careers"],
    });
  });
  it("refuses pages on another domain and more than 5 pages", () => {
    expect(parseAccountForm({ name: "Acme", domain: "acme.com", roles: "", pages: "https://other.example.com/x" })).toMatch(/must be on acme.com/);
    expect(parseAccountForm({ name: "Acme", domain: "acme.com", roles: "", pages: "/1\n/2\n/3\n/4\n/5\n/6" })).toMatch(/at most 5/);
    expect(parseAccountForm({ name: "", domain: "acme.com", roles: "", pages: "" })).toMatch(/company name/);
  });
});
