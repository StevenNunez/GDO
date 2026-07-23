import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { DailyTalk } from '@/modules/core/lib/data';

export function useDailyTalks(tenantId: string | null | undefined) {
  const [data, setData] = useState<DailyTalk[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('dailyTalks').select('*').order('createdAt', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as DailyTalk[]);
      else if (error) { logCollectionError('useDailyTalks', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`dailyTalks-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dailyTalks', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
