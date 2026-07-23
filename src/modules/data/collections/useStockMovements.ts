import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { StockMovement } from '@/modules/core/lib/data';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { applyRealtimeChange, byDateDesc } from './realtime-sync';

export function useStockMovements(tenantId: string | null | undefined, projectId: string | null) {
  const [data, setData] = useState<StockMovement[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const limit = tenantId !== null ? 200 : 100;
    // The channel filters by tenantId; narrow to the selected project client-side
    // (only meaningful for a real tenant with a project selected).
    const syncOpts = {
      predicate: (r: StockMovement) =>
        tenantId !== null && projectId ? r.projectId === projectId : true,
      compare: byDateDesc<StockMovement>('date'),
      limit,
    };

    const fetchData = async () => {
      let q = sb.from('stockMovements').select('*').order('date', { ascending: false });
      if (tenantId !== null) {
        q = q.eq('tenantId', tenantId);
        if (projectId) q = q.eq('projectId', projectId);
      }
      q = q.limit(limit);
      const { data: result, error } = await q;
      if (!error && result) setData(result as StockMovement[]);
      else if (error) { logCollectionError('useStockMovements', error); setData([]); }
    };

    fetchData();

    let hasSubscribed = false;
    const channel = sb
      .channel(`stockMovements-${tenantId}-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stockMovements', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) },
        (payload: RealtimePostgresChangesPayload<StockMovement>) => setData(prev => applyRealtimeChange(prev, payload, syncOpts)))
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          if (hasSubscribed) fetchData(); // reconnect → full resync
          hasSubscribed = true;
        }
      });

    return () => { sb.removeChannel(channel); };
  }, [tenantId, projectId]);

  return data;
}
