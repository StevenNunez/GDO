/**
 * Arriendos de equipos y maquinaria (migración 036).
 *
 * El estado y la fecha de devolución los sincroniza un trigger: poner fecha
 * marca «devuelto», y marcar «devuelto» sin fecha la pone en hoy. Acá no se
 * repite esa regla — dos versiones de la misma sincronización terminan
 * discrepando.
 */

import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { validarArriendo } from '@/lib/equipment';
import type { EquipmentRental } from '@/modules/core/lib/data';

type Context = {
  user: any;
  tenantId: string | null | undefined;
  projectId?: string | null;
  db?: any;
};

export async function addEquipmentRental(
  data: Partial<EquipmentRental>,
  { user, tenantId, projectId }: Context,
): Promise<string> {
  if (!tenantId) throw new Error('Inquilino no válido.');

  const errores = validarArriendo({
    name: data.name ?? '',
    rate: data.rate ?? 0,
    rateMode: data.rateMode ?? 'dia',
    hoursPerDay: data.hoursPerDay ?? null,
    startDate: data.startDate as Date,
    endDate: (data.endDate ?? null) as Date | null,
  });
  if (errores.length > 0) throw new Error(errores[0]);

  const sb = getSupabaseBrowserClient();
  const { data: row, error } = await sb.from('equipmentRentals').insert({
    category: 'otro',
    rateMode: 'dia',
    currency: 'CLP',
    status: 'activo',
    projectId: data.projectId ?? projectId ?? null,
    ...data,
    name: data.name!.trim(),
    createdBy: user?.id ?? null,
    tenantId,
  }).select('id').single();

  if (error) throw new Error(traducir(error.message));
  return row.id as string;
}

export async function updateEquipmentRental(
  id: string,
  data: Partial<EquipmentRental>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('equipmentRentals').update(data).eq('id', id);
  if (error) throw new Error(traducir(error.message));
}

/**
 * Devuelve el equipo. A partir de esta fecha deja de correr el costo, que es
 * todo el punto del módulo.
 */
export async function returnEquipmentRental(
  id: string,
  returnedAt: string | null,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('equipmentRentals').update({
    returnedAt: returnedAt ?? new Date().toISOString().slice(0, 10),
    status: 'devuelto',
  }).eq('id', id);
  if (error) throw new Error(traducir(error.message));
}

export async function deleteEquipmentRental(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('equipmentRentals').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

function traducir(mensaje: string): string {
  if (mensaje.includes('equipment_rental_dates')) {
    return 'La fecha de término no puede ser anterior a la de inicio.';
  }
  if (mensaje.includes('equipment_rental_return_after_start')) {
    return 'No se puede devolver un equipo antes de que empiece el arriendo.';
  }
  return mensaje;
}
