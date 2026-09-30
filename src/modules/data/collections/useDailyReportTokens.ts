import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { DailyReportToken } from '@/modules/core/lib/data';

export function useDailyReportTokens(tenantId: string | null | undefined) {
  const [data, setData] = useState<DailyReportToken[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('dailyReportTokens').select('*').order('validFor', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as DailyReportToken[]);
      else if (error) { logCollectionError('useDailyReportTokens', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`dailyReportTokens-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dailyReportTokens', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
