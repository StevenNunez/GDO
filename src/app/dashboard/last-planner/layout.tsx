"use client";

import { useAppState } from '@/modules/core/contexts/app-provider';

/**
 * Last Planner se navega desde la barra lateral (ahí están Resumen, Unidades, Calendario, Tren,
 * Programa semanal, Parte diario y Análisis); por eso no repite las secciones en pestañas arriba.
 * La `key` reinicia el estado de la pantalla cuando cambia la obra activa.
 */
export default function LastPlannerLayout({ children }: { children: React.ReactNode }) {
  const { currentProjectId } = useAppState();
  return (
    <div className="mx-auto max-w-[1440px]">
      <div key={currentProjectId ?? 'no-project'}>{children}</div>
    </div>
  );
}
