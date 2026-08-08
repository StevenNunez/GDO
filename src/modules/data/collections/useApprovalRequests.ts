import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { ApprovalRequest } from '@/modules/core/lib/data';

export function useApprovalRequests(tenantId: string | null | undefined) {
  const [data, setData] = useState<ApprovalRequest[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('approvalRequests').select('*').order('submittedAt', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as ApprovalRequest[]);
      else if (error) { logCollectionError('useApprovalRequests', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`approvalRequests-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approvalRequests', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
