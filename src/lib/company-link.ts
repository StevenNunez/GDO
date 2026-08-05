/**
 * Vínculos entre empresas: la constructora y el subcontratista que trabaja con
 * su propia cuenta.
 *
 * Lógica pura, sin React ni acceso a datos (`company-link.test.ts`).
 *
 * Lo que hay que tener claro leyendo esto: **el vínculo no copia datos**. Da
 * acceso a un subcontrato puntual mientras está aceptado, y la base lo verifica
 * en cada consulta (migración 027). Si se revoca, el acceso se corta en el acto
 * — no queda una copia del otro lado.
 */

import type { CompanyLink, Subcontract } from '@/modules/core/lib/data';

/** Vínculos vivos: los únicos que dan acceso. */
export function esVinculoActivo(link: Pick<CompanyLink, 'status'>): boolean {
  return link.status === 'aceptado';
}

/**
 * La otra empresa del vínculo, mirado desde `miTenantId`. `null` si el vínculo
 * todavía no lo aceptó nadie.
 */
export function contraparte(
  link: CompanyLink,
  miTenantId: string | null | undefined,
): { tenantId: string; nombre: string | null } | null {
  if (!miTenantId) return null;

  if (link.requesterTenantId === miTenantId) {
    return link.addresseeTenantId
      ? { tenantId: link.addresseeTenantId, nombre: link.addresseeName ?? null }
      : null;
  }
  if (link.addresseeTenantId === miTenantId) {
    return { tenantId: link.requesterTenantId, nombre: link.requesterName ?? null };
  }
  return null;
}

/** ¿Fui yo quien invitó? Cambia qué acciones tiene sentido ofrecer. */
export function soyElQueInvita(
  link: CompanyLink,
  miTenantId: string | null | undefined,
): boolean {
  return !!miTenantId && link.requesterTenantId === miTenantId;
}

/** Empresas con las que puedo trabajar hoy, sin repetir. */
export function empresasVinculadas(
  links: CompanyLink[],
  miTenantId: string | null | undefined,
): { tenantId: string; nombre: string | null }[] {
  const vistas = new Map<string, { tenantId: string; nombre: string | null }>();

  for (const l of links) {
    if (!esVinculoActivo(l)) continue;
    const otra = contraparte(l, miTenantId);
    if (otra && !vistas.has(otra.tenantId)) vistas.set(otra.tenantId, otra);
  }

  return [...vistas.values()];
}

/** Invitaciones que emití y nadie ha usado todavía. */
export function invitacionesPendientes(
  links: CompanyLink[],
  miTenantId: string | null | undefined,
): CompanyLink[] {
  return links.filter((l) => l.status === 'pendiente' && soyElQueInvita(l, miTenantId));
}

/* ── Subcontratos vistos desde cada lado ──────────────────────────────── */

/**
 * Subcontratos en los que actúo COMO SUBCONTRATISTA. Son dos casos:
 *  · soy el contacto designado dentro de la empresa que me contrató, o
 *  · el subcontrato es de otra empresa y la contraparte es la mía.
 *
 * La base ya filtra lo que puedo ver; esto separa "lo que yo ejecuto" de "lo
 * que yo contrato", que en la misma pantalla serían dos cosas muy distintas.
 */
export function misSubcontratos(
  subcontracts: Subcontract[],
  miTenantId: string | null | undefined,
  miUserId: string | null | undefined,
): Subcontract[] {
  return subcontracts.filter((s) => (
    (!!miUserId && s.tenantId === miTenantId && s.contactUserId === miUserId)
    || (!!miTenantId && s.counterpartTenantId === miTenantId && s.tenantId !== miTenantId)
  ));
}

/** Subcontratos que YO contraté: los que paga mi empresa. */
export function subcontratosQueContrato(
  subcontracts: Subcontract[],
  miTenantId: string | null | undefined,
): Subcontract[] {
  return subcontracts.filter((s) => s.tenantId === miTenantId);
}

/** El subcontrato lo lleva otra empresa desde su propia cuenta. */
export function esDeOtraEmpresa(
  subcontract: Pick<Subcontract, 'tenantId'>,
  miTenantId: string | null | undefined,
): boolean {
  return !!miTenantId && subcontract.tenantId !== miTenantId;
}

/* ── Etiquetas ────────────────────────────────────────────────────────── */

export const ESTADOS_VINCULO: Record<CompanyLink['status'], string> = {
  pendiente: 'Esperando que la acepten',
  aceptado: 'Vinculada',
  rechazado: 'Rechazada',
  revocado: 'Revocada',
};
