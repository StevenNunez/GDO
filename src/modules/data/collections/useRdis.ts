import { useEffect, useState } from 'react';
import { coalesce } from './realtime-sync';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { Rdi } from '@/modules/core/lib/data';

export function useRdis(tenantId: string | null | undefined) {
  const [data, setData] = useState<Rdi[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('rdis').select('*').order('number', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as Rdi[]);
      else if (error) { logCollectionError('useRdis', error); setData([]); }
    };

    fetchData();

    const refetch = coalesce(fetchData);

    const channel = sb
      .channel(`rdis-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rdis', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, refetch)
      .subscribe();

    return () => { refetch.cancel(); sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
