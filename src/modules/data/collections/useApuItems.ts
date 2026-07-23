import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { fetchAllRows } from './fetch-all';
import { ApuItem } from '@/modules/core/lib/data';

/** Lineas de todos los APU. Se agrupan por apuId en memoria. */
export function useApuItems(tenantId: string | null | undefined) {
  const [data, setData] = useState<ApuItem[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      try {
        const rows = await fetchAllRows<ApuItem>((from, to) => {
          let q = sb.from('apuItems').select('*').order('sortOrder').order('id', { ascending: true }).range(from, to);
          if (tenantId !== null) q = q.eq('tenantId', tenantId);
          return q;
        });
        setData(rows);
      } catch (error) {
        logCollectionError('useApuItems', error);
        setData([]);
      }
    };

    fetchData();

    const channel = sb
      .channel(`apuItems-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'apuItems', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
