/**
 * Perfil de la empresa (tenant) que se estampa en los PDF.
 *
 * Antes, los 9 generadores traían el logo de `/logopdf.jpg` y algunos
 * escribían la razón social a mano, así que TODOS los tenants emitían
 * documentos con la marca de la misma constructora. Este módulo es la única
 * fuente de esos datos: los generadores lo consultan y, si el tenant no cargó
 * logo, simplemente no se dibuja ninguno (nunca el de otra empresa).
 *
 * Los datos se editan en `/dashboard/profile/empresa` y viven en la tabla
 * `tenants` (migración 016).
 */

import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';

export interface CompanyProfile {
  name: string;
  rut: string;
  giro: string;
  direccion: string;
  comuna: string;
  telefono: string;
  email: string;
  sitioWeb: string;
  /** Data URL del logo, o `null` si el tenant todavía no cargó uno. */
  logo: string | null;
  representanteLegal: string;
  representanteRut: string;
  representanteCargo: string;
  representanteSignature: string | null;
}

const EMPTY_PROFILE: CompanyProfile = {
  name: '',
  rut: '',
  giro: '',
  direccion: '',
  comuna: '',
  telefono: '',
  email: '',
  sitioWeb: '',
  logo: null,
  representanteLegal: '',
  representanteRut: '',
  representanteCargo: '',
  representanteSignature: null,
};

/** El logo puede pesar cientos de KB en base64 y un PDF se genera varias veces
 *  por sesión, así que la fila se cachea por tenant hasta que se edite. */
const cache = new Map<string, Promise<CompanyProfile>>();

function toProfile(row: Record<string, unknown> | null): CompanyProfile {
  if (!row) return EMPTY_PROFILE;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    name: str(row.name),
    rut: str(row.rut),
    giro: str(row.giro),
    direccion: str(row.direccion),
    comuna: str(row.comuna),
    telefono: str(row.telefono),
    email: str(row.email),
    sitioWeb: str(row.sitioWeb),
    logo: str(row.logo) || null,
    representanteLegal: str(row.representanteLegal),
    representanteRut: str(row.representanteRut),
    representanteCargo: str(row.representanteCargo),
    representanteSignature: str(row.representanteSignature) || null,
  };
}

/** Resuelve el tenant del usuario logueado cuando el llamador no lo pasa. */
async function resolveTenantId(): Promise<string | null> {
  const sb = getSupabaseBrowserClient();
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.user?.id) return null;
  const { data } = await sb
    .from('users')
    .select('tenantId')
    .eq('id', session.user.id)
    .single();
  return (data as { tenantId?: string } | null)?.tenantId ?? null;
}

/**
 * Datos de la empresa para la cabecera de un PDF. Nunca lanza: si algo falla
 * devuelve el perfil vacío y el documento sale sin marca, que es preferible a
 * no poder generarlo.
 */
export function getCompanyProfile(tenantId?: string | null): Promise<CompanyProfile> {
  const key = tenantId ?? '__session__';
  const cached = cache.get(key);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const id = tenantId ?? (await resolveTenantId());
      if (!id) return EMPTY_PROFILE;
      const sb = getSupabaseBrowserClient();
      const { data, error } = await sb.from('tenants').select('*').eq('id', id).single();
      if (error) throw error;
      return toProfile(data as Record<string, unknown>);
    } catch (err) {
      console.error('No se pudo cargar el perfil de la empresa para el PDF:', err);
      cache.delete(key); // que un fallo de red no quede cacheado para siempre
      return EMPTY_PROFILE;
    }
  })();

  cache.set(key, promise);
  return promise;
}

/** Llamar después de guardar en «Mi Empresa» para que el próximo PDF use los datos nuevos. */
export function invalidateCompanyProfile() {
  cache.clear();
}

/** «Av. Siempre Viva 742, Providencia» — omite las partes que falten. */
export function companyAddressLine(profile: CompanyProfile): string {
  return [profile.direccion, profile.comuna].filter(Boolean).join(', ');
}

/** «+56 9 1234 5678 · contacto@empresa.cl» — omite las partes que falten. */
export function companyContactLine(profile: CompanyProfile): string {
  return [profile.telefono, profile.email].filter(Boolean).join(' · ');
}
