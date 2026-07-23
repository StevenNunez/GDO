import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { Budget } from '@/modules/core/lib/data';

/**
 * Presupuestos de la obra activa. A diferencia de otras colecciones NO se filtra
 * por `currentProjectId`: el control de gastos por cliente necesita los
 * presupuestos de todas las obras del tenant para poder consolidar.
 */
export function useBudgets(tenantId: string | null | undefined) {
  const [data, setData] = useState<Budget[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('budgets').select('*').order('createdAt', { ascending: true });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as Budget[]);
      else if (error) { logCollectionError('useBudgets', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`budgets-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budgets', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
