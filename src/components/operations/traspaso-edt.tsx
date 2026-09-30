"use client";

import { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Info, Link2, Loader2 } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { unidadesActivas, unidadesDeObra } from '@/lib/work-units';
import { actividadesDeObra } from '@/lib/train';
import { progresosDeObra } from '@/lib/daily-report';
import {
  avancesParaEDT, propuestasConAvance, porcentajeDePropuesta,
  type PropuestaEDT,
} from '@/lib/train-links';

const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Traspaso del avance del tren a las partidas de la EDT.
 *
 * Es una PROPUESTA con un botón, no un automatismo: la EDT es lo que se le
 * cobra al mandante y el parte diario es lo que el capataz vio desde el
 * pasillo. Entre los dos tiene que haber alguien que mire — el mismo criterio
 * del protocolo de calidad, que tampoco se aprueba solo.
 *
 * El avance se registra como CANTIDAD y no como porcentaje, con la misma
 * mutación que usa el formulario de la EDT (`add_work_item_progress`): así
 * queda su fila en el historial de avances y no aparece un salto de porcentaje
 * sin autor ni fecha.
 */
export function TraspasoEDT() {
  const {
    trainActivities, workUnits, dailyProgress, workItems,
    currentProjectId, can, notify, addWorkItemProgress,
  } = useAppState();

  const [registrando, setRegistrando] = useState<string | null>(null);

  const actividades = useMemo(
    () => actividadesDeObra(trainActivities, currentProjectId),
    [trainActivities, currentProjectId],
  );

  const unidades = useMemo(
    () => unidadesActivas(unidadesDeObra(workUnits, currentProjectId)),
    [workUnits, currentProjectId],
  );

  const progresos = useMemo(
    () => progresosDeObra(dailyProgress, currentProjectId),
    [dailyProgress, currentProjectId],
  );

  const partidasDeLaObra = useMemo(
    () => workItems.filter((w) => w.projectId === currentProjectId),
    [workItems, currentProjectId],
  );

  const propuestas = useMemo(
    () => avancesParaEDT(actividades, unidades, progresos, partidasDeLaObra),
    [actividades, unidades, progresos, partidasDeLaObra],
  );

  const pendientes = useMemo(() => propuestasConAvance(propuestas), [propuestas]);
  const enlazadas = actividades.filter((a) => a.workItemId).length;

  const puedeRegistrar = can('construction_control:register_progress');

  const registrar = async (p: PropuestaEDT) => {
    setRegistrando(p.workItemId);
    try {
      await addWorkItemProgress(
        p.workItemId,
        redondear(p.porRegistrar),
        new Date(),
        `Avance traspasado desde el tren de actividades (${p.equivalentes.toFixed(1)} de `
        + `${p.totalUnidades} unidades).`,
      );
      notify(`Avance registrado en «${p.partida}».`, 'success');
    } catch (e: any) {
      notify(e.message ?? 'No se pudo registrar el avance.', 'destructive');
    } finally {
      setRegistrando(null);
    }
  };

  if (enlazadas === 0) {
    return (
      <Card>
        <CardContent className="space-y-2 p-5 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <Link2 className="h-4 w-4" />
            Ninguna actividad del tren está enlazada a una partida
          </div>
          <p>
            Al editar una actividad en el tren se le puede indicar qué partida de la EDT
            avanza con ella. Desde ese momento, lo que el supervisor reporta en el parte
            diario se puede traspasar al avance de esa partida sin volver a escribirlo.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">Avance para la EDT</div>
            <p className="text-xs text-muted-foreground">
              Lo que el parte diario dice que está hecho, llevado a la cantidad de cada
              partida. Se registra apretando el botón: la EDT es lo que se le cobra al
              mandante, así que nadie la mueve sola.
            </p>
          </div>
          {pendientes.length === 0 && (
            <StatusBadge tone="success">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Al día
            </StatusBadge>
          )}
        </div>

        {propuestas.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Las actividades enlazadas todavía no tienen avance reportado.
          </p>
        ) : (
          <div className="space-y-2">
            {propuestas.map((p) => {
              const hayQueRegistrar = p.porRegistrar > 0;
              return (
                <div
                  key={p.workItemId}
                  className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3 md:grid-cols-[1fr_auto] md:items-center"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {p.partida}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.actividades.map((a) => a.name).join(' · ')}
                      {' — '}
                      {redondear(p.equivalentes)} de {p.totalUnidades} unidades
                      {' ('}{porcentajeDePropuesta(p)}%{')'}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-muted-foreground">
                        En la EDT: {redondear(p.cantidadRegistrada)} {p.unidadDeMedida}
                      </span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium text-foreground">
                        Según el tren: {redondear(p.cantidadEjecutada)} {p.unidadDeMedida}
                      </span>
                      {p.adelantada && (
                        <StatusBadge tone="warning">
                          <Info className="mr-1 h-3 w-3" />
                          La EDT va más adelante
                        </StatusBadge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    {hayQueRegistrar ? (
                      <>
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Por registrar</div>
                          <div className="text-sm font-semibold text-foreground">
                            {redondear(p.porRegistrar)} {p.unidadDeMedida}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          disabled={!puedeRegistrar || registrando !== null}
                          onClick={() => registrar(p)}
                        >
                          {registrando === p.workItemId
                            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            : null}
                          Registrar
                        </Button>
                      </>
                    ) : (
                      <StatusBadge tone="neutral">Sin diferencias</StatusBadge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!puedeRegistrar && pendientes.length > 0 && (
          <p className="text-xs text-muted-foreground">
            No tienes permiso para registrar avance en la EDT.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
