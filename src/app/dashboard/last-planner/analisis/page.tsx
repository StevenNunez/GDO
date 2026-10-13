"use client";

import { useMemo, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, Users, AlertTriangle, Activity } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { PlanLocked } from '@/components/plan-locked';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatDate } from '@/lib/date-utils';
import { unidadesActivas, unidadesDeObra } from '@/lib/work-units';
import { indexarExcepciones, claveDia } from '@/lib/work-calendar';
import { actividadesDeObra, ritmoEnPalabras } from '@/lib/train';
import { progresosDeObra, comoPorcentaje } from '@/lib/daily-report';
import { CAUSAS_CNC } from '@/lib/last-planner';
import {
  curvaDeActividad, rendimientoPorResponsable, paretoDiario,
  serieDiaria, resumenDelTren,
} from '@/lib/train-analytics';
import { TraspasoEDT } from '@/components/operations/traspaso-edt';
import { Metric } from '@/components/operations/planner-ui';
import { toneForProgress } from '@/lib/planner-tones';

/**
 * Los números que salen del tren y del parte diario.
 *
 * Es la pantalla que responde las tres preguntas que hoy se contestan a mano
 * con el Excel: cuánto se va atrasado, qué cuadrilla rinde, y qué es lo que
 * más frena la obra.
 */
export default function AnalisisTrenPage() {
  const {
    trainActivities, workUnits, workCalendarExceptions, dailyProgress,
    projects, currentProjectId, can, lockedFeature,
  } = useAppState();

  const [actividadElegida, setActividadElegida] = useState<string | null>(null);

  const obra = useMemo(
    () => projects.find((p) => p.id === currentProjectId) ?? null,
    [projects, currentProjectId],
  );

  const unidades = useMemo(
    () => unidadesActivas(unidadesDeObra(workUnits, currentProjectId)),
    [workUnits, currentProjectId],
  );

  const calendario = useMemo(
    () => indexarExcepciones(workCalendarExceptions, currentProjectId),
    [workCalendarExceptions, currentProjectId],
  );

  const actividades = useMemo(
    () => actividadesDeObra(trainActivities, currentProjectId),
    [trainActivities, currentProjectId],
  );

  const progresos = useMemo(
    () => progresosDeObra(dailyProgress, currentProjectId),
    [dailyProgress, currentProjectId],
  );

  const resumen = useMemo(
    () => resumenDelTren(actividades, unidades, progresos, obra?.workDays, calendario),
    [actividades, unidades, progresos, obra?.workDays, calendario],
  );

  const rendimientos = useMemo(
    () => rendimientoPorResponsable(actividades, unidades, progresos),
    [actividades, unidades, progresos],
  );

  const pareto = useMemo(() => paretoDiario(progresos), [progresos]);

  const serie = useMemo(
    () => serieDiaria(progresos, actividades, unidades, 14),
    [progresos, actividades, unidades],
  );

  /* La curva arranca en la actividad más atrasada: es la que hay que mirar. */
  const idCurva = actividadElegida
    ?? resumen.atrasadas[0]?.actividad.id
    ?? actividades[0]?.id
    ?? null;

  const actividadCurva = actividades.find((a) => a.id === idCurva) ?? null;

  const curva = useMemo(() => {
    if (!actividadCurva) return [];
    return curvaDeActividad(
      actividadCurva, unidades, progresos, obra?.workDays, calendario,
    ).map((p) => ({
      fecha: claveDia(p.fecha).slice(5).replace('-', '/'),
      Programado: p.programado,
      Real: p.real,
    }));
  }, [actividadCurva, unidades, progresos, obra?.workDays, calendario]);

  const bloqueoDePlan = lockedFeature('planning:view');
  if (bloqueoDePlan) return <PlanLocked feature={bloqueoDePlan} title="Análisis del tren" />;

  if (!can('planning:view') && !can('planning:manage')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Análisis del tren" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No tienes permiso para ver la programación de la obra.
        </CardContent></Card>
      </div>
    );
  }

  if (!currentProjectId || actividades.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Análisis del tren" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          {!currentProjectId
            ? 'Selecciona una obra.'
            : 'La obra todavía no tiene tren de actividades que analizar.'}
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Controlar"
        title="Análisis del tren"
        description="Cuánto se va atrasado, qué cuadrilla rinde y qué es lo que más frena la obra. Todo sale del parte diario."
      />

      {/* Los cuatro números que resumen el tren. El color dice si el número es bueno, de cuidado o malo. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={Activity}
          label="Avance del tren"
          value={`${comoPorcentaje(resumen.avance)}%`}
          hint={`${resumen.reales} de ${resumen.total} unidades`}
          tone={toneForProgress(resumen.avance)}
        />
        <Metric
          icon={TrendingUp}
          label="Contra el programa"
          value={`${resumen.reales - resumen.programadas >= 0 ? '+' : ''}${
            Math.round((resumen.reales - resumen.programadas) * 10) / 10}`}
          hint={`deberían ir ${resumen.programadas} unidades`}
          tone={resumen.reales < resumen.programadas - 0.5 ? 'danger' : 'success'}
        />
        <Metric
          icon={AlertTriangle}
          label="Actividades atrasadas"
          value={resumen.atrasadas.length}
          hint={resumen.atrasadas[0]
            ? `la peor: ${resumen.atrasadas[0].actividad.name}`
            : 'ninguna'}
          tone={resumen.atrasadas.length > 0 ? 'danger' : 'success'}
        />
        <Metric
          icon={Users}
          label="Cuadrilla más productiva"
          value={rendimientos[0]?.rendimiento != null
            ? `${redondear(rendimientos[0].rendimiento)}`
            : '—'}
          hint={rendimientos[0]?.rendimiento != null
            ? `${rendimientos[0].responsable} · unidades por jornada`
            : 'faltan jornadas cargadas'}
          tone={rendimientos[0]?.rendimiento != null ? 'info' : 'neutral'}
        />
      </div>

      {/* Curva de la actividad */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-base font-semibold tracking-tight text-foreground">
                Programado contra real
              </div>
              <p className="text-xs text-muted-foreground">
                Unidades acumuladas, semana a semana. Es la curva que hoy se lleva en una
                hoja de Excel por cada actividad.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="an-actividad" className="text-xs text-muted-foreground">
                Actividad
              </Label>
              <Select value={idCurva ?? ''} onValueChange={setActividadElegida}>
                <SelectTrigger id="an-actividad" className="h-9 w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {actividades.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {curva.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Esta actividad todavía no tiene fecha de inicio, así que no hay curva
              que dibujar.
            </p>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={curva} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="fecha" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} />
                  <RechartsTooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="Programado" stroke="hsl(var(--cta))"
                    strokeWidth={2} dot={false} strokeDasharray="5 4" />
                  {/* `connectNulls` en false a propósito: las semanas futuras no
                      tienen dato real y unirlas dibujaría un avance inventado. */}
                  <Line type="monotone" dataKey="Real" stroke="hsl(var(--primary))"
                    strokeWidth={2.5} dot={false} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {actividadCurva && (
            <p className="text-xs text-muted-foreground">
              {actividadCurva.responsibleName ?? 'Sin responsable'}
              {' · '}{ritmoEnPalabras(actividadCurva.daysPerUnit)}
              {actividadCurva.startDate
                ? ` · empieza el ${formatDate(actividadCurva.startDate)}`
                : ''}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Rendimiento por cuadrilla */}
        <Card>
          <CardContent className="space-y-3 p-5">
            <div>
              <div className="text-base font-semibold tracking-tight text-foreground">
                Rendimiento por cuadrilla
              </div>
              <p className="text-xs text-muted-foreground">
                Unidades terminadas por jornada gastada. Es el dato que hoy sale a mano
                de las columnas HD y UN del Excel.
              </p>
            </div>

            {rendimientos.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">Sin datos todavía.</p>
            ) : (
              <ul className="divide-y divide-border">
                {rendimientos.map((r) => (
                  <li key={r.responsable} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {r.responsable}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.unidades} unidades · {redondear(r.jornadas)} jornadas
                        {' · '}{r.actividades} actividad(es)
                      </div>
                    </div>
                    {r.rendimiento != null ? (
                      <StatusBadge tone={r.rendimiento >= 1 ? 'success' : 'neutral'}>
                        {redondear(r.rendimiento)} u/jornada
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral">sin jornadas</StatusBadge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Pareto */}
        <Card>
          <CardContent className="space-y-3 p-5">
            <div>
              <div className="text-base font-semibold tracking-tight text-foreground">
                Qué frena la obra
              </div>
              <p className="text-xs text-muted-foreground">
                De lo que más se repite a lo que menos. Cada día que una unidad queda
                frenada cuenta una vez.
              </p>
            </div>

            {pareto.causas.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                Todavía no se ha registrado ninguna causa de detención.
              </p>
            ) : (
              <ul className="space-y-2">
                {pareto.causas.map((c) => (
                  <li key={c.cause} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-foreground">{CAUSAS_CNC[c.cause]}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {c.cantidad} ({c.porcentaje.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-danger"
                        style={{ width: `${c.porcentaje}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pulso de los últimos días */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <div>
            <div className="text-base font-semibold tracking-tight text-foreground">
              Pulso de las últimas dos semanas
            </div>
            <p className="text-xs text-muted-foreground">
              Unidades equivalentes avanzadas cada día. Sirve para ver si la obra
              mantiene el ritmo o se está cayendo.
            </p>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={serie.map((p) => ({
                  fecha: claveDia(p.fecha).slice(5).replace('-', '/'),
                  Unidades: p.unidades,
                }))}
                margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="fecha" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} />
                <RechartsTooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="Unidades" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* El enganche con la EDT: el mismo avance, en el lenguaje del contrato */}
      <TraspasoEDT />

      {/* Las atrasadas, en detalle */}
      {resumen.atrasadas.length > 0 && (
        <Card className="border-danger/40">
          <CardContent className="space-y-3 p-5">
            <div className="text-base font-semibold tracking-tight text-foreground">
              Actividades atrasadas
            </div>
            <ul className="divide-y divide-border">
              {resumen.atrasadas.map(({ actividad, desviacion }) => (
                <li key={actividad.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {actividad.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {actividad.responsibleName ?? 'Sin responsable'}
                      {' · '}van {Math.round(desviacion.reales * 10) / 10} de{' '}
                      {desviacion.programadas} unidades programadas
                    </div>
                  </div>
                  <StatusBadge tone="danger">
                    {Math.abs(desviacion.diasDeAtraso)} día(s) atrás
                  </StatusBadge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Un decimal y coma, como se escribe en Chile. */
function redondear(n: number): string {
  const v = Math.round(n * 100) / 100;
  return Number.isInteger(v) ? String(v) : String(v).replace('.', ',');
}
