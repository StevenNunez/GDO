import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { BehaviorObservation } from '@/modules/core/lib/data';

export function useBehaviorObservations(tenantId: string | null | undefined) {
  const [data, setData] = useState<BehaviorObservation[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('behaviorObservations').select('*').order('createdAt', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as BehaviorObservation[]);
      else if (error) { logCollectionError('useBehaviorObservations', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`behaviorObservations-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'behaviorObservations', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
