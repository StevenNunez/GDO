"use client";

/**
 * Curva S y valor ganado.
 *
 * Tres líneas sobre el mismo eje: lo programado (PV), lo ejecutado (EV) y lo
 * gastado (AC). De ahí salen el SPI y el CPI, que resumen la obra en dos
 * números. Toda la cuenta está en `src/lib/curva-s.ts`; esta pantalla solo
 * elige el rango y dibuja.
 */

import { useMemo, useState } from 'react';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip as RechartsTooltip, XAxis, YAxis, Legend,
} from 'recharts';
import { Activity, Info, TrendingUp } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { PlanLocked } from '@/components/plan-locked';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatCLP } from '@/lib/format';
import { formatDate, toCalendarDay } from '@/lib/date-utils';
import { calcFechaTermino } from '@/lib/contract';
import {
  SEMAFORO_TONO, construirCurvaS, costoRealA, indicadoresEV, leerCpi, leerSpi,
  semaforo, valorGanadoA, valorPlanificadoA, type GastoConFecha,
} from '@/lib/curva-s';

const PASOS = [
  { label: 'Semanal', dias: 7 },
  { label: 'Quincenal', dias: 15 },
  { label: 'Mensual', dias: 30 },
];

export default function CurvaSPage() {
  const {
    workItems, progressLogs, supplierPayments, contracts,
    currentProjectId, can, lockedFeature,
  } = useAppState();

  const [paso, setPaso] = useState(7);
  const hoy = useMemo(() => new Date(), []);

  const partidas = useMemo(
    () => workItems.filter((w) => w.projectId === currentProjectId),
    [workItems, currentProjectId],
  );

  const avances = useMemo(() => {
    const ids = new Set(partidas.map((p) => p.id));
    return progressLogs.filter((l) => ids.has(l.workItemId));
  }, [progressLogs, partidas]);

  /**
   * Costo real: las facturas de proveedor imputadas a la obra. Se usa la fecha
   * de emisión y no la de pago — el costo se devenga cuando se recibe la
   * factura, no cuando sale la plata.
   */
  const gastos = useMemo<GastoConFecha[]>(
    () => supplierPayments
      .filter((p) => p.projectId === currentProjectId)
      .map((p) => ({ fecha: p.issueDate, amount: p.amount })),
    [supplierPayments, currentProjectId],
  );

  const contrato = useMemo(
    () => contracts.find((c) => c.projectId === currentProjectId) ?? null,
    [contracts, currentProjectId],
  );

  /** El rango sale del programa: la primera fecha planificada y la última. */
  const rango = useMemo(() => {
    const inicios = partidas
      .map((p) => toCalendarDay(p.plannedStartDate))
      .filter((d): d is Date => !!d);
    const fines = partidas
      .map((p) => toCalendarDay(p.plannedEndDate))
      .filter((d): d is Date => !!d);

    const desde = inicios.length > 0
      ? new Date(Math.min(...inicios.map((d) => d.getTime())))
      : toCalendarDay(contrato?.startDate);

    const finPrograma = fines.length > 0
      ? new Date(Math.max(...fines.map((d) => d.getTime())))
      : calcFechaTermino(contrato?.startDate, contrato?.plazoDias);

    // La curva llega hasta el final del programa o hasta hoy, lo que sea más
    // tarde: si la obra se pasó del plazo, el gráfico tiene que mostrarlo.
    const hasta = finPrograma && finPrograma.getTime() > hoy.getTime()
      ? finPrograma
      : hoy;

    return { desde, hasta };
  }, [partidas, contrato, hoy]);

  const curva = useMemo(() => {
    if (!rango.desde) return null;
    return construirCurvaS(partidas, avances, gastos, {
      desde: rango.desde, hasta: rango.hasta, pasoDias: paso,
    });
  }, [partidas, avances, gastos, rango, paso]);

  /** Los índices al día de hoy, que es lo que se mira para decidir. */
  const indicadores = useMemo(() => {
    if (!curva) return null;
    return indicadoresEV({
      pv: valorPlanificadoA(partidas, hoy).pv,
      ev: valorGanadoA(partidas, avances, hoy),
      ac: costoRealA(gastos, hoy),
      bac: curva.bac,
    });
  }, [curva, partidas, avances, gastos, hoy]);

  const datos = useMemo(
    () => (curva?.puntos ?? []).map((p) => ({
      fecha: formatDate(p.fecha, { day: '2-digit', month: 'short' }),
      Programado: Number(p.pvPct.toFixed(1)),
      Ejecutado: Number(p.evPct.toFixed(1)),
      Gastado: Number(p.acPct.toFixed(1)),
    })),
    [curva],
  );

  const bloqueo = lockedFeature('cost_control:view');
  if (bloqueo) return <PlanLocked feature={bloqueo} title="Curva S" />;

  if (!can('module_technical_office:view')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Curva S" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No tienes permiso para ver este módulo.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Curva S y valor ganado"
        description="Lo programado, lo ejecutado y lo gastado en la misma línea de tiempo."
      />

      {!curva || curva.puntos.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 p-6 text-sm">
            <div className="font-medium text-foreground">
              Todavía no se puede dibujar la curva
            </div>
            <p className="text-muted-foreground">
              Hace falta que las partidas de la EDT tengan fechas programadas de inicio y
              término. Sin programa no hay contra qué comparar el avance: se cargan en
              Control de Obra → EDT.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Los dos números que resumen la obra */}
          {indicadores && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Indice
                icon={Activity}
                label="SPI · avance"
                valor={indicadores.spi}
                lectura={leerSpi(indicadores.spi)}
              />
              <Indice
                icon={TrendingUp}
                label="CPI · costo"
                valor={indicadores.cpi}
                lectura={leerCpi(indicadores.cpi)}
              />
              <Kpi
                label="Ejecutado a la fecha"
                valor={formatCLP(indicadores.ev)}
                detalle={`de ${formatCLP(indicadores.bac)} contratados`}
              />
              <Kpi
                label="Proyección a término"
                valor={indicadores.eac !== null ? formatCLP(indicadores.eac) : '—'}
                detalle={indicadores.vac !== null
                  ? (indicadores.vac < 0
                    ? `${formatCLP(Math.abs(indicadores.vac))} sobre el presupuesto`
                    : `${formatCLP(indicadores.vac)} bajo el presupuesto`)
                  : 'Falta costo imputado'}
                tono={indicadores.vac !== null && indicadores.vac < 0 ? 'danger' : undefined}
              />
            </div>
          )}

          {/* La curva */}
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Curva S</CardTitle>
              <div className="flex gap-1">
                {PASOS.map((p) => (
                  <Button
                    key={p.dias} size="sm"
                    variant={paso === p.dias ? 'default' : 'outline'}
                    onClick={() => setPaso(p.dias)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={datos} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="fecha" tick={{ fontSize: 11 }}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis
                      tick={{ fontSize: 11 }} unit="%" domain={[0, 100]}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <RechartsTooltip
                      formatter={(v: number) => `${v}%`}
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone" dataKey="Programado" dot={false} strokeWidth={2}
                      stroke="hsl(var(--muted-foreground))" strokeDasharray="5 4"
                    />
                    <Line
                      type="monotone" dataKey="Ejecutado" dot={false} strokeWidth={2.5}
                      stroke="hsl(var(--primary))"
                    />
                    <Line
                      type="monotone" dataKey="Gastado" dot={false} strokeWidth={2}
                      stroke="hsl(var(--warning))"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                El valor programado de cada partida se reparte linealmente entre su fecha de
                inicio y su fecha de término. Es la convención habitual; si una partida tiene
                una curva de avance distinta, la línea programada la aproxima.
              </p>

              {curva.sinProgramar > 0 && (
                <p className="mt-2 text-xs text-warning">
                  {curva.sinProgramar} partida(s) por {formatCLP(curva.valorSinProgramar)} no
                  tienen fechas programadas: quedan fuera de la línea programada. Cárgalas
                  para que la curva no muestre un atraso que no existe.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Desglose */}
          {indicadores && (
            <Card>
              <CardHeader><CardTitle className="text-base">Al día de hoy</CardTitle></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <Detalle
                  label="Debería estar hecho (PV)"
                  valor={formatCLP(indicadores.pv)}
                />
                <Detalle
                  label="Está hecho (EV)"
                  valor={formatCLP(indicadores.ev)}
                  detalle={`${indicadores.sv < 0 ? '−' : '+'}${formatCLP(Math.abs(indicadores.sv))} respecto del programa`}
                  tono={indicadores.sv < 0 ? 'danger' : 'success'}
                />
                <Detalle
                  label="Se ha gastado (AC)"
                  valor={formatCLP(indicadores.ac)}
                  detalle={indicadores.ac > 0
                    ? `${indicadores.cv < 0 ? '−' : '+'}${formatCLP(Math.abs(indicadores.cv))} respecto de lo ejecutado`
                    : 'Sin facturas imputadas a la obra'}
                  tono={indicadores.ac > 0 && indicadores.cv < 0 ? 'danger' : undefined}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/* ── Piezas ────────────────────────────────────────────────────────────── */

function Indice({
  icon: Icon, label, valor, lectura,
}: {
  icon: React.ElementType;
  label: string;
  valor: number | null;
  lectura: string;
}) {
  const tono = SEMAFORO_TONO[semaforo(valor)];
  return (
    <Card>
      <CardContent className="space-y-1 p-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-foreground">
            {valor !== null ? valor.toFixed(2) : '—'}
          </span>
          {valor !== null && (
            <StatusBadge tone={tono}>
              {valor >= 0.95 ? 'En rango' : valor >= 0.9 ? 'Atención' : 'Crítico'}
            </StatusBadge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{lectura}</p>
      </CardContent>
    </Card>
  );
}

function Kpi({
  label, valor, detalle, tono,
}: {
  label: string;
  valor: string;
  detalle?: string;
  tono?: 'danger';
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="text-xl font-bold text-foreground">{valor}</div>
        {detalle && (
          tono === 'danger'
            ? <StatusBadge tone="danger">{detalle}</StatusBadge>
            : <p className="text-xs text-muted-foreground">{detalle}</p>
        )}
      </CardContent>
    </Card>
  );
}

function Detalle({
  label, valor, detalle, tono,
}: {
  label: string;
  valor: string;
  detalle?: string;
  tono?: 'danger' | 'success';
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-semibold text-foreground">{valor}</div>
      {detalle && (
        <p className={`text-xs ${tono === 'danger' ? 'text-danger' : tono === 'success' ? 'text-success' : 'text-muted-foreground'}`}>
          {detalle}
        </p>
      )}
    </div>
  );
}
