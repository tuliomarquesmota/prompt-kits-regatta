import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Cliente do navegador. A sessão fica salva no aparelho, então o app abre logado mesmo offline. */
export function supabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key)
      throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local");
    client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  }
  return client;
}
