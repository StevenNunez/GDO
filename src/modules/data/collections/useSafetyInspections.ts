import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { SafetyInspection } from '@/modules/core/lib/data';

export function useSafetyInspections(tenantId: string | null | undefined) {
  const [data, setData] = useState<SafetyInspection[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('safetyInspections').select('*').order('date', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as SafetyInspection[]);
      else if (error) { logCollectionError('useSafetyInspections', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`safetyInspections-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'safetyInspections', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
