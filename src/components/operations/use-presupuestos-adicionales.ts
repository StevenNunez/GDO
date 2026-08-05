"use client";

import { useMemo } from 'react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { montoDesdePresupuesto } from '@/lib/amendment';
import type { PresupuestoOpcion } from './adicional-form';

/**
 * Presupuestos de tipo «adicional» de la obra activa que se pueden vincular,
 * con su monto ya calculado.
 *
 * Deja fuera los que ya valorizan OTRO adicional: un mismo presupuesto contado
 * dos veces inflaría el monto vigente del contrato (la base también lo impide
 * con un índice único, esto solo evita que la UI ofrezca lo imposible).
 *
 * `amendmentId` es el adicional que se está editando: su propio presupuesto sí
 * tiene que seguir apareciendo en la lista.
 */
export function usePresupuestosAdicionales(amendmentId: string | null): PresupuestoOpcion[] {
  const { budgets, workItems, amendments, currentProjectId } = useAppState();

  return useMemo(() => {
    const ocupados = new Set(
      amendments
        .filter((a) => a.budgetId && a.id !== amendmentId)
        .map((a) => a.budgetId as string),
    );

    return budgets
      .filter((b) => b.projectId === currentProjectId
        && b.type === 'adicional'
        && !ocupados.has(b.id))
      .map((b) => ({
        id: b.id,
        name: b.name,
        monto: montoDesdePresupuesto(workItems.filter((w) => w.budgetId === b.id)),
      }));
  }, [budgets, workItems, amendments, currentProjectId, amendmentId]);
}
