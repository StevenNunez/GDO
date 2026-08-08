import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { PaymentOrder } from '@/modules/core/lib/data';

/**
 * Sin filtro de `tenantId`: el subcontratista invitado ve la orden con la que
 * se le paga aunque la fila sea de la otra empresa (migración 035). Quién ve
 * qué lo decide la RLS.
 */
export function usePaymentOrders(tenantId: string | null | undefined) {
  const [data, setData] = useState<PaymentOrder[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      const { data: result, error } = await sb
        .from('paymentOrders').select('*').order('number', { ascending: false });
      if (!error && result) setData(result as PaymentOrder[]);
      else if (error) { logCollectionError('usePaymentOrders', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`paymentOrders-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'paymentOrders' }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
