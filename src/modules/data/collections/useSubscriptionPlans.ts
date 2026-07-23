import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { PLANS as PLANS_DEFAULT } from '@/modules/core/lib/permissions';

export function useSubscriptionPlans() {
  const [plans, setPlans] = useState<any>(null);

  useEffect(() => {
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      const { data, error } = await sb.from('subscriptionPlans').select('*');
      if (!error && data && data.length > 0) {
        const fetchedPlans = data.reduce((acc: any, row: any) => {
          acc[row.id] = row;
          return acc;
        }, {});
        setPlans(fetchedPlans);
      } else {
        setPlans(PLANS_DEFAULT);
      }
    };

    fetchData();

    const channel = sb
      .channel('subscriptionPlans')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptionPlans' }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, []);

  return plans;
}
