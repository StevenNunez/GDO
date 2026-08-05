import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { ProjectDocument } from '@/modules/core/lib/data';

export function useDocuments(tenantId: string | null | undefined) {
  const [data, setData] = useState<ProjectDocument[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('documents').select('*').order('code', { ascending: true });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as ProjectDocument[]);
      else if (error) { logCollectionError('useDocuments', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`documents-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
