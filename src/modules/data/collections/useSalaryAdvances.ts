import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { SalaryAdvance } from '@/modules/core/lib/data';

export function useSalaryAdvances(tenantId: string | null | undefined) {
  const [data, setData] = useState<SalaryAdvance[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('salaryAdvances').select('*').order('requestedAt', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as SalaryAdvance[]);
      else if (error) { logCollectionError('useSalaryAdvances', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`salaryAdvances-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'salaryAdvances', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
