import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { Project } from '@/modules/core/lib/data';

export function useProjects(tenantId: string | null | undefined) {
  const [data, setData] = useState<Project[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('projects').select('*').order('createdAt', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as Project[]);
      else if (error) { logCollectionError('useProjects', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`projects-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
