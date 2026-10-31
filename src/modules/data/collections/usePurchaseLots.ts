import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { coalesce } from './realtime-sync';
import { logCollectionError } from './log';
import { PurchaseLot } from '@/modules/core/lib/data';

export function usePurchaseLots(tenantId: string | null | undefined) {
  const [data, setData] = useState<PurchaseLot[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('purchaseLots').select('*').order('createdAt', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as PurchaseLot[]);
      else if (error) { logCollectionError('usePurchaseLots', error); setData([]); }
    };

    fetchData();

    const refetch = coalesce(fetchData);

    const channel = sb
      .channel(`purchaseLots-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchaseLots', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, refetch)
      .subscribe();

    return () => { refetch.cancel(); sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
