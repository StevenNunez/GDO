import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { User } from '@/modules/core/lib/data';

export function useUsers(tenantId: string | null | undefined) {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      // Defensive bound: 2000 is far above any real tenant's headcount, but caps a
      // runaway query on the super-admin global view (tenantId null = all tenants).
      // If a deployment ever legitimately exceeds this, switch this view to pagination.
      let q = sb.from('users').select('*').order('name', { ascending: true }).limit(2000);
      if (tenantId !== null) q = q.eq('tenantId', tenantId);
      const { data, error } = await q;
      if (!error && data) setUsers(data as User[]);
      else if (error) { logCollectionError('useUsers', error); setUsers([]); }
    };

    fetchData();

    const channel = sb
      .channel(`users-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return users;
}
