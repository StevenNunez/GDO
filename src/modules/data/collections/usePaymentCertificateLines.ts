import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { PaymentCertificateLine } from '@/modules/core/lib/data';

/**
 * Detalle de los estados de pago. Se traen todas las del tenant porque para
 * armar un EEPP nuevo hay que saber qué cantidad ya se cobró de cada partida en
 * los anteriores (ver `cantidadesCobradas`), no solo las del EEPP abierto.
 */
export function usePaymentCertificateLines(tenantId: string | null | undefined) {
  const [data, setData] = useState<PaymentCertificateLine[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('paymentCertificateLines').select('*').order('sortOrder', { ascending: true });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as PaymentCertificateLine[]);
      else if (error) { logCollectionError('usePaymentCertificateLines', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`paymentCertificateLines-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'paymentCertificateLines', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
