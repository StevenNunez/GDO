import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { fetchAllRows } from './fetch-all';
import { BudgetOverhead } from '@/modules/core/lib/data';

/** Gastos generales detallados de cada presupuesto. */
export function useBudgetOverheads(tenantId: string | null | undefined) {
  const [data, setData] = useState<BudgetOverhead[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      try {
        const rows = await fetchAllRows<BudgetOverhead>((from, to) => {
          let q = sb.from('budgetOverheads').select('*').order('sortOrder').order('id', { ascending: true }).range(from, to);
          if (tenantId !== null) q = q.eq('tenantId', tenantId);
          return q;
        });
        setData(rows);
      } catch (error) {
        logCollectionError('useBudgetOverheads', error);
        setData([]);
      }
    };

    fetchData();

    const channel = sb
      .channel(`budgetOverheads-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budgetOverheads', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
