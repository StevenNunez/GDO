import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { Tool } from '@/modules/core/lib/data';

export function useTools(tenantId: string | null | undefined, projectId: string | null) {
  const [tools, setTools] = useState<Tool[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('tools').select('*');
      if (tenantId !== null) {
        q = q.eq('tenantId', tenantId);
        if (projectId) q = q.eq('projectId', projectId);
      }
      const { data, error } = await q;
      if (!error && data) setTools(data as Tool[]);
      else if (error) { logCollectionError('useTools', error); setTools([]); }
    };

    fetchData();

    const channel = sb
      .channel(`tools-${tenantId}-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tools', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId, projectId]);

  return tools;
}
