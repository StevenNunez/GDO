import { useEffect, useState } from 'react';
import { coalesce } from './realtime-sync';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { fetchAllRows } from './fetch-all';
import { Resource } from '@/modules/core/lib/data';

/** Catalogo de recursos con precio (materiales, mano de obra HH, equipos HM). */
export function useResources(tenantId: string | null | undefined) {
  const [data, setData] = useState<Resource[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      try {
        const rows = await fetchAllRows<Resource>((from, to) => {
          let q = sb.from('resources').select('*').order('name').order('id', { ascending: true }).range(from, to);
          if (tenantId !== null) q = q.eq('tenantId', tenantId);
          return q;
        });
        setData(rows);
      } catch (error) {
        logCollectionError('useResources', error);
        setData([]);
      }
    };

    fetchData();

    const refetch = coalesce(fetchData);

    const channel = sb
      .channel(`resources-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resources', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, refetch)
      .subscribe();

    return () => { refetch.cancel(); sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
