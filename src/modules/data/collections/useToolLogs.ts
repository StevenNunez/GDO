import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { ToolLog } from '@/modules/core/lib/data';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { applyRealtimeChange, byDateDesc } from './realtime-sync';

export function useToolLogs(tenantId: string | null | undefined) {
  const [toolLogs, setToolLogs] = useState<ToolLog[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const syncOpts = { compare: byDateDesc<ToolLog>('checkoutDate'), limit: 500 };

    const fetchData = async () => {
      let q = sb.from('toolLogs').select('*').order('checkoutDate', { ascending: false }).limit(500);
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data, error } = await q;
      if (!error && data) setToolLogs(data as ToolLog[]);
      else if (error) { logCollectionError('useToolLogs', error); setToolLogs([]); }
    };

    fetchData();

    let hasSubscribed = false;
    const channel = sb
      .channel(`toolLogs-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'toolLogs', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) },
        (payload: RealtimePostgresChangesPayload<ToolLog>) => setToolLogs(prev => applyRealtimeChange(prev, payload, syncOpts)))
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          if (hasSubscribed) fetchData(); // reconnect → full resync
          hasSubscribed = true;
        }
      });

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return toolLogs;
}
