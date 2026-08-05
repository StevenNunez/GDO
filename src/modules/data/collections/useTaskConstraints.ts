import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { TaskConstraint } from '@/modules/core/lib/data';

export function useTaskConstraints(tenantId: string | null | undefined) {
  const [data, setData] = useState<TaskConstraint[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('taskConstraints').select('*').order('createdAt', { ascending: true });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as TaskConstraint[]);
      else if (error) { logCollectionError('useTaskConstraints', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`taskConstraints-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taskConstraints', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
