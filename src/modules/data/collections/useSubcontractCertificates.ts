import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { SubcontractCertificate } from '@/modules/core/lib/data';

/**
 * Sin filtro de `tenantId` a propósito: un subcontrato puede pertenecer a OTRA
 * empresa que declaró a la mía como contraparte (migración 027). Quién ve qué
 * lo decide la RLS, que para eso exige vínculo aceptado y permiso de portal.
 * El canal tampoco filtra: su handler solo dispara un refetch, y ese refetch sí
 * pasa por RLS.
 */
export function useSubcontractCertificates(tenantId: string | null | undefined) {
  const [data, setData] = useState<SubcontractCertificate[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      const q = sb.from('subcontractCertificates').select('*').order('number', { ascending: false });
      const { data: result, error } = await q;
      if (!error && result) setData(result as SubcontractCertificate[]);
      else if (error) { logCollectionError('useSubcontractCertificates', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`subcontractCertificates-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subcontractCertificates' }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
