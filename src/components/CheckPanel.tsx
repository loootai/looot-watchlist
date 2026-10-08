"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Quote {
  accounts: number;
  runs: number;
  estimateUsd: number;
  worstCaseUsd: number;
  perRunCapUsd: number;
  maxCheckCostUsd: number;
  priceSource: string;
}
interface Summary {
  accountsChecked: number;
  runs: number;
  signalsCreated: number;
  baselines: number;
  spentUsd: number;
  stoppedForBudget: boolean;
  errors: string[];
}

/** Quote first, then run with the maximum spend the user confirmed. */
export function CheckPanel({ hasAccounts }: { hasAccounts: boolean }) {
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [max, setMax] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<Summary | null>(null);

  async function getQuote() {
    setErr("");
    setDone(null);
    const res = await fetch("/api/quote");
    const q = await res.json();
    if (!res.ok) return setErr(q.error ?? "Could not get a quote.");
    setQuote(q);
    setMax(String(Math.min(q.maxCheckCostUsd, Math.max(0.01, Math.ceil(q.estimateUsd * 150) / 100))));
  }

  async function run() {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maxCostUsd: Number(max) }) });
    const out = await res.json();
    setBusy(false);
    if (!res.ok) return setErr(out.error ?? "The check failed.");
    setDone(out);
    setQuote(null);
    router.refresh();
  }

  if (!hasAccounts) return null;
  return (
    <div className="card">
      <h2>Check for new signals</h2>
      {!quote && !done && <button className="primary" onClick={getQuote}>Get a quote</button>}
      {quote && (
        <>
          <p>
            {quote.accounts} accounts, {quote.runs} looot runs. Estimated cost <strong>${quote.estimateUsd.toFixed(4)}</strong> at
            today&apos;s cheapest prices ({quote.priceSource}). Each run is capped at ${quote.perRunCapUsd}, so the worst case is ${quote.worstCaseUsd.toFixed(2)}.
          </p>
          <div className="row">
            <label className="inline">Maximum spend $<input type="number" step="0.01" min="0.01" max={quote.maxCheckCostUsd} value={max} onChange={(e) => setMax(e.target.value)} /></label>
            <button className="primary" disabled={busy || !(Number(max) > 0)} onClick={run}>{busy ? "Checking..." : `Run check (max $${max})`}</button>
            <button onClick={() => setQuote(null)} disabled={busy}>Cancel</button>
          </div>
          <p className="muted small">The check stops before any run that could take the total past your maximum.</p>
        </>
      )}
      {done && (
        <p className="ok">
          Checked {done.accountsChecked} accounts in {done.runs} runs for ${done.spentUsd.toFixed(4)}. {done.signalsCreated} new signals
          {done.baselines ? `, ${done.baselines} first checks recorded as a baseline` : ""}.{done.stoppedForBudget ? " Stopped at your spend limit." : ""}
          {done.errors.length > 0 && <span className="err"> {done.errors.length} runs failed: {done.errors.slice(0, 3).join("; ")}</span>}
        </p>
      )}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
