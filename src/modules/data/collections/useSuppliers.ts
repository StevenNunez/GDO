import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { Supplier } from '@/modules/core/lib/data';

export function useSuppliers(tenantId: string | null | undefined) {
  const [data, setData] = useState<Supplier[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('suppliers').select('*').order('name');
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as Supplier[]);
      else if (error) { logCollectionError('useSuppliers', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`suppliers-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
