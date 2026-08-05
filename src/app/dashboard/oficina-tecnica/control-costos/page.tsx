"use client";

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, TrendingDown, Info } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { PlanLocked } from '@/components/plan-locked';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCLP } from '@/lib/format';
import { computeApu } from '@/lib/apu-costs';
import {
  buildCostTree, aplanar, resumenCostos, partidasEnRiesgo, costoMetaUnitario,
  type NodoCosto,
} from '@/lib/cost-control';

export default function ControlCostosPage() {
  const {
    workItems, contracts, supplierPayments, purchaseOrders, apus, apuItems,
    currentProjectId, can, lockedFeature, notify, updateWorkItem,
  } = useAppState();

  const [editando, setEditando] = useState<Record<string, string>>({});

  const puedeEditarMeta = can('cost_control:edit_target');

  const contrato = useMemo(
    () => contracts.find((c) => c.projectId === currentProjectId) ?? null,
    [contracts, currentProjectId],
  );

  /** Partidas del presupuesto del contrato; si no hay contrato, las de la obra. */
  const partidas = useMemo(() => {
    if (contrato?.budgetId) return workItems.filter((w) => w.budgetId === contrato.budgetId);
    return workItems.filter((w) => w.projectId === currentProjectId);
  }, [workItems, contrato, currentProjectId]);

  const idsPartidas = useMemo(() => new Set(partidas.map((p) => p.id)), [partidas]);

  /** Costo unitario que arroja el APU de cada partida, como meta por defecto. */
  const costosApu = useMemo(() => {
    const m = new Map<string, number>();
    for (const apu of apus) {
      if (!apu.workItemId) continue;
      const items = apuItems.filter((i) => i.apuId === apu.id);
      if (items.length === 0) continue;
      m.set(apu.workItemId, computeApu(items).total);
    }
    return m;
  }, [apus, apuItems]);

  /** Facturas de la obra: es el costo real devengado. */
  const facturas = useMemo(
    () => supplierPayments
      .filter((f) => f.projectId === currentProjectId)
      .map((f) => ({
        // Una factura imputada a una partida de OTRA obra se trata como sin
        // imputar: mezclarla falsearía el control de esta.
        workItemId: f.workItemId && idsPartidas.has(f.workItemId) ? f.workItemId : null,
        amount: f.amount ?? 0,
      })),
    [supplierPayments, currentProjectId, idsPartidas],
  );

  /** Órdenes de compra vigentes = compromiso todavía no facturado. */
  const ordenes = useMemo(
    () => purchaseOrders
      .filter((o) => o.projectId === currentProjectId
        && o.status !== 'cancelled' && o.status !== 'completed')
      .map((o) => ({
        workItemId: o.workItemId && idsPartidas.has(o.workItemId) ? o.workItemId : null,
        amount: o.totalAmount ?? 0,
      })),
    [purchaseOrders, currentProjectId, idsPartidas],
  );

  const { raices, sinImputar } = useMemo(
    () => buildCostTree(partidas, { facturas, ordenes, costosApu }),
    [partidas, facturas, ordenes, costosApu],
  );

  const filas = useMemo(() => aplanar(raices), [raices]);
  const resumen = useMemo(() => resumenCostos(raices), [raices]);
  const enRiesgo = useMemo(() => partidasEnRiesgo(raices), [raices]);

  /** Partidas sin costo meta: su margen se vería como 100% y sería mentira. */
  const sinMeta = useMemo(
    () => filas.filter((n) => n.children.length === 0 && n.ownSale > 0 && n.ownTargetCost === 0),
    [filas],
  );

  const bloqueoDePlan = lockedFeature('cost_control:view');
  if (bloqueoDePlan) return <PlanLocked feature={bloqueoDePlan} title="Control de Costos" />;

  if (!can('cost_control:view')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Control de Costos" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No tienes permiso para ver el control de costos. Esta pantalla muestra el margen de la obra.
        </CardContent></Card>
      </div>
    );
  }

  if (partidas.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Control de Costos" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Esta obra todavía no tiene partidas cargadas.
        </CardContent></Card>
      </div>
    );
  }

  const guardarMeta = async (n: NodoCosto, valor: string) => {
    const num = valor === '' ? null : Number(valor);
    if (num != null && (!Number.isFinite(num) || num < 0)) {
      notify('El costo meta debe ser un número positivo.', 'destructive');
      return;
    }
    try {
      await updateWorkItem(n.id, { targetUnitCost: num } as any);
      setEditando((e) => { const c = { ...e }; delete c[n.id]; return c; });
    } catch (e: any) {
      notify(e.message ?? 'No se pudo guardar el costo meta.', 'destructive');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Control de Costos"
        description="Lo que se vende contra lo que cuesta, ponderado por el avance real de cada partida."
      />

      {/* Resumen */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Venta contratada" value={formatCLP(resumen.sale)}
          hint={`Ejecutado: ${formatCLP(resumen.earnedSale)} (${resumen.progressPercent.toFixed(1)}%)`} />
        <Kpi label="Costo real" value={formatCLP(resumen.actualCost)}
          hint={resumen.committedCost > 0
            ? `+ ${formatCLP(resumen.committedCost)} comprometido en OC`
            : 'Sin compromisos pendientes'} />
        <Kpi
          label="Margen a la fecha"
          value={formatCLP(resumen.margin)}
          hint={resumen.marginPercent != null
            ? `${resumen.marginPercent.toFixed(1)}% de lo ejecutado`
            : 'Sin avance valorizado'}
          tone={resumen.margin < 0 ? 'danger' : 'success'}
        />
        <Kpi
          label="Margen proyectado"
          value={resumen.projectedMargin != null ? formatCLP(resumen.projectedMargin) : '—'}
          hint={resumen.eac != null
            ? `Costo estimado final: ${formatCLP(resumen.eac)}`
            : 'Falta gasto imputado para proyectar'}
          tone={resumen.projectedMargin != null && resumen.projectedMargin < 0 ? 'danger' : undefined}
        />
      </div>

      {/* Avisos que hacen que las cifras sean creíbles */}
      {(sinImputar.facturas > 0 || sinImputar.ordenes > 0) && (
        <Card className="border-warning/40">
          <CardContent className="space-y-2 p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Hay gasto sin imputar a ninguna partida
            </div>
            <p className="text-sm text-muted-foreground">
              {sinImputar.facturas > 0 && <>Facturas: <strong>{formatCLP(sinImputar.facturas)}</strong>. </>}
              {sinImputar.ordenes > 0 && <>Órdenes de compra: <strong>{formatCLP(sinImputar.ordenes)}</strong>. </>}
              Ese gasto <strong>no</strong> está contado abajo, así que el margen real es menor que
              el que ves. Asígnalo a una partida o fase desde{' '}
              <Link href="/dashboard/payments" className="text-primary hover:underline">Finanzas</Link>.
            </p>
          </CardContent>
        </Card>
      )}

      {sinMeta.length > 0 && (
        <Card className="border-warning/40">
          <CardContent className="space-y-2 p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Info className="h-4 w-4 text-warning" />
              {sinMeta.length} partida{sinMeta.length > 1 ? 's' : ''} sin costo meta
            </div>
            <p className="text-sm text-muted-foreground">
              Sin costo meta la partida aparenta un 100% de margen. Cárgale un APU o escribe el
              costo unitario en la columna «Meta unit.» de la tabla.
            </p>
          </CardContent>
        </Card>
      )}

      {enRiesgo.length > 0 && (
        <Card className="border-danger/40">
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <TrendingDown className="h-4 w-4 text-danger" />
              Partidas que se están yendo de presupuesto
            </div>
            <ul className="space-y-1.5">
              {enRiesgo.slice(0, 6).map((n) => (
                <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-foreground">{n.name}</span>
                  <span className="text-muted-foreground">
                    Debió costar {formatCLP(n.earnedCost)} · lleva {formatCLP(n.actualCost)}
                    {' '}(<span className="text-danger">{formatCLP(Math.abs(n.costVariance))} de más</span>)
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Tabla por partida */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Detalle por partida
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              El costo meta vacío se toma del APU. CPI bajo 1 = se está gastando de más.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partida</TableHead>
                <TableHead className="text-right">Avance</TableHead>
                <TableHead className="text-right">Venta</TableHead>
                <TableHead className="text-right">Meta unit.</TableHead>
                <TableHead className="text-right">Costo meta</TableHead>
                <TableHead className="text-right">Costo real</TableHead>
                <TableHead className="text-right">Margen</TableHead>
                <TableHead className="text-right">CPI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((n) => {
                const esHoja = n.children.length === 0;
                const original = partidas.find((p) => p.id === n.id);
                const metaUnit = esHoja
                  ? costoMetaUnitario(original ?? { id: n.id }, costosApu)
                  : 0;
                const heredadoDelApu = original?.targetUnitCost == null && metaUnit > 0;

                return (
                  <TableRow key={n.id} className={esHoja ? undefined : 'bg-muted/40'}>
                    <TableCell>
                      <div
                        className={esHoja ? 'text-foreground' : 'font-semibold text-foreground'}
                        style={{ paddingLeft: `${n.depth * 14}px` }}
                      >
                        {n.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {esHoja ? `${n.progress.toFixed(0)}%` : ''}
                    </TableCell>
                    <TableCell className="text-right">{formatCLP(n.sale)}</TableCell>
                    <TableCell className="text-right">
                      {esHoja && puedeEditarMeta ? (
                        <Input
                          type="number"
                          className="ml-auto h-8 w-28 text-right"
                          placeholder={heredadoDelApu ? String(Math.round(metaUnit)) : '—'}
                          value={editando[n.id] ?? (original?.targetUnitCost ?? '')}
                          onChange={(e) => setEditando((s) => ({ ...s, [n.id]: e.target.value }))}
                          onBlur={(e) => {
                            if (editando[n.id] !== undefined) guardarMeta(n, e.target.value);
                          }}
                        />
                      ) : esHoja ? (
                        <span className="text-muted-foreground">{formatCLP(metaUnit)}</span>
                      ) : ''}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatCLP(n.targetCost)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCLP(n.actualCost)}
                      {n.committedCost > 0 && (
                        <div className="text-xs text-muted-foreground">
                          +{formatCLP(n.committedCost)} en OC
                        </div>
                      )}
                    </TableCell>
                    <TableCell className={`text-right ${n.margin < 0 ? 'text-danger' : 'text-foreground'}`}>
                      {n.earnedSale > 0 || n.actualCost > 0 ? formatCLP(n.margin) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {n.cpi != null ? (
                        <StatusBadge tone={n.cpi >= 1 ? 'success' : n.cpi >= 0.9 ? 'warning' : 'danger'}>
                          {n.cpi.toFixed(2)}
                        </StatusBadge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  label, value, hint, tone,
}: {
  label: string; value: string; hint?: string; tone?: 'danger' | 'success';
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-xl font-bold ${tone === 'danger' ? 'text-danger' : 'text-foreground'}`}>
          {value}
        </div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
