import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { AttendanceLog } from '@/modules/core/lib/data';
import { format, subDays } from 'date-fns';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { applyRealtimeChange, byDateDesc } from './realtime-sync';

export function useAttendanceLogs(tenantId: string | null | undefined) {
  const [data, setData] = useState<AttendanceLog[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    // Fetch last 90 days — covers monthly reports without loading all history.
    const since = format(subDays(new Date(), 90), 'yyyy-MM-dd');
    const syncOpts = {
      predicate: (r: AttendanceLog) => (r.date ?? '') >= since,
      compare: byDateDesc<AttendanceLog>('timestamp'),
    };

    const fetchData = async () => {
      let q = sb
        .from('attendanceLogs')
        .select('*')
        .gte('date', since)
        .order('timestamp', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as AttendanceLog[]);
      else if (error) { logCollectionError('useAttendanceLogs', error); setData([]); }
    };

    fetchData();

    // Apply each change incrementally; refetch fully only on (re)subscribe to heal drift.
    let hasSubscribed = false;
    const channel = sb
      .channel(`attendanceLogs-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendanceLogs', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) },
        (payload: RealtimePostgresChangesPayload<AttendanceLog>) => setData(prev => applyRealtimeChange(prev, payload, syncOpts)))
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          if (hasSubscribed) fetchData(); // reconnect → full resync
          hasSubscribed = true;
        }
      });

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
