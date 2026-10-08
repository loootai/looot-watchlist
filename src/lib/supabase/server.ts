import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/** Supabase client for server components and route handlers. Acts as the signed-in user, so row level security applies. */
export async function serverSupabase() {
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {
          // Server components cannot write cookies. proxy.ts refreshes the session instead.
        }
      },
    },
  });
}

/**
 * Service role client for the daily cron only. It bypasses row level security, so the cron sets
 * owner_id on every row itself. Returns null when SUPABASE_SERVICE_ROLE_KEY is not set.
 */
export function adminSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
}
