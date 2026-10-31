import { useEffect, useState } from 'react';
import { applyRealtimeChange, coalesce } from './realtime-sync';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { DailyProgress } from '@/modules/core/lib/data';

export function useDailyProgress(tenantId: string | null | undefined) {
  const [data, setData] = useState<DailyProgress[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();
    let cancelled = false;
    let request = 0;

    const fetchData = async () => {
      const current = ++request;
      const reports: DailyProgress[] = [];
      for (let offset = 0; ; offset += 500) {
        let q = sb.from('dailyProgress').select('*').order('date', { ascending: false }).order('id').range(offset, offset + 499);
        if (tenantId !== null) q = q.eq('tenantId', tenantId);
        const { data: result, error } = await q;
        if (cancelled || current !== request) return;
        if (error) { logCollectionError('useDailyProgress', error); return; }
        reports.push(...((result ?? []) as DailyProgress[]));
        if (!result || result.length < 500) break;
      }
      if (!cancelled && current === request) setData(reports);
    };

    fetchData();

    // Un parte diario escribe decenas de filas seguidas (una por unidad). Se
    // aplica cada fila directo en vez de recargar toda la tabla por cada una.
    const refetchAll = coalesce(fetchData);
    const compare = (a: DailyProgress, b: DailyProgress) =>
      (b.date < a.date ? -1 : b.date > a.date ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const refetch = tenantId === null
      ? refetchAll
      : (payload: Parameters<typeof applyRealtimeChange<DailyProgress>>[1]) => {
          // El cliente del modo demo avisa «algo cambió» sin traer la fila: recargar.
          if (!payload?.eventType || payload.eventType === ('*' as string)) { refetchAll(); return; }
          if (cancelled) return;
          setData(cur => applyRealtimeChange(cur, payload, { compare }));
        };

    const channel = sb
      .channel(`dailyProgress-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dailyProgress', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, refetch)
      .subscribe();

    return () => { cancelled = true; refetchAll.cancel(); sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
