"use client";

import { useMemo } from 'react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { claveDia } from '@/lib/work-calendar';
import {
  tareasDeLaSemana, saludPrograma, semanasDeLookahead, claveSemana, addSemanas, calcPpc,
  type SaludPrograma,
} from '@/lib/last-planner';

/** Cuántas semanas hacia atrás (incluida la actual) dibuja la tendencia del PPC. */
const SEMANAS_DE_TENDENCIA = 8;

export type SaludDelPlanner = SaludPrograma & {
  /** PPC de cada una de las últimas semanas, de la más antigua a la actual. `null` = esa semana no hubo compromisos. */
  ppcSerie: Array<number | null>;
};

/**
 * Salud del programa semanal de la obra activa: PPC de la semana, su tendencia y las restricciones.
 * La usan el Resumen de Last Planner y la cabecera del dashboard, para que ambos muestren siempre el
 * mismo número. `enabled = false` evita el cálculo (la cabecera solo lo necesita dentro de Last Planner).
 */
export function usePlannerHealth(enabled = true): SaludDelPlanner | null {
  const { lookaheadTasks, taskConstraints, currentProjectId } = useAppState();
  const today = claveDia(new Date());
  return useMemo(() => {
    if (!enabled || !currentProjectId) return null;
    const tasks = lookaheadTasks.filter(t => t.projectId === currentProjectId);
    const weeks = new Set(semanasDeLookahead(new Date(), 6).map(claveSemana));
    const salud = saludPrograma(tareasDeLaSemana(tasks, today), tasks.filter(t => weeks.has(claveSemana(t.weekStart))), taskConstraints);
    const ppcSerie = Array.from({ length: SEMANAS_DE_TENDENCIA }, (_, i) =>
      calcPpc(tareasDeLaSemana(tasks, addSemanas(new Date(), i - (SEMANAS_DE_TENDENCIA - 1)))).ppc);
    return { ...salud, ppcSerie };
  }, [enabled, lookaheadTasks, currentProjectId, taskConstraints, today]);
}
