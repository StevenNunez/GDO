import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { ContractorDocumentType } from '@/modules/core/lib/data';

export function useContractorDocumentTypes(tenantId: string | null | undefined) {
  const [data, setData] = useState<ContractorDocumentType[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('contractorDocumentTypes').select('*').order('sortOrder', { ascending: true });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as ContractorDocumentType[]);
      else if (error) { logCollectionError('useContractorDocumentTypes', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`contractorDocumentTypes-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contractorDocumentTypes', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
