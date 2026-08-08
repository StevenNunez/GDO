import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { SubcontractAttachment } from '@/modules/core/lib/data';

export function useSubcontractAttachments(tenantId: string | null | undefined) {
  const [data, setData] = useState<SubcontractAttachment[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('subcontractAttachments').select('*').order('createdAt', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as SubcontractAttachment[]);
      else if (error) { logCollectionError('useSubcontractAttachments', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`subcontractAttachments-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subcontractAttachments', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
