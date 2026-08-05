import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { DocumentRevision } from '@/modules/core/lib/data';

export function useDocumentRevisions(tenantId: string | null | undefined) {
  const [data, setData] = useState<DocumentRevision[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('documentRevisions').select('*').order('createdAt', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as DocumentRevision[]);
      else if (error) { logCollectionError('useDocumentRevisions', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`documentRevisions-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documentRevisions', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
