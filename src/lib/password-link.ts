import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SITE_URL } from '@/lib/site-url';

/**
 * Enlace de un solo uso para que una persona elija su contraseña.
 *
 * Lo genera Supabase (`generateLink` tipo `recovery`) pero NO se usa el enlace
 * que él devuelve: ese pasa por la configuración «Site URL» de Supabase y, si
 * quedó en localhost, lleva a localhost. Se toma solo el `hashed_token` y se
 * arma el enlace propio, que siempre apunta a nuestro dominio y se canjea en
 * /nueva-contrasena. Devuelve null si no se pudo generar (no tumba a quien llama).
 */
export async function crearEnlaceClave(adminSb: SupabaseClient, email: string): Promise<string | null> {
  try {
    const { data, error } = await adminSb.auth.admin.generateLink({ type: 'recovery', email });
    const token = data?.properties?.hashed_token;
    if (error || !token) return null;
    return `${SITE_URL}/nueva-contrasena?token=${encodeURIComponent(token)}`;
  } catch {
    return null;
  }
}
