import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { SubcontractItem } from '@/modules/core/lib/data';

/**
 * Sin filtro de `tenantId` a propósito: un subcontrato puede pertenecer a OTRA
 * empresa que declaró a la mía como contraparte (migración 027). Quién ve qué
 * lo decide la RLS, que para eso exige vínculo aceptado y permiso de portal.
 * El canal tampoco filtra: su handler solo dispara un refetch, y ese refetch sí
 * pasa por RLS.
 */
export function useSubcontractItems(tenantId: string | null | undefined) {
  const [data, setData] = useState<SubcontractItem[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      const q = sb.from('subcontractItems').select('*').order('sortOrder', { ascending: true });
      const { data: result, error } = await q;
      if (!error && result) setData(result as SubcontractItem[]);
      else if (error) { logCollectionError('useSubcontractItems', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`subcontractItems-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subcontractItems' }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
