import type { Metadata } from "next";
import "./globals.css";
import { AppShell, type NavItem, type SpendLine } from "@/components/AppShell";
import { readLimits } from "@/lib/limits";
import { serverSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "looot watchlist",
  description: "Buying signals on your target accounts: news, hiring and page changes, powered by looot and Supabase",
  icons: { icon: "/brand/looot-mark.svg" },
};

const ITEMS: NavItem[] = [
  { href: "/", label: "Signals", icon: "signals" },
  { href: "/accounts", label: "Accounts", icon: "accounts" },
];

/** Applies the saved theme before first paint, so a dark choice does not flash light. */
const THEME_SCRIPT = `try{var t=localStorage.getItem("looot-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;else if(matchMedia("(prefers-color-scheme: dark)").matches)document.documentElement.dataset.theme="dark"}catch(e){}`;

async function readSpend(): Promise<SpendLine[] | null> {
  try {
    const db = await serverSupabase();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return null;
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);
    const { data } = await db.from("check_runs").select("spent_usd").gte("created_at", since.toISOString());
    const month = (data ?? []).reduce((sum, r) => sum + Number(r.spent_usd), 0);
    const { maxCheckCostUsd } = readLimits();
    return [
      { label: "This month", value: `$${month.toFixed(4)}` },
      { label: "Cap per check", value: `$${maxCheckCostUsd.toFixed(2)}` },
    ];
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const spend = await readSpend();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <AppShell items={ITEMS} spend={spend}>{children}</AppShell>
      </body>
    </html>
  );
}
