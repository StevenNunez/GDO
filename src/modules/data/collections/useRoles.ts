import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';

/**
 * Overrides de permisos de rol de la empresa actual. Solo trae las filas
 * personalizadas por este tenant (los defaults viven en ROLES de permissions.ts;
 * el DataProvider los superpone). Un tenant sin personalizaciones devuelve `{}`.
 */
export function useRoles(tenantId: string | null | undefined) {
  const [roles, setRoles] = useState<any>(undefined);

  useEffect(() => {
    if (tenantId === undefined) return; // aún no está listo

    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      // Super-admin en vista global (sin tenant): sin overrides, se usan defaults.
      if (!tenantId) {
        setRoles({});
        return;
      }
      const { data, error } = await sb.from('roles').select('*').eq('tenantId', tenantId);
      if (!error && data) {
        const map = data.reduce((acc: any, row: any) => {
          acc[row.id] = row;
          return acc;
        }, {});
        setRoles(map);
      } else {
        setRoles({});
      }
    };

    fetchData();

    if (!tenantId) return;

    const channel = sb
      .channel(`roles-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'roles' }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  return roles;
}
