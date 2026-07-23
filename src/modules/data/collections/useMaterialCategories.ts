import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { MaterialCategory } from '@/modules/core/lib/data';

export function useMaterialCategories(tenantId: string | null | undefined) {
  const [data, setData] = useState<MaterialCategory[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('materialCategories').select('*').order('name');
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as MaterialCategory[]);
      else if (error) { logCollectionError('useMaterialCategories', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`materialCategories-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'materialCategories', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
