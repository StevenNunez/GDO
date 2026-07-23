import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { fetchAllRows } from './fetch-all';
import { PurchaseRequest } from '@/modules/core/lib/data';

/** Tope solo para la vista global del super-admin (todos los tenants a la vez). */
const SUPERADMIN_GLOBAL_LIMIT = 100;

/**
 * Solicitudes de compra de la obra activa.
 *
 * Se traen TODAS paginando. Antes había un `.limit(200)` sobre el orden por
 * fecha descendente, o sea "las 200 más recientes": una solicitud PENDIENTE más
 * antigua que esas 200 desaparecía de la cola de aprobación y del contador de
 * la campana. Se perdían aprobaciones sin que nadie lo notara.
 *
 * El orden secundario por `id` hace la paginación determinista: con solo
 * `createdAt` los empates pueden repetir u omitir filas entre páginas.
 */
export function usePurchaseRequests(tenantId: string | null | undefined, projectId: string | null) {
  const [data, setData] = useState<PurchaseRequest[] | undefined>(undefined);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      try {
        if (tenantId === null) {
          const { data: result, error } = await sb
            .from('purchaseRequests')
            .select('*')
            .order('createdAt', { ascending: false })
            .limit(SUPERADMIN_GLOBAL_LIMIT);
          if (error) throw error;
          setData((result ?? []) as PurchaseRequest[]);
          return;
        }

        const rows = await fetchAllRows<PurchaseRequest>((from, to) => {
          let q = sb.from('purchaseRequests').select('*')
            .eq('tenantId', tenantId)
            .order('createdAt', { ascending: false })
            .order('id', { ascending: true })
            .range(from, to);
          if (projectId) q = q.eq('projectId', projectId);
          return q;
        });
        setData(rows);
      } catch (error) {
        logCollectionError('usePurchaseRequests', error);
        setData([]);
      }
    };

    fetchData();

    const channel = sb
      .channel(`purchaseRequests-${tenantId}-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchaseRequests', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId, projectId]);

  return data;
}
