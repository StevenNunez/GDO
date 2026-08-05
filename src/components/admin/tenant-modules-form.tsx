'use client';

import * as React from 'react';
import { Loader2, RotateCcw, Save } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { useToast } from '@/modules/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { StatusBadge } from '@/components/ui/status-badge';
import type { Tenant } from '@/modules/core/lib/data';
import {
  PLAN_FEATURES, PLAN_LABEL, normalizePlanTier, planIncludesFeature,
  parseModuleOverrides, requiredPlanLabel, type ModuleOverrides, type PlanFeature,
} from '@/lib/plan-features';

interface TenantModulesFormProps {
  tenant: Tenant;
}

/**
 * Módulos habilitados para UNA empresa. El plan define el estándar; acá el
 * super-admin lo pisa caso a caso.
 *
 * Solo se guardan las DIFERENCIAS con el plan: si un interruptor vuelve a
 * coincidir con lo que trae el plan, la excepción se borra en vez de guardarse
 * en el mismo valor. Así, el día que cambie qué incluye un plan, los clientes que
 * nadie tocó a mano lo heredan solos.
 *
 * El borrador vive en `useState` sin sincronizarse con la fila: quien lo monta le
 * pasa una `key` que cambia solo cuando cambia lo GUARDADO. Sin eso, cualquier
 * evento de realtime sobre `tenants` (aunque no toque estos datos) le borraría los
 * interruptores al super-admin en medio de la edición.
 */
export function TenantModulesForm({ tenant }: TenantModulesFormProps) {
  const { updateTenant } = useAppState();
  const { toast } = useToast();

  const tier = normalizePlanTier(tenant.plan);
  const guardados = React.useMemo(
    () => parseModuleOverrides(tenant.moduleOverrides),
    [tenant.moduleOverrides],
  );

  const [borrador, setBorrador] = React.useState<ModuleOverrides>(guardados);
  const [guardando, setGuardando] = React.useState(false);

  const features = Object.keys(PLAN_FEATURES) as PlanFeature[];

  const activo = (feature: PlanFeature) => {
    const override = borrador[feature];
    return typeof override === 'boolean' ? override : planIncludesFeature(tier, feature);
  };

  const alternar = (feature: PlanFeature, valor: boolean) => {
    setBorrador((prev) => {
      const next = { ...prev };
      if (valor === planIncludesFeature(tier, feature)) {
        delete next[feature]; // volvió al estándar del plan: no es excepción
      } else {
        next[feature] = valor;
      }
      return next;
    });
  };

  const hayCambios = JSON.stringify(borrador) !== JSON.stringify(guardados);
  const excepciones = Object.keys(borrador).length;

  const guardar = async () => {
    setGuardando(true);
    try {
      await updateTenant(tenant.id, { moduleOverrides: borrador });
      toast({
        title: 'Módulos actualizados',
        description: excepciones === 0
          ? `${tenant.name} vuelve al estándar del plan ${PLAN_LABEL[tier]}.`
          : `${tenant.name} queda con ${excepciones} excepción(es) sobre su plan.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'No se pudieron guardar los módulos.',
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        El plan <strong className="text-foreground">{PLAN_LABEL[tier]}</strong> define el estándar.
        Acá puedes activarle un módulo que su plan no trae, o quitárselo aunque le corresponda.
        Los módulos base (obra, bodega, compras, asistencia, contrato, presupuesto, estados de pago
        y adicionales) van siempre incluidos y no se pueden apagar.
      </p>

      <div className="divide-y divide-border rounded-xl border border-border">
        {features.map((feature) => {
          const def = PLAN_FEATURES[feature];
          const enPlan = planIncludesFeature(tier, feature);
          const encendido = activo(feature);
          const esExcepcion = typeof borrador[feature] === 'boolean';

          return (
            <div key={feature} className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{def.label}</span>
                  {esExcepcion && (
                    <StatusBadge tone={encendido ? 'info' : 'warning'}>
                      {encendido ? 'Activado a mano' : 'Quitado a mano'}
                    </StatusBadge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{def.description}</p>
                <p className="text-xs text-muted-foreground">
                  {enPlan
                    ? `Incluido en el plan ${PLAN_LABEL[tier]}`
                    : `Estándar: desde el plan ${requiredPlanLabel(feature)}`}
                </p>
              </div>
              <Switch
                checked={encendido}
                onCheckedChange={(v) => alternar(feature, v)}
                aria-label={def.label}
              />
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {excepciones === 0
            ? 'Sin excepciones: sigue el plan tal cual.'
            : `${excepciones} excepción(es) sobre el plan.`}
        </span>
        <div className="flex gap-2">
          {excepciones > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setBorrador({})}
              disabled={guardando}
            >
              <RotateCcw className="mr-2 h-4 w-4" /> Volver al plan
            </Button>
          )}
          <Button type="button" onClick={guardar} disabled={guardando || !hayCambios}>
            {guardando
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Save className="mr-2 h-4 w-4" />}
            Guardar módulos
          </Button>
        </div>
      </div>
    </div>
  );
}
