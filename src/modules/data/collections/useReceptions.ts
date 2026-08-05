import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { Reception } from '@/modules/core/lib/data';

export function useReceptions(tenantId: string | null | undefined) {
  const [data, setData] = useState<Reception[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('receptions').select('*').order('createdAt', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as Reception[]);
      else if (error) { logCollectionError('useReceptions', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`receptions-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receptions', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
