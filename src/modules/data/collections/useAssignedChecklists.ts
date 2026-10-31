import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { coalesce } from './realtime-sync';
import { logCollectionError } from './log';
import { AssignedSafetyTask } from '@/modules/core/lib/data';

export function useAssignedChecklists(tenantId: string | null | undefined) {
  const [data, setData] = useState<AssignedSafetyTask[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('assignedChecklists').select('*').order('createdAt', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as AssignedSafetyTask[]);
      else if (error) { logCollectionError('useAssignedChecklists', error); setData([]); }
    };

    fetchData();

    const refetch = coalesce(fetchData);

    const channel = sb
      .channel(`assignedChecklists-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignedChecklists', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, refetch)
      .subscribe();

    return () => { refetch.cancel(); sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
