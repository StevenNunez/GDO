import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { ApprovalFlow } from '@/modules/core/lib/data';

export function useApprovalFlows(tenantId: string | null | undefined) {
  const [data, setData] = useState<ApprovalFlow[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('approvalFlows').select('*').order('createdAt', { ascending: true });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as ApprovalFlow[]);
      else if (error) { logCollectionError('useApprovalFlows', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`approvalFlows-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approvalFlows', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
