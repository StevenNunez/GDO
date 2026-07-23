import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { fetchAllRows } from './fetch-all';
import { WorkItem } from '@/modules/core/lib/data';

/**
 * Partidas EDT de todo el tenant.
 *
 * NO se filtra por `currentProjectId` a propósito: el control de gastos por
 * cliente consolida varias obras a la vez, y además el `projectId` de la partida
 * es dato heredado poco confiable — la obra se resuelve por `budgetId` →
 * `budgets.projectId`.
 *
 * Se traen TODAS las filas paginando. Antes había un `.limit(200)` sin `order`,
 * así que con más de 200 partidas se perdían unas cuantas al azar y los montos
 * del presupuesto quedaban incompletos sin ningún aviso.
 */
export function useWorkItems(tenantId: string | null | undefined) {
  const [data, setData] = useState<WorkItem[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      try {
        const rows = await fetchAllRows<WorkItem>((from, to) => {
          let q = sb.from('workItems').select('*').order('id', { ascending: true }).range(from, to);
          if (tenantId !== null) q = q.eq('tenantId', tenantId);
          return q;
        });
        setData(rows);
      } catch (error) {
        logCollectionError('useWorkItems', error);
        setData([]);
      }
    };

    fetchData();

    const channel = sb
      .channel(`workItems-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workItems', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
