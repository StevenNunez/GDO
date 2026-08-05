'use client';

import * as React from 'react';
import { Lock } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { SurfaceCard } from '@/components/ui/surface-card';
import { useAppState } from '@/modules/core/contexts/app-provider';
import {
  PLAN_FEATURES, planIncludesFeature, requiredPlanLabel, type PlanFeature,
} from '@/lib/plan-features';

interface PlanLockedProps {
  feature: PlanFeature;
  /** Título de la página. Por defecto, el nombre comercial de la feature. */
  title?: string;
}

/**
 * Pantalla de módulo que la empresa no tiene contratado. Es distinta de «no
 * tienes permiso»: ahí el administrador de la empresa puede arreglarlo solo, acá
 * hay que subir de plan. Decirle «no tienes permiso» a alguien que sí lo tiene
 * lo manda a buscar un problema que no existe.
 */
export function PlanLocked({ feature, title }: PlanLockedProps) {
  const { planTier } = useAppState();
  const def = PLAN_FEATURES[feature];

  // Si el plan sí lo trae, entonces se lo desactivaron a mano: mandar a
  // contratar un plan que ya tienen sería mentirle al cliente.
  const desactivadoAMano = planIncludesFeature(planTier, feature);

  if (desactivadoAMano) {
    return (
      <div className="space-y-6">
        <PageHeader title={title ?? def.label} />
        <SurfaceCard interactive={false} className="border-dashed">
          <div className="flex flex-col items-start gap-4 p-8">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Lock className="h-6 w-6" strokeWidth={1.8} />
            </span>
            <div className="space-y-1">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                {def.label} está desactivado para tu empresa
              </h2>
              <p className="max-w-prose text-sm text-muted-foreground">{def.description}</p>
            </div>
            <p className="max-w-prose text-sm text-muted-foreground">
              Tu plan lo incluye, pero este módulo quedó desactivado en la cuenta. Escríbenos para
              volver a habilitarlo.
            </p>
          </div>
        </SurfaceCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={title ?? def.label} />
      <SurfaceCard interactive={false} className="border-dashed">
        <div className="flex flex-col items-start gap-4 p-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Lock className="h-6 w-6" strokeWidth={1.8} />
          </span>
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              {def.label} viene en el plan {requiredPlanLabel(feature)}
            </h2>
            <p className="max-w-prose text-sm text-muted-foreground">{def.description}</p>
          </div>
          <p className="max-w-prose text-sm text-muted-foreground">
            Tu empresa está en un plan que no incluye este módulo. Al contratar el plan{' '}
            {requiredPlanLabel(feature)} se activa de inmediato, con los datos que ya tienes
            cargados.
          </p>
        </div>
      </SurfaceCard>
    </div>
  );
}
