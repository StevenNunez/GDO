import { useEffect, useState } from 'react';
import { coalesce } from './realtime-sync';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { WorkCalendarException } from '@/modules/core/lib/data';

export function useWorkCalendarExceptions(tenantId: string | null | undefined) {
  const [data, setData] = useState<WorkCalendarException[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('workCalendarExceptions').select('*').order('date', { ascending: true });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as WorkCalendarException[]);
      else if (error) { logCollectionError('useWorkCalendarExceptions', error); setData([]); }
    };

    fetchData();

    const refetch = coalesce(fetchData);

    const channel = sb
      .channel(`workCalendarExceptions-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workCalendarExceptions', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, refetch)
      .subscribe();

    return () => { refetch.cancel(); sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
