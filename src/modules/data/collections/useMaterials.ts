import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { logCollectionError } from './log';
import { fetchAllRows } from './fetch-all';
import { Material } from '@/modules/core/lib/data';

/** Tope solo para la vista global del super-admin (todos los tenants a la vez),
 *  que es de exploración: ahí sí es razonable no traerlo todo. */
const SUPERADMIN_GLOBAL_LIMIT = 200;

/**
 * Catálogo de materiales de la obra activa.
 *
 * Se traen TODOS paginando: antes había un `.limit(500)` y con un catálogo más
 * grande faltaban materiales en el inventario y en el panel de stock crítico,
 * sin ningún aviso. El orden por `name` + `id` hace la paginación determinista
 * (solo por `name` los empates podrían repetir u omitir filas entre páginas).
 */
export function useMaterials(tenantId: string | null | undefined, projectId: string | null) {
  const [materials, setMaterials] = useState<Material[]>([]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const sb = getSupabaseBrowserClient();

    const fetchData = async () => {
      try {
        if (tenantId === null) {
          const { data, error } = await sb
            .from('materials')
            .select('*')
            .order('name')
            .limit(SUPERADMIN_GLOBAL_LIMIT);
          if (error) throw error;
          setMaterials((data ?? []) as Material[]);
          return;
        }

        const rows = await fetchAllRows<Material>((from, to) => {
          let q = sb.from('materials').select('*')
            .eq('tenantId', tenantId)
            .order('name')
            .order('id', { ascending: true })
            .range(from, to);
          if (projectId) q = q.eq('projectId', projectId);
          return q;
        });
        setMaterials(rows);
      } catch (error) {
        logCollectionError('useMaterials', error);
        setMaterials([]);
      }
    };

    fetchData();

    const channel = sb
      .channel(`materials-${tenantId}-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'materials', ...(tenantId ? { filter: `tenantId=eq.${tenantId}` } : {}) }, fetchData)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [tenantId, projectId]);

  return materials;
}
