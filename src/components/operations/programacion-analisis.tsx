"use client";

import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip as RechartsTooltip, ReferenceLine,
} from 'recharts';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/date-utils';
import { tendenciaPpc, paretoDeCausas, calcPpc, CAUSAS_CNC } from '@/lib/last-planner';

/** Referencia habitual del sistema: bajo 80% el programa no es confiable. */
const PPC_OBJETIVO = 80;

/**
 * Análisis: la tendencia del PPC y el Pareto de causas.
 *
 * Un PPC aislado no dice nada; lo que sirve es la serie (¿la obra está
 * aprendiendo a comprometerse bien?) y la lista ordenada de por qué falla, que
 * es la agenda de la reunión semanal.
 */
export function ProgramacionAnalisis() {
  const { lookaheadTasks, currentProjectId } = useAppState();

  const tareas = useMemo(
    () => lookaheadTasks.filter((t) => t.projectId === currentProjectId),
    [lookaheadTasks, currentProjectId],
  );

  const serie = useMemo(() => tendenciaPpc(tareas), [tareas]);
  const pareto = useMemo(() => paretoDeCausas(tareas), [tareas]);
  const global = useMemo(() => calcPpc(tareas), [tareas]);

  const datosGrafico = serie.map((p) => ({
    semana: formatDate(p.fecha, { day: '2-digit', month: '2-digit' }),
    ppc: p.ppc !== null ? Number(p.ppc.toFixed(1)) : null,
    comprometidas: p.comprometidas,
  }));

  const promedio = serie.length > 0
    ? serie.reduce((s, p) => s + (p.ppc ?? 0), 0) / serie.filter((p) => p.ppc !== null).length
    : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Resumen
          label="PPC acumulado"
          value={global.ppc !== null ? `${global.ppc.toFixed(0)}%` : '—'}
          hint={`${global.cumplidas} de ${global.cumplidas + global.noCumplidas} compromisos cumplidos`}
        />
        <Resumen
          label="PPC promedio semanal"
          value={promedio !== null && !Number.isNaN(promedio) ? `${promedio.toFixed(0)}%` : '—'}
          hint={`${serie.length} semana(s) con programa`}
        />
        <Resumen
          label="Incumplimientos"
          value={`${pareto.total}`}
          hint={pareto.sinCausa > 0 ? `${pareto.sinCausa} sin causa registrada` : 'todos con causa'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Tendencia del PPC
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              La línea de referencia es 80%: bajo eso, el programa no es confiable.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {datosGrafico.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay semanas cerradas. El PPC aparece cuando se cierran los compromisos de
              una semana.
            </p>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={datosGrafico} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <RechartsTooltip
                    formatter={(v: any) => [`${v}%`, 'PPC']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                  />
                  <ReferenceLine y={PPC_OBJETIVO} stroke="hsl(var(--warning))" strokeDasharray="4 4" />
                  <Line
                    type="monotone"
                    dataKey="ppc"
                    stroke="hsl(var(--info))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Por qué no se cumplió
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              De lo que más se repite a lo que menos: esta es la agenda de la reunión semanal.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pareto.causas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin incumplimientos con causa registrada.
            </p>
          ) : (
            <ul className="space-y-2">
              {pareto.causas.map((c) => (
                <li key={c.cause} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-foreground">{CAUSAS_CNC[c.cause]}</span>
                    <span className="text-muted-foreground">
                      {c.cantidad} · {c.porcentaje.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-danger"
                      style={{ width: `${c.porcentaje}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {pareto.sinCausa > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <StatusBadge tone="warning">
                {pareto.sinCausa} incumplimiento(s) sin causa
              </StatusBadge>
              <span className="text-xs text-muted-foreground">
                No se reparten entre las demás: repartirlos inventaría un diagnóstico.
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Resumen({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="text-xl font-bold text-foreground">{value}</div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
