/**
 * Cupo de correos compartido entre todas las instancias del servidor.
 *
 * El rate-limit en memoria (`rate-limit.ts`) no sirve solo: en Vercel cada
 * instancia tiene su propio contador. Acá el conteo vive en la tabla
 * `mailSendLog` (migración 042), así que el tope es el mismo para todos.
 *
 * Si la tabla todavía no existe (migración sin correr) o la consulta falla, el
 * envío NO se bloquea: dejar a un cliente sin poder mandar documentos es peor
 * que un límite flojo por unos días. El rate-limit en memoria sigue activo.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const LIMITE_POR_USUARIO_HORA = 30;
export const LIMITE_POR_EMPRESA_DIA = 150;

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

export interface ResultadoCuota {
  allowed: boolean;
  error?: string;
}

/** Decisión pura, para poder probarla sin base de datos. */
export function evaluarCuota(conteo: { usuarioHora: number; empresaDia: number }): ResultadoCuota {
  if (conteo.usuarioHora >= LIMITE_POR_USUARIO_HORA) {
    return { allowed: false, error: 'Enviaste demasiados documentos en la última hora. Intenta más tarde.' };
  }
  if (conteo.empresaDia >= LIMITE_POR_EMPRESA_DIA) {
    return { allowed: false, error: 'Tu empresa alcanzó el máximo de correos de hoy. Intenta mañana o escríbenos.' };
  }
  return { allowed: true };
}

/** Revisa la cuota y, si hay cupo, registra el envío. `sb` = cliente con clave de servicio. */
export async function reservarEnvioCorreo(
  sb: SupabaseClient,
  userId: string,
  tenantId: string | null,
  kind: 'document' | 'payment-order',
): Promise<ResultadoCuota> {
  try {
    const desdeHora = new Date(Date.now() - HORA_MS).toISOString();
    const desdeDia = new Date(Date.now() - DIA_MS).toISOString();

    const porUsuario = await sb.from('mailSendLog')
      .select('id', { count: 'exact', head: true })
      .eq('userId', userId).gte('createdAt', desdeHora);
    if (porUsuario.error) throw porUsuario.error;

    let empresaDia = 0;
    if (tenantId) {
      const porEmpresa = await sb.from('mailSendLog')
        .select('id', { count: 'exact', head: true })
        .eq('tenantId', tenantId).gte('createdAt', desdeDia);
      if (porEmpresa.error) throw porEmpresa.error;
      empresaDia = porEmpresa.count ?? 0;
    }

    const veredicto = evaluarCuota({ usuarioHora: porUsuario.count ?? 0, empresaDia });
    if (!veredicto.allowed) return veredicto;

    const ins = await sb.from('mailSendLog').insert({ userId, tenantId, kind });
    if (ins.error) throw ins.error;
    return { allowed: true };
  } catch (e) {
    console.warn('[mail-quota] sin cuota compartida (¿migración 042?):', (e as Error)?.message);
    return { allowed: true };
  }
}
