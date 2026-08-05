"use client";

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, ShieldCheck } from 'lucide-react';
import { useAppState, useAuth } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { PlanLocked } from '@/components/plan-locked';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCLP } from '@/lib/format';
import { formatDate } from '@/lib/date-utils';
import { getLeafItems } from '@/lib/budget-costs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  acumuladosSubcontrato, montoItemizado, saldoRetencion,
  estadoCumplimiento, puedePagarse, ESTADOS_EEPP_SUBCONTRATO,
} from '@/lib/subcontract';
import { SubcontratoEeppForm } from '@/components/operations/subcontrato-eepp-form';
import { esDeOtraEmpresa } from '@/lib/company-link';
import type { SubcontractCertificate } from '@/modules/core/lib/data';

const TONO_EEPP: Record<SubcontractCertificate['status'], 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = {
  borrador: 'neutral',
  presentado: 'warning',
  aprobado: 'info',
  pagado: 'success',
  rechazado: 'danger',
};

export default function DetalleSubcontratoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getTenantId } = useAuth();
  const {
    subcontracts, subcontractItems, subcontractCertificates,
    receptions, workItems, currentProjectId, can, lockedFeature, notify,
    updateSubcontract, deleteSubcontract,
    addSubcontractItem, deleteSubcontractItem,
    updateSubcontractCertificate,
    setSubcontractCertificateStatus, deleteSubcontractCertificate,
  } = useAppState();

  const [nuevaPartida, setNuevaPartida] = useState({
    name: '', unit: '', quantity: 0, unitPrice: 0, workItemId: 'ninguna',
  });
  const [ocupado, setOcupado] = useState(false);

  const sub = useMemo(
    () => subcontracts.find((s) => s.id === id) ?? null,
    [subcontracts, id],
  );

  const items = useMemo(
    () => subcontractItems
      .filter((i) => i.subcontractId === id)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    [subcontractItems, id],
  );

  const eepps = useMemo(
    () => subcontractCertificates
      .filter((c) => c.subcontractId === id)
      .sort((a, b) => b.number - a.number),
    [subcontractCertificates, id],
  );

  const recepcionesDelSub = useMemo(
    () => receptions.filter((r) => r.subcontractId === id),
    [receptions, id],
  );

  const partidasEdt = useMemo(
    () => getLeafItems(workItems.filter((w) => w.projectId === currentProjectId)),
    [workItems, currentProjectId],
  );

  const acumulado = useMemo(() => acumuladosSubcontrato(eepps), [eepps]);
  const retencion = useMemo(
    () => saldoRetencion(eepps, recepcionesDelSub),
    [eepps, recepcionesDelSub],
  );

  const bloqueoDePlan = lockedFeature('subcontracts:view');
  if (bloqueoDePlan) return <PlanLocked feature={bloqueoDePlan} title="Subcontrato" />;

  if (!can('subcontracts:view')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Subcontrato" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No tienes permiso para ver los subcontratos.
        </CardContent></Card>
      </div>
    );
  }

  if (!sub) {
    return (
      <div className="space-y-6">
        <PageHeader title="Subcontrato" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No se encontró el subcontrato.
        </CardContent></Card>
      </div>
    );
  }

  // Un subcontrato de otra empresa se ve, no se administra: quien fija el
  // contrato es quien paga. La base rechazaría la escritura igual.
  const editable = can('subcontracts:manage') && !esDeOtraEmpresa(sub, getTenantId() ?? null);
  const hayBorrador = eepps.some((e) => e.status === 'borrador');

  const agregarPartida = async () => {
    if (!nuevaPartida.name.trim()) {
      notify('Ponle nombre a la partida.', 'destructive');
      return;
    }
    setOcupado(true);
    try {
      await addSubcontractItem({
        subcontractId: sub.id,
        name: nuevaPartida.name.trim(),
        unit: nuevaPartida.unit || null,
        quantity: nuevaPartida.quantity || 0,
        unitPrice: nuevaPartida.unitPrice || 0,
        sortOrder: items.length,
        workItemId: nuevaPartida.workItemId === 'ninguna' ? null : nuevaPartida.workItemId,
      });
      setNuevaPartida({ name: '', unit: '', quantity: 0, unitPrice: 0, workItemId: 'ninguna' });
    } catch (e: any) {
      notify(e.message ?? 'No se pudo agregar la partida.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const cambiarEstado = async (cert: SubcontractCertificate, estado: SubcontractCertificate['status']) => {
    setOcupado(true);
    try {
      await setSubcontractCertificateStatus(cert.id, estado, undefined);
      notify('Estado de pago actualizado.', 'success');
    } catch (e: any) {
      notify(e.message ?? 'No se pudo actualizar.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const guardarCertificado = async (cert: SubcontractCertificate, campo: 'f30Date' | 'f30_1Date', valor: string) => {
    try {
      await updateSubcontractCertificate(cert.id, { [campo]: (valor || null) as never });
    } catch (e: any) {
      notify(e.message ?? 'No se pudo guardar la fecha.', 'destructive');
    }
  };

  const borrarSubcontrato = async () => {
    setOcupado(true);
    try {
      await deleteSubcontract(sub.id);
      notify('Subcontrato eliminado.', 'success');
      router.push('/dashboard/oficina-tecnica/subcontratos');
    } catch (e: any) {
      notify(e.message ?? 'No se pudo eliminar.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const valorItemizado = montoItemizado(items);

  return (
    <div className="space-y-6">
      <PageHeader
        title={sub.name}
        description={`${sub.supplierName ?? 'Sin subcontratista'} · ${formatCLP(sub.amountNet)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/oficina-tecnica/subcontratos">
              <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Volver</Button>
            </Link>
            {editable && (
              <Button variant="outline" onClick={borrarSubcontrato} disabled={ocupado}>
                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Contratado" value={formatCLP(sub.amountNet)} hint={`Itemizado: ${formatCLP(valorItemizado)}`} />
        <Kpi label="Ejecutado" value={formatCLP(acumulado.previousAmount)} />
        <Kpi label="Retención acumulada" value={formatCLP(retencion.retenido)} />
        <Kpi
          label="Retención por devolver"
          value={formatCLP(retencion.saldo)}
          hint={retencion.devuelto > 0 ? `${formatCLP(retencion.devuelto)} ya devuelto` : 'se libera al recibir'}
        />
      </div>

      {/* Itemizado */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Itemizado del subcontrato
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              Sus precios, no los que se le cobran al mandante.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin partidas. Cárgalas para poder cubicar los estados de pago.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partida</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">P. unitario</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <div className="font-medium text-foreground">{i.name}</div>
                        <div className="text-xs text-muted-foreground">{i.unit}</div>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {(i.quantity ?? 0).toLocaleString('es-CL')}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCLP(i.unitPrice)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCLP((i.quantity ?? 0) * (i.unitPrice ?? 0))}
                      </TableCell>
                      <TableCell className="text-right">
                        {editable && (
                          <Button
                            variant="ghost" size="sm" disabled={ocupado}
                            onClick={() => deleteSubcontractItem(i.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {editable && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
              <div className="space-y-1 lg:col-span-2">
                <Label className="text-xs text-muted-foreground">Partida</Label>
                <Input
                  className="h-8"
                  value={nuevaPartida.name}
                  onChange={(e) => setNuevaPartida((n) => ({ ...n, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Unidad</Label>
                <Input
                  className="h-8"
                  value={nuevaPartida.unit}
                  onChange={(e) => setNuevaPartida((n) => ({ ...n, unit: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Cantidad</Label>
                <Input
                  className="h-8" type="number"
                  value={nuevaPartida.quantity || ''}
                  onChange={(e) => setNuevaPartida((n) => ({ ...n, quantity: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">P. unitario</Label>
                <Input
                  className="h-8" type="number"
                  value={nuevaPartida.unitPrice || ''}
                  onChange={(e) => setNuevaPartida((n) => ({ ...n, unitPrice: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Partida EDT</Label>
                <Select
                  value={nuevaPartida.workItemId}
                  onValueChange={(v) => setNuevaPartida((n) => ({ ...n, workItemId: v }))}
                >
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ninguna">Sin enlazar</SelectItem>
                    {partidasEdt.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end lg:col-span-6">
                <Button size="sm" disabled={ocupado} onClick={agregarPartida}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Agregar partida
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preparar estado de pago — mismo formulario que usa el portal del
          subcontratista, para que las dos puntas calculen igual. */}
      {editable && (
        hayBorrador ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Hay un estado de pago en borrador. Ciérralo o descártalo antes de preparar el siguiente.
            </CardContent>
          </Card>
        ) : (
          <SubcontratoEeppForm subcontract={sub} />
        )
      )}

      {/* Estados de pago emitidos */}
      <Card>
        <CardHeader><CardTitle className="text-base">Estados de pago</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {eepps.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay estados de pago.</p>
          ) : eepps.map((e) => {
            const cumplimiento = estadoCumplimiento(e, sub);
            const pago = puedePagarse(e, sub);
            return (
              <div key={e.id} className="space-y-3 rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-foreground">
                      N° {e.number} · {formatCLP(e.totalAmount)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {e.periodStart && e.periodEnd
                        ? `${formatDate(e.periodStart)} — ${formatDate(e.periodEnd)}`
                        : 'Sin período'}
                      {e.retentionAmount > 0 ? ` · retención ${formatCLP(e.retentionAmount)}` : ''}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={TONO_EEPP[e.status]}>
                      {ESTADOS_EEPP_SUBCONTRATO[e.status]}
                    </StatusBadge>
                    {cumplimiento === 'falta_f30_1' && (
                      <StatusBadge tone="danger">Falta F30-1</StatusBadge>
                    )}
                    {cumplimiento === 'falta_f30' && (
                      <StatusBadge tone="warning">Falta F30</StatusBadge>
                    )}
                    {cumplimiento === 'ok' && (
                      <StatusBadge tone="success" icon={ShieldCheck}>Cumplimiento al día</StatusBadge>
                    )}
                  </div>
                </div>

                {editable && e.status !== 'pagado' && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Fecha F30</Label>
                      <Input
                        className="h-8" type="date"
                        defaultValue={e.f30Date ? String(e.f30Date).slice(0, 10) : ''}
                        onBlur={(ev) => guardarCertificado(e, 'f30Date', ev.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Fecha F30-1</Label>
                      <Input
                        className="h-8" type="date"
                        defaultValue={e.f30_1Date ? String(e.f30_1Date).slice(0, 10) : ''}
                        onBlur={(ev) => guardarCertificado(e, 'f30_1Date', ev.target.value)}
                      />
                    </div>
                  </div>
                )}

                {editable && (
                  <div className="flex flex-wrap gap-2">
                    {(e.status === 'borrador' || e.status === 'presentado') && (
                      <>
                        {can('subcontracts:approve') && (
                          <Button size="sm" disabled={ocupado} onClick={() => cambiarEstado(e, 'aprobado')}>
                            Aprobar
                          </Button>
                        )}
                        {e.status === 'presentado' && can('subcontracts:approve') && (
                          <Button
                            size="sm" variant="outline" className="border-danger/40 text-danger"
                            disabled={ocupado} onClick={() => cambiarEstado(e, 'rechazado')}
                          >
                            Rechazar
                          </Button>
                        )}
                        {e.status === 'borrador' && (
                          <Button
                            size="sm" variant="ghost" disabled={ocupado}
                            onClick={() => deleteSubcontractCertificate(e.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </>
                    )}
                    {e.status === 'aprobado' && (
                      <Button
                        size="sm"
                        className="bg-success text-background hover:bg-success/90"
                        disabled={ocupado || !pago.puede}
                        title={pago.motivo}
                        onClick={() => cambiarEstado(e, 'pagado')}
                      >
                        Marcar pagado
                      </Button>
                    )}
                  </div>
                )}

                {e.status === 'aprobado' && !pago.puede && (
                  <p className="text-sm text-warning">{pago.motivo}</p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Recepción del subcontrato */}
      <Card>
        <CardHeader><CardTitle className="text-base">Recepción y devolución de retención</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {recepcionesDelSub.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin recepciones. La retención de {formatCLP(retencion.saldo)} se devuelve al recibir
              el trabajo — se hace desde la pantalla de Recepción.
            </p>
          ) : recepcionesDelSub.map((r) => (
            <Link
              key={r.id}
              href="/dashboard/oficina-tecnica/recepcion"
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 p-3 text-sm hover:border-primary/50"
            >
              <span className="font-medium text-foreground">
                {r.type === 'provisoria' ? 'Recepción provisoria' : 'Recepción definitiva'}
                {r.receptionDate ? ` · ${formatDate(r.receptionDate)}` : ''}
              </span>
              <span className="text-muted-foreground">
                {r.retentionReleased > 0
                  ? `Devuelve ${formatCLP(r.retentionReleased)}`
                  : 'Sin devolución'}
              </span>
            </Link>
          ))}
          <Link
            href="/dashboard/oficina-tecnica/recepcion"
            className="inline-block text-sm font-medium text-primary hover:underline"
          >
            Ir a Recepción
          </Link>
        </CardContent>
      </Card>

      {editable && (
        <Card>
          <CardHeader><CardTitle className="text-base">Cumplimiento laboral</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={ocupado}
              onClick={() => updateSubcontract(sub.id, {
                requiresLaborCompliance: !sub.requiresLaborCompliance,
              })}
            >
              {sub.requiresLaborCompliance ? 'Dejar de exigir F30-1' : 'Exigir F30-1 para pagar'}
            </Button>
            <p className="text-sm text-muted-foreground">
              {sub.requiresLaborCompliance
                ? 'La base rechaza pagar sin el F30-1 del período (Ley 20.123).'
                : 'Sin exigencia: se puede pagar sin certificado. Úsalo solo para servicios sin trabajadores en obra.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
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
