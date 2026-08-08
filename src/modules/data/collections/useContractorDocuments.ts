import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { ContractorDocument } from '@/modules/core/lib/data';

export function useContractorDocuments(tenantId: string | null | undefined) {
  const [data, setData] = useState<ContractorDocument[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('contractorDocuments').select('*').order('createdAt', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as ContractorDocument[]);
      else if (error) { logCollectionError('useContractorDocuments', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`contractorDocuments-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contractorDocuments', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
