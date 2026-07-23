import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { Client } from '@/modules/core/lib/data';

export function useClients(tenantId: string | null | undefined) {
  const [data, setData] = useState<Client[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('clients').select('*').order('name', { ascending: true });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as Client[]);
      else if (error) { logCollectionError('useClients', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`clients-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
