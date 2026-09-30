import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { WorkUnit } from '@/modules/core/lib/data';

export function useWorkUnits(tenantId: string | null | undefined) {
  const [data, setData] = useState<WorkUnit[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('workUnits').select('*').order('sortOrder', { ascending: true });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as WorkUnit[]);
      else if (error) { logCollectionError('useWorkUnits', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`workUnits-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workUnits', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
