"use client";

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Trash2, Lock, FileDown } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { ApprovalPanel } from '@/components/oficina-tecnica/approval-panel';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCLP } from '@/lib/format';
import { formatDate, toDate } from '@/lib/date-utils';
import { getLeafItems } from '@/lib/budget-costs';
import {
  puedeEditar, siguientesEstados, montoConSigno, montoDesdePresupuesto,
  TIPOS_ADICIONAL, CAUSAS_ADICIONAL,
} from '@/lib/amendment';
import { ESTADO_ADICIONAL, ACCION_ADICIONAL, tonoTipoAdicional } from '@/components/operations/adicional-estado';
import { AdicionalForm, type AdicionalFormValues } from '@/components/operations/adicional-form';
import { usePresupuestosAdicionales } from '@/components/operations/use-presupuestos-adicionales';
import { generateAdicionalPDF } from '@/lib/adicional-pdf-generator';
import type { AmendmentStatus } from '@/modules/core/lib/data';

/** Fecha en el formato que espera un `<input type="date">`. */
function aValorInput(value: Date | string | null | undefined): string {
  const d = toDate(value);
  if (!d) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function DetalleAdicionalPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const {
    amendments, contracts, budgets, workItems, projects, clients, users,
    can, notify, updateAmendment, setAmendmentStatus, deleteAmendment, approvalFlows,
  } = useAppState();

  const [edicion, setEdicion] = useState<AdicionalFormValues | null>(null);
  const [motivo, setMotivo] = useState('');
  const [referencia, setReferencia] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const adicional = useMemo(
    () => amendments.find((a) => a.id === id) ?? null,
    [amendments, id],
  );
  const contrato = useMemo(
    () => (adicional ? contracts.find((c) => c.id === adicional.contractId) ?? null : null),
    [contracts, adicional],
  );
  const presupuesto = useMemo(
    () => (adicional?.budgetId ? budgets.find((b) => b.id === adicional.budgetId) ?? null : null),
    [budgets, adicional],
  );
  const partidas = useMemo(
    () => (adicional?.budgetId
      ? getLeafItems(workItems.filter((w) => w.budgetId === adicional.budgetId))
      : []),
    [workItems, adicional],
  );
  const presupuestos = usePresupuestosAdicionales(id);

  if (!can('contracts:view')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Adicional" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No tienes permiso para ver el contrato de la obra.
        </CardContent></Card>
      </div>
    );
  }

  if (!adicional || !contrato) {
    return (
      <div className="space-y-6">
        <PageHeader title="Adicional" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No se encontró el adicional.
        </CardContent></Card>
      </div>
    );
  }

  const est = ESTADO_ADICIONAL[adicional.status];
  const editable = puedeEditar(adicional) && can('amendments:manage');
  const monto = montoConSigno(adicional);
  const montoPresupuesto = montoDesdePresupuesto(partidas);

  const abrirEdicion = () => setEdicion({
    name: adicional.name,
    type: adicional.type,
    cause: adicional.cause,
    description: adicional.description ?? '',
    budgetId: adicional.budgetId,
    amountNet: adicional.amountNet ?? 0,
    extraDays: adicional.extraDays ?? 0,
    detectedAt: aValorInput(adicional.detectedAt),
    reference: adicional.reference ?? '',
    notes: adicional.notes ?? '',
  });

  const guardar = async () => {
    if (!edicion) return;
    if (!edicion.name.trim()) {
      notify('Ponle un nombre al adicional.', 'destructive');
      return;
    }
    setOcupado(true);
    try {
      await updateAmendment(adicional.id, {
        name: edicion.name.trim(),
        type: edicion.type,
        cause: edicion.cause,
        description: edicion.description || null,
        budgetId: edicion.type === 'aumento_plazo' ? null : edicion.budgetId,
        amountNet: edicion.type === 'aumento_plazo' ? 0 : Math.abs(edicion.amountNet),
        extraDays: edicion.extraDays,
        detectedAt: (edicion.detectedAt || null) as never,
        reference: edicion.reference || null,
        notes: edicion.notes || null,
      });
      notify('Adicional actualizado.', 'success');
      setEdicion(null);
    } catch (e: any) {
      notify(e.message ?? 'No se pudo guardar.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const cambiarEstado = async (nuevo: AmendmentStatus) => {
    if (nuevo === 'rechazado' && !motivo.trim()) {
      notify('Escribe el motivo del rechazo: es lo que permite corregirlo y volver a presentarlo.', 'destructive');
      return;
    }
    setOcupado(true);
    try {
      await setAmendmentStatus(adicional.id, nuevo, {
        ...(nuevo === 'rechazado' ? { rejectionReason: motivo.trim() } : {}),
        ...(nuevo === 'aprobado' && referencia.trim() ? { reference: referencia.trim() } : {}),
      });
      notify(
        nuevo === 'aprobado'
          ? 'Adicional aprobado: ya forma parte del monto y el plazo vigentes.'
          : 'Adicional actualizado.',
        'success',
      );
      setMotivo('');
    } catch (e: any) {
      notify(e.message ?? 'No se pudo cambiar el estado.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const borrar = async () => {
    setOcupado(true);
    try {
      await deleteAmendment(adicional.id);
      notify('Adicional eliminado.', 'success');
      router.push('/dashboard/oficina-tecnica/adicionales');
    } catch (e: any) {
      notify(e.message ?? 'No se pudo eliminar.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const descargarPDF = async () => {
    const obra = projects.find((p) => p.id === adicional.projectId) ?? null;
    const cliente = obra?.clientId
      ? clients.find((c) => c.id === obra.clientId) ?? null
      : null;
    try {
      await generateAdicionalPDF({
        amendment: adicional,
        contract: contrato,
        partidas,
        projectName: obra?.name ?? null,
        clientName: cliente?.name ?? null,
        tenantId: adicional.tenantId,
      });
    } catch (e: any) {
      notify(e.message ?? 'No se pudo generar el PDF.', 'destructive');
    }
  };

  /**
   * La cadena de la empresa cubre el visto bueno INTERNO: de borrador a
   * presentado. Lo que responda el mandante después no lo decide un flujo
   * nuestro, se registra a mano cuando llega su carta.
   */
  const conFlujoAprobacion = approvalFlows.some(
    (f) => f.documentType === 'amendment' && f.active,
  );
  const enManosDelFlujo = conFlujoAprobacion && adicional.status === 'borrador';

  /** Botones de trámite disponibles según el estado y los permisos. */
  const acciones = siguientesEstados(adicional.status).filter((s) => (
    s === 'aprobado' || s === 'rechazado'
      ? can('amendments:approve')
      : can('amendments:manage')
  )).filter((s) => !(enManosDelFlujo && s === 'presentado'));

  const aprobadoPor = adicional.approvedBy
    ? users.find((u) => u.id === adicional.approvedBy)?.name ?? null
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Adicional N° ${adicional.number}`}
        description={`${contrato.name} · ${TIPOS_ADICIONAL[adicional.type]}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/oficina-tecnica/adicionales">
              <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Volver</Button>
            </Link>
            <Button variant="outline" onClick={descargarPDF}>
              <FileDown className="mr-2 h-4 w-4" /> PDF
            </Button>
            {editable && !edicion && (
              <Button variant="outline" onClick={abrirEdicion}>Editar</Button>
            )}
            {editable && (
              <Button variant="outline" onClick={borrar} disabled={ocupado}>
                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge tone={est.tone}>{est.label}</StatusBadge>
        <StatusBadge tone={tonoTipoAdicional(adicional.type)}>
          {TIPOS_ADICIONAL[adicional.type]}
        </StatusBadge>
        {!puedeEditar(adicional) && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            {adicional.status === 'aprobado'
              ? 'Aprobado: su monto y plazo ya están incorporados al contrato y no se pueden editar.'
              : 'Ya salió de borrador: para cambiarlo, vuelve a borrador o anúlalo.'}
          </span>
        )}
      </div>

      {/* Edición (solo en borrador) */}
      {edicion ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Editar adicional</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <AdicionalForm
              value={edicion}
              onChange={(patch) => setEdicion((v) => (v ? { ...v, ...patch } : v))}
              presupuestos={presupuestos}
            />
            <div className="flex gap-2">
              <Button onClick={guardar} disabled={ocupado}>
                <Save className="mr-2 h-4 w-4" /> Guardar
              </Button>
              <Button variant="ghost" onClick={() => setEdicion(null)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">{adicional.name}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {adicional.description && (
              <p className="whitespace-pre-line text-sm text-muted-foreground">
                {adicional.description}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Dato label="Monto" value={monto === 0 ? '—' : `${monto < 0 ? '−' : ''}${formatCLP(Math.abs(monto))}`} />
              <Dato label="Aumento de plazo" value={adicional.extraDays > 0 ? `${adicional.extraDays} días` : '—'} />
              <Dato label="Origen" value={CAUSAS_ADICIONAL[adicional.cause]} />
              <Dato label="Detectado" value={adicional.detectedAt ? formatDate(adicional.detectedAt) : '—'} />
              <Dato label="Presentado" value={adicional.presentedAt ? formatDate(adicional.presentedAt) : '—'} />
              <Dato
                label="Aprobado"
                value={adicional.approvedAt
                  ? `${formatDate(adicional.approvedAt)}${aprobadoPor ? ` · ${aprobadoPor}` : ''}`
                  : '—'}
              />
              <Dato label="Referencia del mandante" value={adicional.reference || '—'} />
              <Dato label="Presupuesto" value={presupuesto?.name ?? 'Sin presupuesto vinculado'} />
            </div>
            {adicional.rejectionReason && (
              <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm">
                <div className="font-medium text-foreground">Motivo del rechazo</div>
                <p className="text-muted-foreground">{adicional.rejectionReason}</p>
              </div>
            )}
            {adicional.notes && (
              <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                {adicional.notes}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Partidas del presupuesto que lo valoriza */}
      {adicional.budgetId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Partidas del adicional
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {adicional.status === 'aprobado'
                  ? 'Ya se pueden cobrar en los estados de pago.'
                  : 'Se podrán cobrar cuando el mandante lo apruebe.'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            {partidas.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                El presupuesto vinculado todavía no tiene partidas cargadas.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partida</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">P. unitario</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partidas.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium text-foreground">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.unit}</div>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {(p.quantity ?? 0).toLocaleString('es-CL')}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCLP(p.unitPrice)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCLP((p.quantity ?? 0) * (p.unitPrice ?? 0))}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-semibold">
                      Total del presupuesto
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCLP(montoPresupuesto)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
            {partidas.length > 0 && Math.abs(montoPresupuesto - Math.abs(adicional.amountNet)) > 1 && (
              <p className="border-t border-border p-4 text-sm text-warning">
                El monto registrado ({formatCLP(Math.abs(adicional.amountNet))}) no coincide con el
                total de las partidas ({formatCLP(montoPresupuesto)}). Manda el monto registrado:
                es el que se firmó.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Visto bueno interno antes de presentárselo al mandante. */}
      {enManosDelFlujo && (
        <ApprovalPanel
          documentType="amendment"
          documentId={adicional.id}
          projectId={adicional.projectId}
          camposSellados={{
            numero: adicional.number,
            tipo: adicional.type,
            monto: adicional.amountNet,
            dias: adicional.extraDays,
            moneda: adicional.currency,
            contrato: adicional.contractId,
          }}
          onResuelto={(estado) => {
            // Aprobado internamente = listo para presentar al mandante.
            if (estado === 'aprobado') return setAmendmentStatus(adicional.id, 'presentado', {});
          }}
        />
      )}

      {/* Trámite */}
      {acciones.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Trámite</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {adicional.status === 'presentado' && can('amendments:approve') && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Referencia de la aprobación
                  </Label>
                  <Input
                    value={referencia}
                    placeholder="N° de orden de cambio o carta"
                    onChange={(e) => setReferencia(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Motivo, si se rechaza
                  </Label>
                  <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {acciones.map((s) => (
                <Button
                  key={s}
                  variant={s === 'aprobado' ? 'default' : 'outline'}
                  disabled={ocupado}
                  onClick={() => cambiarEstado(s)}
                >
                  {ACCION_ADICIONAL[s]}
                </Button>
              ))}
            </div>

            {adicional.status === 'presentado' && (
              <p className="text-sm text-muted-foreground">
                Al aprobarlo, su monto entra al contrato vigente y sus días corren la fecha de
                término; si tiene presupuesto, sus partidas quedan disponibles para cobrarse.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}
