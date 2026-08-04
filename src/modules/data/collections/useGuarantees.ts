import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { Guarantee } from '@/modules/core/lib/data';

export function useGuarantees(tenantId: string | null | undefined) {
  const [data, setData] = useState<Guarantee[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('guarantees').select('*').order('expiryDate', { ascending: true });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as Guarantee[]);
      else if (error) { logCollectionError('useGuarantees', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`guarantees-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guarantees', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
