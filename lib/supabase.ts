import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

// Trava simples dentro da própria página, no lugar da trava do navegador (navigator.locks).
// Em alguns navegadores (ex.: Brave no Android) a trava do navegador ficava presa depois do "Sair"
// e o app parava logo após o login, sem mostrar erro.
const queues = new Map<string, Promise<unknown>>();
async function pageLock<R>(name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  const previous = queues.get(name) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => (release = resolve));
  queues.set(
    name,
    previous.then(() => current),
  );
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}

/** Cliente do navegador. A sessão fica salva no aparelho, então o app abre logado mesmo offline. */
export function supabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key)
      throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local");
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, lock: pageLock },
    });
  }
  return client;
}
