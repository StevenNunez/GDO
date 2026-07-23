import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { ProgressLog } from '@/modules/core/lib/data';

export function useProgressLogs(tenantId: string | null | undefined) {
  const [data, setData] = useState<ProgressLog[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('progressLogs').select('*').order('date', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as ProgressLog[]);
      else if (error) { logCollectionError('useProgressLogs', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`progressLogs-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'progressLogs', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
