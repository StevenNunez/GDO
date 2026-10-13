"use client";

import { useMemo, useState } from 'react';
import { Plus, Check, X, Trash2, ArrowRight, TrainFront } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { getLeafItems } from '@/lib/budget-costs';
import {
  tareasDeLaSemana, estaLiberada, claveSemana, addSemanas,
  CAUSAS_CNC, ESTADOS_TAREA,
} from '@/lib/last-planner';
import { RestriccionesTarea } from '@/components/operations/restricciones-tarea';
import { TraerDelTren } from '@/components/operations/traer-del-tren';
import { unidadesActivas, unidadesDeObra } from '@/lib/work-units';
import { indexarExcepciones } from '@/lib/work-calendar';
import { actividadesDeObra } from '@/lib/train';
import { progresosDeObra } from '@/lib/daily-report';
import { cierreDesdeElParte } from '@/lib/train-links';
import type { LookaheadTask, NonComplianceCause } from '@/modules/core/lib/data';
import { toneRail, type Tone } from '@/components/operations/planner-tone-classes';
import { cn } from '@/lib/utils';

const TONO_ESTADO: Record<LookaheadTask['status'], 'neutral' | 'info' | 'success' | 'danger'> = {
  planificada: 'neutral',
  comprometida: 'info',
  cumplida: 'success',
  no_cumplida: 'danger',
  anulada: 'neutral',
};

/** Color del riel de cada compromiso: verde cumplido, rojo no cumplido, azul comprometido, ámbar si se comprometió sin liberar. */
function tonoDeTarea(status: LookaheadTask['status'], liberada: boolean): Tone {
  if (status === 'cumplida') return 'success';
  if (status === 'no_cumplida') return 'danger';
  if (status === 'comprometida') return liberada ? 'info' : 'warning';
  return 'neutral';
}

/**
 * Programa semanal: lo que la obra se compromete a hacer esta semana y el
 * cierre de cada compromiso.
 *
 * El cierre es binario a propósito (ver `src/lib/last-planner.ts`): una tarea
 * se cumplió o no, y si no, hay que decir por qué. Esa causa es el único dato
 * que después permite dejar de tropezar con lo mismo.
 */
export function ProgramacionSemana({ semana, editable }: {
  semana: Date;
  editable: boolean;
}) {
  const {
    lookaheadTasks, taskConstraints, workItems, users, currentProjectId, notify,
    addLookaheadTask, updateLookaheadTask, cerrarTareaSemanal, deleteLookaheadTask,
    trainActivities, workUnits, workCalendarExceptions, dailyProgress, projects,
  } = useAppState();

  const [cerrando, setCerrando] = useState<string | null>(null);
  const [causa, setCausa] = useState<NonComplianceCause>('materiales');
  const [causaNota, setCausaNota] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [nueva, setNueva] = useState({
    name: '', responsibleName: '', workItemId: 'ninguna', unit: '', quantityPlanned: 0,
  });

  const delProyecto = useMemo(
    () => lookaheadTasks.filter((t) => t.projectId === currentProjectId),
    [lookaheadTasks, currentProjectId],
  );
  const tareas = useMemo(
    () => tareasDeLaSemana(delProyecto, semana).filter((t) => t.status !== 'anulada'),
    [delProyecto, semana],
  );

  const partidas = useMemo(
    () => getLeafItems(workItems.filter((w) => w.projectId === currentProjectId)),
    [workItems, currentProjectId],
  );

  /* Lo que hace falta para cerrar un compromiso con lo que dice el parte diario. */
  const obra = useMemo(
    () => projects.find((p) => p.id === currentProjectId) ?? null,
    [projects, currentProjectId],
  );
  const actividadesTren = useMemo(
    () => actividadesDeObra(trainActivities, currentProjectId),
    [trainActivities, currentProjectId],
  );
  const unidadesTren = useMemo(
    () => unidadesActivas(unidadesDeObra(workUnits, currentProjectId)),
    [workUnits, currentProjectId],
  );
  const calendarioTren = useMemo(
    () => indexarExcepciones(workCalendarExceptions, currentProjectId),
    [workCalendarExceptions, currentProjectId],
  );
  const progresosTren = useMemo(
    () => progresosDeObra(dailyProgress, currentProjectId),
    [dailyProgress, currentProjectId],
  );

  /**
   * Lo que el parte diario dice de cada compromiso que nació del tren.
   *
   * Se calcula para toda la semana de una vez y no tarea por tarea: son las
   * mismas celdas del tren para todas, y recalcularlas por fila dentro del
   * render haría el trabajo tantas veces como compromisos haya.
   */
  const cierresSugeridos = useMemo(() => {
    const mapa = new Map<string, ReturnType<typeof cierreDesdeElParte>>();
    for (const t of tareas) {
      if (!t.trainActivityId) continue;
      mapa.set(t.id, cierreDesdeElParte(
        t, actividadesTren, unidadesTren, progresosTren, obra?.workDays, calendarioTren,
      ));
    }
    return mapa;
  }, [tareas, actividadesTren, unidadesTren, progresosTren, obra?.workDays, calendarioTren]);

  const agregar = async () => {
    if (!nueva.name.trim()) {
      notify('Ponle nombre a la tarea.', 'destructive');
      return;
    }
    setOcupado(true);
    try {
      await addLookaheadTask({
        name: nueva.name.trim(),
        weekStart: claveSemana(semana) as never,
        responsibleName: nueva.responsibleName.trim() || null,
        workItemId: nueva.workItemId === 'ninguna' ? null : nueva.workItemId,
        unit: nueva.unit || null,
        quantityPlanned: nueva.quantityPlanned || 0,
        status: 'comprometida',
      });
      notify('Tarea agregada al programa de la semana.', 'success');
      setNueva({ name: '', responsibleName: '', workItemId: 'ninguna', unit: '', quantityPlanned: 0 });
    } catch (e: any) {
      notify(e.message ?? 'No se pudo agregar.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const comprometer = async (t: LookaheadTask) => {
    setOcupado(true);
    try {
      await updateLookaheadTask(t.id, { status: 'comprometida' });
    } catch (e: any) {
      notify(e.message ?? 'No se pudo comprometer.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const moverSiguienteSemana = async (t: LookaheadTask) => {
    setOcupado(true);
    try {
      await updateLookaheadTask(t.id, {
        weekStart: claveSemana(addSemanas(semana, 1)) as never,
        status: 'planificada',
      });
      notify('Tarea movida a la semana siguiente.', 'success');
    } catch (e: any) {
      notify(e.message ?? 'No se pudo mover.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const cerrarCumplida = async (t: LookaheadTask) => {
    setOcupado(true);
    try {
      await cerrarTareaSemanal(t.id, {
        cumplida: true,
        quantityDone: t.quantityPlanned || 0,
      });
    } catch (e: any) {
      notify(e.message ?? 'No se pudo cerrar.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  /**
   * Cierra el compromiso con lo que dice el parte diario de esa semana.
   *
   * Sigue siendo un botón que alguien aprieta: el parte propone y la reunión
   * del lunes decide. Lo que ahorra es tener que abrir el tren en otra pestaña
   * para contar deptos a mano, que es donde el PPC se llena de números de
   * memoria.
   */
  const cerrarConElParte = async (t: LookaheadTask) => {
    const sugerido = cierresSugeridos.get(t.id);
    if (!sugerido) return;
    setOcupado(true);
    try {
      await cerrarTareaSemanal(t.id, {
        cumplida: sugerido.cumplida,
        quantityDone: sugerido.quantityDone,
        // Sin causa en el parte se cae en «otra»: una tarea no cumplida sin
        // causa no la acepta la mutación, y con razón.
        causeCode: sugerido.cumplida ? undefined : (sugerido.causaSugerida ?? 'otra'),
        causeNote: sugerido.cumplida
          ? null
          : `Según el parte diario: ${Math.round(sugerido.hechas * 10) / 10} de `
            + `${sugerido.comprometidas} unidades terminadas.`,
      });
      notify(
        sugerido.cumplida
          ? 'Compromiso cerrado como cumplido según el parte diario.'
          : 'Compromiso cerrado como no cumplido, con la causa del parte diario.',
        'success',
      );
    } catch (e: any) {
      notify(e.message ?? 'No se pudo cerrar.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const cerrarNoCumplida = async (taskId: string) => {
    setOcupado(true);
    try {
      await cerrarTareaSemanal(taskId, {
        cumplida: false,
        causeCode: causa,
        causeNote: causaNota.trim() || null,
      });
      notify('Compromiso cerrado con su causa.', 'success');
      setCerrando(null);
      setCausaNota('');
    } catch (e: any) {
      notify(e.message ?? 'No se pudo cerrar.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const reabrir = async (t: LookaheadTask) => {
    setOcupado(true);
    try {
      await updateLookaheadTask(t.id, { status: 'comprometida', causeCode: null, causeNote: null });
    } catch (e: any) {
      notify(e.message ?? 'No se pudo reabrir.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const borrar = async (id: string) => {
    setOcupado(true);
    try {
      await deleteLookaheadTask(id);
    } catch (e: any) {
      notify(e.message ?? 'No se pudo eliminar.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="space-y-4">
      {editable && <TraerDelTren semana={semana} />}

      {tareas.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Esta semana aún no tiene tareas. Agrégalas aquí o tráelas desde el plan de mediano plazo.
            Compromete solo actividades con las restricciones liberadas.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tareas.map((t) => {
            const liberada = estaLiberada(t.id, taskConstraints);
            const partida = t.workItemId
              ? workItems.find((w) => w.id === t.workItemId)
              : null;
            const responsable = t.responsibleName
              ?? (t.responsibleId ? users.find((u) => u.id === t.responsibleId)?.name : null);
            const cerrada = t.status === 'cumplida' || t.status === 'no_cumplida';

            return (
              <Card key={t.id} className={cn('relative overflow-hidden before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r-full', toneRail[tonoDeTarea(t.status, liberada)])}>
                <CardContent className="space-y-3 p-4 pl-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground">{t.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {partida ? `${partida.name} · ` : ''}
                        {responsable ?? 'Sin responsable'}
                        {t.quantityPlanned > 0
                          ? ` · ${t.quantityPlanned.toLocaleString('es-CL')} ${t.unit ?? ''}`
                          : ''}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={TONO_ESTADO[t.status]}>
                        {ESTADOS_TAREA[t.status]}
                      </StatusBadge>
                      {t.status === 'comprometida' && !liberada && (
                        <StatusBadge tone="danger">Comprometida sin liberar</StatusBadge>
                      )}
                    </div>
                  </div>

                  {t.status === 'no_cumplida' && t.causeCode && (
                    <div className="rounded-lg border border-danger/40 border-l-[3px] border-l-danger bg-card p-2.5 text-sm">
                      <span className="font-medium text-foreground">
                        {CAUSAS_CNC[t.causeCode]}
                      </span>
                      {t.causeNote ? (
                        <span className="text-muted-foreground"> — {t.causeNote}</span>
                      ) : null}
                    </div>
                  )}

                  {/* Lo que el parte diario dice de este compromiso */}
                  {(() => {
                    const sugerido = cierresSugeridos.get(t.id);
                    if (!sugerido) return null;
                    return (
                      <div className={cn(
                        'rounded-lg border border-l-[3px] bg-card p-2.5 text-xs',
                        sugerido.cumplida ? 'border-success/40 border-l-success' : 'border-border border-l-muted-foreground/50',
                      )}>
                        <span className="font-medium text-foreground">Según el parte diario: </span>
                        <span className="text-muted-foreground">
                          {sugerido.conDatos
                            ? `${Math.round(sugerido.hechas * 10) / 10} de ${sugerido.comprometidas} `
                              + `unidades terminadas${
                                !sugerido.cumplida && sugerido.causaSugerida
                                  ? ` · lo que más frenó: ${CAUSAS_CNC[sugerido.causaSugerida]}`
                                  : ''}`
                            : 'esta semana no se cargó ningún parte de esta actividad.'}
                        </span>
                      </div>
                    );
                  })()}

                  <RestriccionesTarea taskId={t.id} editable={editable} />

                  {editable && (
                    <div className="flex flex-wrap gap-2">
                      {t.status === 'planificada' && (
                        <Button size="sm" disabled={ocupado} onClick={() => comprometer(t)}>
                          Comprometer esta semana
                        </Button>
                      )}
                      {t.status === 'comprometida' && (
                        <>
                          {cierresSugeridos.get(t.id)?.conDatos && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-primary/40 text-primary"
                              disabled={ocupado}
                              onClick={() => cerrarConElParte(t)}
                            >
                              <TrainFront className="mr-1.5 h-3.5 w-3.5" />
                              Cerrar con el parte
                            </Button>
                          )}
                          <Button
                            size="sm"
                            className="bg-success text-background hover:bg-success/90"
                            disabled={ocupado}
                            onClick={() => cerrarCumplida(t)}
                          >
                            <Check className="mr-1.5 h-3.5 w-3.5" /> Cumplida
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-danger/40 text-danger"
                            disabled={ocupado}
                            onClick={() => setCerrando(cerrando === t.id ? null : t.id)}
                          >
                            <X className="mr-1.5 h-3.5 w-3.5" /> No cumplida
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={ocupado}
                            onClick={() => moverSiguienteSemana(t)}
                          >
                            <ArrowRight className="mr-1.5 h-3.5 w-3.5" /> Mover a la próxima
                          </Button>
                        </>
                      )}
                      {cerrada && (
                        <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => reabrir(t)}>
                          Reabrir
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => borrar(t.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}

                  {cerrando === t.id && (
                    <div className="grid gap-3 rounded-lg border border-danger/40 border-l-[3px] border-l-danger bg-card p-3 sm:grid-cols-[1fr_1fr_auto]">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          ¿Por qué no se cumplió?
                        </Label>
                        <Select value={causa} onValueChange={(v) => setCausa(v as NonComplianceCause)}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(CAUSAS_CNC).map(([k, label]) => (
                              <SelectItem key={k} value={k}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Detalle (opcional)</Label>
                        <Input
                          className="h-8"
                          value={causaNota}
                          onChange={(e) => setCausaNota(e.target.value)}
                        />
                      </div>
                      <div className="flex items-end">
                        <Button size="sm" disabled={ocupado} onClick={() => cerrarNoCumplida(t.id)}>
                          Registrar
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {editable && (
        <Card>
          <CardHeader><CardTitle className="text-base">Agregar tarea a esta semana</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-1 lg:col-span-2">
              <Label className="text-xs text-muted-foreground">Tarea</Label>
              <Input
                className="h-8"
                value={nueva.name}
                placeholder="Ej: hormigonar losa piso 3"
                onChange={(e) => setNueva((n) => ({ ...n, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Responsable</Label>
              <Input
                className="h-8"
                value={nueva.responsibleName}
                onChange={(e) => setNueva((n) => ({ ...n, responsibleName: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Partida</Label>
              <Select
                value={nueva.workItemId}
                onValueChange={(v) => setNueva((n) => ({ ...n, workItemId: v }))}
              >
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguna">Sin partida</SelectItem>
                  {partidas.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Cantidad</Label>
              <Input
                className="h-8"
                type="number"
                value={nueva.quantityPlanned || ''}
                onChange={(e) => setNueva((n) => ({ ...n, quantityPlanned: Number(e.target.value) }))}
              />
            </div>
            <div className="flex items-end">
              <Button size="sm" disabled={ocupado} onClick={agregar}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Agregar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
