import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { LookaheadTask } from '@/modules/core/lib/data';

export function useLookaheadTasks(tenantId: string | null | undefined) {
  const [data, setData] = useState<LookaheadTask[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('lookaheadTasks').select('*').order('weekStart', { ascending: true });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as LookaheadTask[]);
      else if (error) { logCollectionError('useLookaheadTasks', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`lookaheadTasks-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lookaheadTasks', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
