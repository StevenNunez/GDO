import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { SubcontractQuote } from '@/modules/core/lib/data';

export function useSubcontractQuotes(tenantId: string | null | undefined) {
  const [data, setData] = useState<SubcontractQuote[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('subcontractQuotes').select('*').order('createdAt', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as SubcontractQuote[]);
      else if (error) { logCollectionError('useSubcontractQuotes', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`subcontractQuotes-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subcontractQuotes', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
