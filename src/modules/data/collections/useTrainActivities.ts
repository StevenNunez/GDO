import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { TrainActivity } from '@/modules/core/lib/data';

export function useTrainActivities(tenantId: string | null | undefined) {
  const [data, setData] = useState<TrainActivity[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('trainActivities').select('*').order('sortOrder', { ascending: true });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as TrainActivity[]);
      else if (error) { logCollectionError('useTrainActivities', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`trainActivities-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trainActivities', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
