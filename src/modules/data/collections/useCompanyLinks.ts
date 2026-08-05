import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { CompanyLink } from '@/modules/core/lib/data';

/**
 * Vínculos con otras empresas. No se filtra por `tenantId` como el resto: un
 * vínculo tiene DOS empresas, y la mía puede estar en cualquiera de los dos
 * lados. La RLS de `companyLinks` aplica exactamente el mismo criterio.
 */
export function useCompanyLinks(tenantId: string | null | undefined) {
  const [data, setData] = useState<CompanyLink[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('companyLinks').select('*').order('createdAt', { ascending: false });
      if (tenantId !== null) {
        q = q.or(`requesterTenantId.eq.${tenantId},addresseeTenantId.eq.${tenantId}`);
      }
      const { data: result, error } = await q;
      if (!error && result) setData(result as CompanyLink[]);
      else if (error) { logCollectionError('useCompanyLinks', error); setData([]); }
    };

    fetchData();

    // Sin filtro de tenant en el canal por la misma razón; el handler solo
    // dispara un refetch, que sí pasa por RLS.
    const channel = sb
      .channel(`companyLinks-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'companyLinks' }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
