import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { fetchAllRows } from './fetch-all';
import { Apu } from '@/modules/core/lib/data';

/** APU: los de la biblioteca (isTemplate) y los propios de cada partida. */
export function useApus(tenantId: string | null | undefined) {
  const [data, setData] = useState<Apu[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      try {
        const rows = await fetchAllRows<Apu>((from, to) => {
          let q = sb.from('apus').select('*').order('name').order('id', { ascending: true }).range(from, to);
          if (tenantId !== null) q = q.eq('tenantId', tenantId);
          return q;
        });
        setData(rows);
      } catch (error) {
        logCollectionError('useApus', error);
        setData([]);
      }
    };

    fetchData();

    const channel = sb
      .channel(`apus-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'apus', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
