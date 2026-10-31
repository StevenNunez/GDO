import { useEffect, useState } from 'react';
import { coalesce } from './realtime-sync';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { EquipmentRental } from '@/modules/core/lib/data';

export function useEquipmentRentals(tenantId: string | null | undefined) {
  const [data, setData] = useState<EquipmentRental[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('equipmentRentals').select('*').order('startDate', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as EquipmentRental[]);
      else if (error) { logCollectionError('useEquipmentRentals', error); setData([]); }
    };

    fetchData();

    const refetch = coalesce(fetchData);

    const channel = sb
      .channel(`equipmentRentals-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipmentRentals', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, refetch)
      .subscribe();

    return () => { refetch.cancel(); sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
