/**
 * Vínculos entre empresas: invitar, aceptar y revocar.
 *
 * Aceptar NO es un `update` desde el cliente: va por la función
 * `accept_company_link` de la base (migración 027). Quien acepta todavía no
 * puede LEER la invitación —si pudiera buscarla, cualquiera podría listar
 * invitaciones ajenas—, así que el único camino es resolver el código exacto
 * del lado del servidor.
 */

import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import type { CompanyLink } from '@/modules/core/lib/data';

type Context = {
  user: any;
  tenantId: string | null | undefined;
  projectId?: string | null;
  db?: any;
};

/**
 * Crea la invitación y devuelve el código que hay que pasarle a la otra
 * empresa. El código lo genera la base, no el navegador: así no depende de la
 * calidad del azar del cliente ni de que dos pestañas generen el mismo.
 */
export async function createCompanyLink(
  data: { requesterName?: string | null; inviteNote?: string | null },
  { user, tenantId }: Context,
): Promise<CompanyLink> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();

  const { data: row, error } = await sb.from('companyLinks').insert({
    requesterTenantId: tenantId,
    requesterName: data.requesterName ?? null,
    inviteNote: data.inviteNote ?? null,
    status: 'pendiente',
    createdBy: user?.id ?? null,
  }).select('*').single();

  if (error) throw new Error(error.message);
  return row as CompanyLink;
}

/** Acepta una invitación con su código. Devuelve el id del vínculo. */
export async function acceptCompanyLink(
  data: { code: string; name?: string | null },
  { tenantId }: Context,
): Promise<string> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!data.code?.trim()) throw new Error('Escribe el código que te pasaron.');

  const sb = getSupabaseBrowserClient();
  const { data: id, error } = await sb.rpc('accept_company_link', {
    p_code: data.code.trim(),
    p_name: data.name ?? null,
  });

  if (error) throw new Error(error.message);
  return id as string;
}

/**
 * Corta el vínculo. No borra nada: el subcontrato y sus estados de pago siguen
 * siendo de la empresa que paga. Lo que se termina es el acceso de la otra
 * empresa, y se corta en el acto porque la base lo verifica en cada consulta.
 */
export async function revokeCompanyLink(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('companyLinks').update({
    status: 'revocado',
    respondedAt: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Descarta una invitación que nadie usó. */
export async function deleteCompanyLink(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('companyLinks').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
