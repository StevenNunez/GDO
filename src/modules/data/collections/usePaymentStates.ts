import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { PaymentState } from '@/modules/core/lib/data';

export function usePaymentStates(tenantId: string | null | undefined) {
  const [data, setData] = useState<PaymentState[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('paymentStates').select('*').order('createdAt', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as PaymentState[]);
      else if (error) { logCollectionError('usePaymentStates', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`paymentStates-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'paymentStates', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
