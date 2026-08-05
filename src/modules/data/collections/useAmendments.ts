import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { Amendment } from '@/modules/core/lib/data';

export function useAmendments(tenantId: string | null | undefined) {
  const [data, setData] = useState<Amendment[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('amendments').select('*').order('number', { ascending: true });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as Amendment[]);
      else if (error) { logCollectionError('useAmendments', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`amendments-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'amendments', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
