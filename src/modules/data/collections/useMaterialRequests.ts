import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { MaterialRequest } from '@/modules/core/lib/data';

export function useMaterialRequests(tenantId: string | null | undefined, projectId: string | null) {
  const [data, setData] = useState<MaterialRequest[] | undefined>(undefined);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('materialRequests').select('*').order('createdAt', { ascending: false });
      if (tenantId !== null) {
        q = q.eq('tenantId', tenantId);
        if (projectId) q = q.eq('projectId', projectId);
      }
      const { data: result, error } = await q;
      if (!error && result) setData(result as MaterialRequest[]);
      else if (error) { logCollectionError('useMaterialRequests', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`materialRequests-${tenantId}-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'materialRequests', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId, projectId]);

  return data;
}
