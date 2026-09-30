import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { DailyProgress } from '@/modules/core/lib/data';

export function useDailyProgress(tenantId: string | null | undefined) {
  const [data, setData] = useState<DailyProgress[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();
    let cancelled = false;
    let request = 0;

    const fetchData = async () => {
      const current = ++request;
      const reports: DailyProgress[] = [];
      for (let offset = 0; ; offset += 500) {
        let q = sb.from('dailyProgress').select('*').order('date', { ascending: false }).order('id').range(offset, offset + 499);
        if (tenantId !== null) q = q.eq('tenantId', tenantId);
        const { data: result, error } = await q;
        if (cancelled || current !== request) return;
        if (error) { logCollectionError('useDailyProgress', error); return; }
        reports.push(...((result ?? []) as DailyProgress[]));
        if (!result || result.length < 500) break;
      }
      if (!cancelled && current === request) setData(reports);
    };

    fetchData();

    const channel = sb
      .channel(`dailyProgress-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dailyProgress', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { cancelled = true; sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
