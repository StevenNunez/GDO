import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { Tenant } from '@/modules/core/lib/data';

export function useTenants() {
  const [tenants, setTenants] = useState<Tenant[]>([]);

  useEffect(() => {
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      const { data, error } = await sb.from('tenants').select('*');
      if (!error && data) setTenants(data as Tenant[]);
      else if (error) { logCollectionError('useTenants', error); setTenants([]); }
    };

    fetchData();

    const channel = sb
      .channel('tenants')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tenants' }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, []);

  return tenants;
}
