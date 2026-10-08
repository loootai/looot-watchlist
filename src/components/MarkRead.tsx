"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { browserSupabase } from "@/lib/supabase/browser";

export function MarkRead({ ids, label }: { ids: number[]; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function mark() {
    setBusy(true);
    await browserSupabase().from("signals").update({ read_at: new Date().toISOString() }).in("id", ids);
    setBusy(false);
    router.refresh();
  }
  return <button onClick={mark} disabled={busy} className="small">{label}</button>;
}
