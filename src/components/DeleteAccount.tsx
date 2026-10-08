"use client";

import { useRouter } from "next/navigation";
import { browserSupabase } from "@/lib/supabase/browser";

export function DeleteAccount({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  async function remove() {
    if (!confirm(`Stop watching ${name}? Its signals are deleted too.`)) return;
    await browserSupabase().from("accounts").delete().eq("id", id);
    router.refresh();
  }
  return <button onClick={remove} className="small">Remove</button>;
}
