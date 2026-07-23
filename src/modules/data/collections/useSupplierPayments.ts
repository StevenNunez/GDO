import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { SupplierPayment } from '@/modules/core/lib/data';

export function useSupplierPayments(tenantId: string | null | undefined) {
  const [data, setData] = useState<SupplierPayment[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      let q = sb.from('supplierPayments').select('*').order('dueDate', { ascending: false });
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data: result, error } = await q;
      if (!error && result) setData(result as SupplierPayment[]);
      else if (error) { logCollectionError('useSupplierPayments', error); setData([]); }
    };

    fetchData();

    const channel = sb
      .channel(`supplierPayments-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'supplierPayments', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return data;
}
