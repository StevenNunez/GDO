import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { PurchaseOrder } from '@/modules/core/lib/data';

export function usePurchaseOrders(tenantId: string | null | undefined) {
  const [data, setData] = useState<PurchaseOrder[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('purchaseOrders').select('*').order('createdAt', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as PurchaseOrder[]);
      else if (error) { logCollectionError('usePurchaseOrders', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`purchaseOrders-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchaseOrders', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
