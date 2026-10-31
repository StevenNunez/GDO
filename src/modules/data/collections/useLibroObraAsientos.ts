import { useEffect, useState } from 'react';
import { coalesce } from './realtime-sync';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { LibroObraAsiento } from '@/modules/core/lib/data';

export function useLibroObraAsientos(libroId: string | null | undefined) {
  const [data, setData] = useState<LibroObraAsiento[]>([]);

  useEffect(() => {
    if (!libroId) { setData([]); return; }
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      const { data: result, error } = await sb
        .from('libroObraAsientos')
        .select('*')
        .eq('libroId', libroId)
        .order('numero', { ascending: true });
      if (!error && result) setData(result as LibroObraAsiento[]);
      else if (error) { logCollectionError('useLibroObraAsientos', error); setData([]); }
    };

    fetchData();

    const refetch = coalesce(fetchData);

    const channel = sb
      .channel(`libroObraAsientos-${libroId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'libroObraAsientos', filter: `libroId=eq.${libroId}` }, refetch)
      .subscribe();

    return () => { refetch.cancel(); sb.removeChannel(channel); };
  }, [libroId]);

  return data;
}
