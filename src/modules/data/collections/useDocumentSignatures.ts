import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { DocumentSignature } from '@/modules/core/lib/data';

export function useDocumentSignatures(tenantId: string | null | undefined) {
  const [data, setData] = useState<DocumentSignature[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('documentSignatures').select('*').order('signedAt', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as DocumentSignature[]);
      else if (error) { logCollectionError('useDocumentSignatures', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`documentSignatures-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documentSignatures', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
