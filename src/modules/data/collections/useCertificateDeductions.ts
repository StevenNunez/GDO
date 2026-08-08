import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { CertificateDeduction } from '@/modules/core/lib/data';

/**
 * Sin filtro de `tenantId`: el subcontratista invitado ve los descuentos de SU
 * estado de pago aunque la fila sea de la otra empresa (migración 034, misma
 * lógica que las 4 colecciones de subcontrato). Quién ve qué lo decide la RLS.
 */
export function useCertificateDeductions(tenantId: string | null | undefined) {
  const [data, setData] = useState<CertificateDeduction[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      const { data: result, error } = await sb
        .from('certificateDeductions').select('*').order('createdAt', { ascending: true });
      if (!error && result) setData(result as CertificateDeduction[]);
      else if (error) { logCollectionError('useCertificateDeductions', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`certificateDeductions-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'certificateDeductions' }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
