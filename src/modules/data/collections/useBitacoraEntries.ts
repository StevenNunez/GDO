import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { BitacoraEntry } from '@/modules/core/lib/data';

export function useBitacoraEntries(tenantId: string | null | undefined) {
  const [data, setData] = useState<BitacoraEntry[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('bitacoraEntries').select('*').order('date', { ascending: false }).order('createdAt', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as BitacoraEntry[]);
      else if (error) { logCollectionError('useBitacoraEntries', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`bitacoraEntries-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bitacoraEntries', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
