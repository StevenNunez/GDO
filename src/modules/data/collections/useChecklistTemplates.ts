import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { ChecklistTemplate } from '@/modules/core/lib/data';

export function useChecklistTemplates(tenantId: string | null | undefined) {
  const [data, setData] = useState<ChecklistTemplate[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('checklistTemplates').select('*').order('createdAt', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as ChecklistTemplate[]);
      else if (error) { logCollectionError('useChecklistTemplates', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`checklistTemplates-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklistTemplates', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
