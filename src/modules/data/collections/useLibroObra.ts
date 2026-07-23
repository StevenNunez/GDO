import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { LibroObra } from '@/modules/core/lib/data';

export function useLibroObra(tenantId: string | null | undefined) {
  const [data, setData] = useState<LibroObra | null>(null);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('libroObra').select('*').order('createdAt', { ascending: false }).limit(1);
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result?.length) setData(result[0] as LibroObra);
      else if (error) { logCollectionError('useLibroObra', error); setData(null); }
      else setData(null);
    };

    fetchData();

    const channel = sb
      .channel(`libroObra-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'libroObra', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
