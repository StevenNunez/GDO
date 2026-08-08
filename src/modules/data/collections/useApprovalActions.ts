import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { ApprovalAction } from '@/modules/core/lib/data';

export function useApprovalActions(tenantId: string | null | undefined) {
  const [data, setData] = useState<ApprovalAction[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('approvalActions').select('*').order('actedAt', { ascending: true });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as ApprovalAction[]);
      else if (error) { logCollectionError('useApprovalActions', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`approvalActions-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approvalActions', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
