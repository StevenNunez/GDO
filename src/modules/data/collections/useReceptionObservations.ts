import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { ReceptionObservation } from '@/modules/core/lib/data';

export function useReceptionObservations(tenantId: string | null | undefined) {
  const [data, setData] = useState<ReceptionObservation[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('receptionObservations').select('*').order('createdAt', { ascending: true });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as ReceptionObservation[]);
      else if (error) { logCollectionError('useReceptionObservations', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`receptionObservations-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receptionObservations', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
