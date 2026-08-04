import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { PaymentCertificate } from '@/modules/core/lib/data';

export function usePaymentCertificates(tenantId: string | null | undefined) {
  const [data, setData] = useState<PaymentCertificate[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('paymentCertificates').select('*').order('number', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as PaymentCertificate[]);
      else if (error) { logCollectionError('usePaymentCertificates', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`paymentCertificates-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'paymentCertificates', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
