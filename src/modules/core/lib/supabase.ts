import { createBrowserClient } from '@supabase/ssr';
import { isDemoMode } from './demo/demo-config';
import { createDemoClient } from './demo/demo-client';

let client: ReturnType<typeof createBrowserClient> | null = null;
let demoClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  // Modo demo: cliente falso sobre localStorage (ver src/modules/core/lib/demo).
  // Toda la app pasa por acá, así que con esto los hooks, mutaciones y el
  // AuthProvider trabajan contra la base local sin tocar Supabase.
  if (isDemoMode()) {
    if (!demoClient) demoClient = createDemoClient() as unknown as ReturnType<typeof createBrowserClient>;
    return demoClient;
  }
  if (client) return client;
  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return client;
}

export const supabase = getSupabaseBrowserClient;
