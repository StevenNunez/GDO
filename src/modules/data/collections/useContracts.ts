import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { Contract } from '@/modules/core/lib/data';

export function useContracts(tenantId: string | null | undefined) {
  const [data, setData] = useState<Contract[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('contracts').select('*').order('createdAt', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as Contract[]);
      else if (error) { logCollectionError('useContracts', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`contracts-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contracts', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
