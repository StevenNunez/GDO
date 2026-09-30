"use client";

import { useMemo, useState } from 'react';
import { Check, Loader2, TrainFront } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { unidadesActivas, unidadesDeObra } from '@/lib/work-units';
import { indexarExcepciones } from '@/lib/work-calendar';
import { actividadesDeObra } from '@/lib/train';
import { claveSemana } from '@/lib/last-planner';
import { compromisosDelTren, type CompromisoPropuesto } from '@/lib/train-links';

/**
 * Los compromisos de la semana, traídos del tren de actividades.
 *
 * El tren ya dice qué unidad le toca a cada cuadrilla cada día; escribir eso
 * otra vez a mano en el programa semanal es copiar el mismo dato y arriesgarse
 * a que las dos versiones digan cosas distintas justo el lunes que importa.
 *
 * Lo que se trae es una TAREA COMPROMETIDA, no planificada: el tren es el
 * programa de la obra, y lo que el tren dice que se hace esta semana es
 * exactamente lo que la obra se está comprometiendo a hacer. Después se cierra
 * cumplida o no cumplida como cualquier otra.
 */
export function TraerDelTren({ semana }: { semana: Date }) {
  const {
    trainActivities, workUnits, workCalendarExceptions, lookaheadTasks,
    projects, currentProjectId, notify, addLookaheadTask,
  } = useAppState();

  const [ocupado, setOcupado] = useState(false);
  const [abierto, setAbierto] = useState(false);

  const obra = useMemo(
    () => projects.find((p) => p.id === currentProjectId) ?? null,
    [projects, currentProjectId],
  );

  const actividades = useMemo(
    () => actividadesDeObra(trainActivities, currentProjectId),
    [trainActivities, currentProjectId],
  );

  const unidades = useMemo(
    () => unidadesActivas(unidadesDeObra(workUnits, currentProjectId)),
    [workUnits, currentProjectId],
  );

  const calendario = useMemo(
    () => indexarExcepciones(workCalendarExceptions, currentProjectId),
    [workCalendarExceptions, currentProjectId],
  );

  const existentes = useMemo(
    () => lookaheadTasks.filter((t) => t.projectId === currentProjectId),
    [lookaheadTasks, currentProjectId],
  );

  const propuestas = useMemo(
    () => compromisosDelTren(
      actividades, unidades, semana, obra?.workDays, calendario, existentes,
    ),
    [actividades, unidades, semana, obra?.workDays, calendario, existentes],
  );

  const nuevas = propuestas.filter((p) => !p.yaExiste);

  const traer = async (lista: CompromisoPropuesto[]) => {
    if (lista.length === 0) return;
    setOcupado(true);
    let creadas = 0;
    try {
      for (const p of lista) {
        await addLookaheadTask({
          name: p.name,
          weekStart: claveSemana(semana) as never,
          trainActivityId: p.trainActivityId,
          workItemId: p.workItemId,
          responsibleName: p.responsibleName,
          unit: p.unit,
          quantityPlanned: p.quantityPlanned,
          status: 'comprometida',
        });
        creadas++;
      }
      notify(
        creadas === 1
          ? 'Se trajo 1 compromiso desde el tren.'
          : `Se trajeron ${creadas} compromisos desde el tren.`,
        'success',
      );
    } catch (e: any) {
      notify(
        creadas > 0
          ? `Se trajeron ${creadas} y después falló: ${e.message}`
          : (e.message ?? 'No se pudo traer del tren.'),
        'destructive',
      );
    } finally {
      setOcupado(false);
    }
  };

  if (actividades.length === 0 || propuestas.length === 0) return null;

  return (
    <Card className="border-primary/30">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <TrainFront className="h-4 w-4 text-primary" />
              El tren programa {propuestas.length} actividad(es) esta semana
            </div>
            <p className="text-xs text-muted-foreground">
              Son las cuadrillas que según el tren terminan unidades entre lunes y domingo.
              Traerlas acá las deja como compromiso de la semana, con su responsable y su
              cantidad, sin escribirlas de nuevo.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAbierto((a) => !a)}>
              {abierto ? 'Ocultar' : 'Ver detalle'}
            </Button>
            <Button size="sm" disabled={ocupado || nuevas.length === 0} onClick={() => traer(nuevas)}>
              {ocupado ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {nuevas.length === 0
                ? 'Ya están todas'
                : `Traer ${nuevas.length} al programa`}
            </Button>
          </div>
        </div>

        {abierto && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {propuestas.map((p) => (
              <li
                key={p.trainActivityId}
                className="grid grid-cols-1 gap-2 p-3 md:grid-cols-[1fr_auto] md:items-center"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm text-foreground">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.responsibleName ?? 'Sin responsable'}
                    {' · '}{p.quantityPlanned.toLocaleString('es-CL')} {p.unit}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  {p.yaExiste ? (
                    <StatusBadge tone="success">
                      <Check className="mr-1 h-3 w-3" /> Ya está en el programa
                    </StatusBadge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={ocupado}
                      onClick={() => traer([p])}
                    >
                      Traer
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
