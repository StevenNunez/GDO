import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { MarketIndex } from '@/modules/core/lib/data';

/**
 * UF / UTM / IPC. A diferencia del resto de las colecciones, esta tabla es
 * GLOBAL (dato público, sin `tenantId`), así que no se filtra ni se suscribe
 * por empresa. Se acota a los últimos valores porque para reajustar basta con
 * el histórico reciente: la serie completa de la UF son miles de filas diarias.
 */
const LIMITE = 400;

export function useMarketIndices(tenantId: string | null | undefined) {
  const [data, setData] = useState<MarketIndex[]>([]);

  useEffect(() => {
    // Se espera a saber quién es el usuario: sin sesión la RLS no deja leer.
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      const { data: result, error } = await sb
        .from('marketIndices')
        .select('*')
        .order('date', { ascending: false })
        .limit(LIMITE);
      if (!error && result) setData(result as MarketIndex[]);
      else if (error) { logCollectionError('useMarketIndices', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel('marketIndices')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketIndices' }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
