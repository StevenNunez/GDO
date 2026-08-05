"use client";

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarRange } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { PlanLocked } from '@/components/plan-locked';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDate } from '@/lib/date-utils';
import {
  domingoDeLaSemana, addSemanas, semanasDeLookahead,
  tareasDeLaSemana, saludPrograma, claveSemana,
} from '@/lib/last-planner';
import { ProgramacionSemana } from '@/components/operations/programacion-semana';
import { ProgramacionLookahead } from '@/components/operations/programacion-lookahead';
import { ProgramacionAnalisis } from '@/components/operations/programacion-analisis';

/** Horizonte del lookahead. Seis semanas es lo habitual en obra. */
const SEMANAS_LOOKAHEAD = 6;

export default function ProgramacionPage() {
  const { lookaheadTasks, taskConstraints, currentProjectId, can, lockedFeature } = useAppState();

  const [offset, setOffset] = useState(0);

  const semana = useMemo(
    () => addSemanas(new Date(), offset),
    [offset],
  );
  const domingo = domingoDeLaSemana(semana);

  const delProyecto = useMemo(
    () => lookaheadTasks.filter((t) => t.projectId === currentProjectId),
    [lookaheadTasks, currentProjectId],
  );

  const tareasSemana = useMemo(
    () => tareasDeLaSemana(delProyecto, semana),
    [delProyecto, semana],
  );

  /** Tareas del horizonte de lookahead, para las alertas de la cabecera. */
  const tareasHorizonte = useMemo(() => {
    const claves = new Set(
      semanasDeLookahead(semana, SEMANAS_LOOKAHEAD).map((s) => claveSemana(s)),
    );
    return delProyecto.filter((t) => claves.has(claveSemana(t.weekStart)));
  }, [delProyecto, semana]);

  const salud = useMemo(
    () => saludPrograma(tareasSemana, tareasHorizonte, taskConstraints),
    [tareasSemana, tareasHorizonte, taskConstraints],
  );

  const editable = can('planning:manage');

  const bloqueoDePlan = lockedFeature('planning:view');
  if (bloqueoDePlan) return <PlanLocked feature={bloqueoDePlan} title="Programación" />;

  if (!can('planning:view') && !editable) {
    return (
      <div className="space-y-6">
        <PageHeader title="Programación" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No tienes permiso para ver la programación de la obra.
        </CardContent></Card>
      </div>
    );
  }

  if (!currentProjectId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Programación" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Selecciona una obra para ver su programación.
        </CardContent></Card>
      </div>
    );
  }

  const esSemanaActual = offset === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Programación"
        description="Lookahead, programa semanal y PPC. La carta Gantt dice lo que debería pasar; esto dice qué se comprometió, qué se cumplió y por qué no."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setOffset((o) => o - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[11rem] text-center">
              <div className="text-sm font-medium text-foreground">
                {esSemanaActual ? 'Semana actual' : formatDate(semana)}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDate(semana)} — {domingo ? formatDate(domingo) : ''}
              </div>
            </div>
            <Button variant="outline" size="icon" onClick={() => setOffset((o) => o + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            {!esSemanaActual && (
              <Button variant="ghost" size="sm" onClick={() => setOffset(0)}>Hoy</Button>
            )}
          </div>
        }
      />

      {/* Los cuatro números que explican la semana */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="PPC de la semana"
          value={salud.ppc.ppc !== null ? `${salud.ppc.ppc.toFixed(0)}%` : '—'}
          hint={salud.ppc.comprometidas > 0
            ? `${salud.ppc.cumplidas} de ${salud.ppc.comprometidas} compromisos`
            : 'sin compromisos esta semana'}
          tone={salud.ppc.ppc !== null && salud.ppc.ppc < 80 ? 'danger' : undefined}
        />
        <Kpi
          label="Comprometidas sin liberar"
          value={`${salud.comprometidasConRestriccion}`}
          hint="trabajo prometido que no estaba listo"
          tone={salud.comprometidasConRestriccion > 0 ? 'danger' : undefined}
        />
        <Kpi
          label="Listas para comprometer"
          value={`${salud.liberadasSinComprometer}`}
          hint="en el lookahead, sin restricciones"
        />
        <Kpi
          label="Restricciones pendientes"
          value={`${salud.restriccionesPendientes}`}
          hint={salud.restriccionesVencidas > 0
            ? `${salud.restriccionesVencidas} con fecha vencida`
            : 'ninguna vencida'}
          tone={salud.restriccionesVencidas > 0 ? 'warning' : undefined}
        />
      </div>

      {salud.comprometidasConRestriccion > 0 && (
        <Card className="border-danger/40">
          <CardContent className="flex flex-wrap items-center gap-2 p-5 text-sm">
            <CalendarRange className="h-4 w-4 text-danger" />
            <span className="font-medium text-foreground">
              {salud.comprometidasConRestriccion} tarea(s) comprometida(s) con restricciones sin levantar.
            </span>
            <span className="text-muted-foreground">
              Es la explicación más común de un PPC bajo: se prometió trabajo que todavía no se
              podía hacer.
            </span>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="semana">
        <TabsList>
          <TabsTrigger value="semana">Programa semanal</TabsTrigger>
          <TabsTrigger value="lookahead">Lookahead</TabsTrigger>
          <TabsTrigger value="analisis">Análisis</TabsTrigger>
        </TabsList>

        <TabsContent value="semana" className="mt-4">
          <ProgramacionSemana semana={semana} editable={editable} />
        </TabsContent>

        <TabsContent value="lookahead" className="mt-4">
          <ProgramacionLookahead
            desde={semana}
            semanas={SEMANAS_LOOKAHEAD}
            editable={editable}
          />
        </TabsContent>

        <TabsContent value="analisis" className="mt-4">
          <ProgramacionAnalisis />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ label, value, hint, tone }: {
  label: string; value: string; hint?: string; tone?: 'warning' | 'danger';
}) {
  return (
    <Card className={tone === 'danger' ? 'border-danger/40' : undefined}>
      <CardContent className="space-y-1 p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className={`text-xl font-bold ${
          tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-foreground'
        }`}>
          {value}
        </div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
