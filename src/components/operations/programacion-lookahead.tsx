"use client";

import { useMemo, useState } from 'react';
import { Plus, ArrowLeft, ArrowRight, Trash2 } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatDate } from '@/lib/date-utils';
import { getLeafItems } from '@/lib/budget-costs';
import {
  semanasDeLookahead, tareasDeLaSemana, estaLiberada, claveSemana, addSemanas,
  domingoDeLaSemana,
} from '@/lib/last-planner';
import { RestriccionesTarea } from '@/components/operations/restricciones-tarea';
import type { LookaheadTask } from '@/modules/core/lib/data';

/**
 * Lookahead: las próximas semanas, para sacarle las restricciones a cada tarea
 * **antes** de que llegue su semana. Es la parte del sistema que realmente
 * cambia el resultado: comprometer sin haber liberado es lo que hunde el PPC.
 */
export function ProgramacionLookahead({ desde, semanas, editable }: {
  desde: Date;
  semanas: number;
  editable: boolean;
}) {
  const {
    lookaheadTasks, taskConstraints, workItems, currentProjectId, notify,
    addLookaheadTask, updateLookaheadTask, deleteLookaheadTask,
  } = useAppState();

  const [nueva, setNueva] = useState<Record<string, { name: string; workItemId: string }>>({});
  const [ocupado, setOcupado] = useState(false);

  const listaSemanas = useMemo(
    () => semanasDeLookahead(desde, semanas),
    [desde, semanas],
  );

  const delProyecto = useMemo(
    () => lookaheadTasks.filter((t) => t.projectId === currentProjectId && t.status !== 'anulada'),
    [lookaheadTasks, currentProjectId],
  );

  const partidas = useMemo(
    () => getLeafItems(workItems.filter((w) => w.projectId === currentProjectId)),
    [workItems, currentProjectId],
  );

  const agregar = async (semana: Date) => {
    const clave = claveSemana(semana);
    const datos = nueva[clave];
    if (!datos?.name?.trim()) {
      notify('Ponle nombre a la tarea.', 'destructive');
      return;
    }
    setOcupado(true);
    try {
      await addLookaheadTask({
        name: datos.name.trim(),
        weekStart: clave as never,
        workItemId: datos.workItemId && datos.workItemId !== 'ninguna' ? datos.workItemId : null,
        status: 'planificada',
      });
      setNueva((n) => ({ ...n, [clave]: { name: '', workItemId: 'ninguna' } }));
    } catch (e: any) {
      notify(e.message ?? 'No se pudo agregar.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const mover = async (t: LookaheadTask, delta: number) => {
    setOcupado(true);
    try {
      await updateLookaheadTask(t.id, {
        weekStart: claveSemana(addSemanas(t.weekStart, delta)) as never,
      });
    } catch (e: any) {
      notify(e.message ?? 'No se pudo mover.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Mira las próximas {semanas} semanas y anótale a cada tarea lo que le falta para poder
        ejecutarse. Una tarea llega lista a su semana o no llega.
      </p>

      {listaSemanas.map((semana, i) => {
        const clave = claveSemana(semana);
        const tareas = tareasDeLaSemana(delProyecto, semana);
        const domingo = domingoDeLaSemana(semana);
        const liberadas = tareas.filter((t) => estaLiberada(t.id, taskConstraints)).length;
        const datos = nueva[clave] ?? { name: '', workItemId: 'ninguna' };

        return (
          <Card key={clave} className={i === 0 ? 'border-primary/50' : undefined}>
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-3 text-base">
                <span>
                  {i === 0 ? 'Esta semana' : `Semana +${i}`}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {formatDate(semana)} — {domingo ? formatDate(domingo) : ''}
                  </span>
                </span>
                {tareas.length > 0 && (
                  <StatusBadge tone={liberadas === tareas.length ? 'success' : 'warning'}>
                    {liberadas} de {tareas.length} liberadas
                  </StatusBadge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {tareas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin tareas planificadas.</p>
              ) : (
                <ul className="space-y-2">
                  {tareas.map((t) => {
                    const partida = t.workItemId
                      ? workItems.find((w) => w.id === t.workItemId)
                      : null;
                    return (
                      <li key={t.id} className="space-y-2 rounded-xl border border-border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium text-foreground">{t.name}</div>
                            {partida && (
                              <div className="text-xs text-muted-foreground">{partida.name}</div>
                            )}
                          </div>
                          {editable && (
                            <div className="flex gap-1">
                              <Button
                                variant="ghost" size="sm" disabled={ocupado}
                                onClick={() => mover(t, -1)}
                              >
                                <ArrowLeft className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost" size="sm" disabled={ocupado}
                                onClick={() => mover(t, 1)}
                              >
                                <ArrowRight className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost" size="sm" disabled={ocupado}
                                onClick={() => deleteLookaheadTask(t.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                        <RestriccionesTarea taskId={t.id} editable={editable} />
                      </li>
                    );
                  })}
                </ul>
              )}

              {editable && (
                <div className="flex flex-wrap items-end gap-2">
                  <Input
                    className="h-8 min-w-[12rem] flex-1"
                    placeholder="Agregar tarea a esta semana…"
                    value={datos.name}
                    onChange={(e) => setNueva((n) => ({
                      ...n, [clave]: { ...datos, name: e.target.value },
                    }))}
                  />
                  <Select
                    value={datos.workItemId}
                    onValueChange={(v) => setNueva((n) => ({
                      ...n, [clave]: { ...datos, workItemId: v },
                    }))}
                  >
                    <SelectTrigger className="h-8 w-[13rem]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ninguna">Sin partida</SelectItem>
                      {partidas.map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" disabled={ocupado} onClick={() => agregar(semana)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Agregar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
