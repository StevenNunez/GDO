import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { ApprovalFlowStep } from '@/modules/core/lib/data';

export function useApprovalFlowSteps(tenantId: string | null | undefined) {
  const [data, setData] = useState<ApprovalFlowStep[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('approvalFlowSteps').select('*').order('sortOrder', { ascending: true });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as ApprovalFlowStep[]);
      else if (error) { logCollectionError('useApprovalFlowSteps', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`approvalFlowSteps-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approvalFlowSteps', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
