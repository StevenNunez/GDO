import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { Unit } from '@/modules/core/lib/data';

export function useUnits(tenantId: string | null | undefined) {
  const [data, setData] = useState<Unit[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('units').select('*').order('name');
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as Unit[]);
      else if (error) { logCollectionError('useUnits', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`units-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'units', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
