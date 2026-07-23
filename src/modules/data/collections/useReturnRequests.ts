import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { ReturnRequest } from '@/modules/core/lib/data';

export function useReturnRequests(tenantId: string | null | undefined) {
  const [data, setData] = useState<ReturnRequest[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('returnRequests').select('*').order('createdAt', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as ReturnRequest[]);
      else if (error) { logCollectionError('useReturnRequests', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`returnRequests-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'returnRequests', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
