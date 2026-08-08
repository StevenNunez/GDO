"use client";

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trash2, Lock, FileDown } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { ApprovalPanel } from '@/components/oficina-tecnica/approval-panel';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCLP } from '@/lib/format';
import { formatDate } from '@/lib/date-utils';
import { ESTADO_EEPP, siguientePaso } from '@/components/operations/eepp-estado';
import { CaratulaEepp } from '@/components/operations/caratula-eepp';
import type { Caratula } from '@/lib/payment-certificate';
import { generateEeppPDF } from '@/lib/eepp-pdf-generator';

export default function DetalleEstadoDePagoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const {
    paymentCertificates, paymentCertificateLines, contracts, users, projects, clients,
    can, notify, setPaymentCertificateStatus, deletePaymentCertificate, approvalFlows,
  } = useAppState();

  const [motivo, setMotivo] = useState('');
  const [factura, setFactura] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const eepp = useMemo(
    () => paymentCertificates.find((p) => p.id === id) ?? null,
    [paymentCertificates, id],
  );
  const contrato = useMemo(
    () => (eepp ? contracts.find((c) => c.id === eepp.contractId) ?? null : null),
    [contracts, eepp],
  );
  const lineas = useMemo(
    () => paymentCertificateLines
      .filter((l) => l.certificateId === id)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    [paymentCertificateLines, id],
  );

  if (!can('payment_certificates:view')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Estado de pago" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No tienes permiso para ver los estados de pago.
        </CardContent></Card>
      </div>
    );
  }

  if (!eepp || !contrato) {
    return (
      <div className="space-y-6">
        <PageHeader title="Estado de pago" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No se encontró este estado de pago.
        </CardContent></Card>
      </div>
    );
  }

  const est = ESTADO_EEPP[eepp.status];
  const paso = siguientePaso(eepp.status);
  const esBorrador = eepp.status === 'borrador';
  const aprobador = eepp.approvedBy ? users.find((u) => u.id === eepp.approvedBy) : null;

  // Aprobar exige su propio permiso; el trigger de la base lo verifica igual.
  const puedeAvanzar = paso
    && can('payment_certificates:create')
    && (paso.status !== 'aprobado' || can('payment_certificates:approve'));

  const caratula: Caratula = {
    periodAmount: eepp.periodAmount,
    accumulatedAmount: eepp.accumulatedAmount,
    feeAmount: eepp.feeAmount,
    reajusteAmount: eepp.reajusteAmount,
    advanceAmortization: eepp.advanceAmortization,
    retentionAmount: eepp.retentionAmount,
    penaltyAmount: eepp.penaltyAmount,
    otherDeductions: eepp.otherDeductions,
    netAmount: eepp.netAmount,
    taxAmount: eepp.taxAmount,
    totalAmount: eepp.totalAmount,
  };

  // Con cadena configurada, la parte de presentar/aprobar la maneja el panel;
  // facturar y pagar siguen siendo pasos administrativos posteriores.
  const conFlujoAprobacion = approvalFlows.some(
    (f) => f.documentType === 'payment_certificate' && f.active,
  );
  const enManosDelFlujo = conFlujoAprobacion
    && ['borrador', 'presentado', 'rechazado'].includes(eepp.status);

  const avanzar = async (status: typeof eepp.status, extra?: Record<string, string>) => {
    setOcupado(true);
    try {
      await setPaymentCertificateStatus(eepp.id, status, extra);
      notify('Estado de pago actualizado.', 'success');
      setMotivo(''); setFactura('');
    } catch (e: any) {
      notify(e.message ?? 'No se pudo actualizar.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const descargarPdf = async () => {
    setOcupado(true);
    try {
      const obra = projects.find((p) => p.id === eepp.projectId) ?? null;
      const mandante = obra?.clientId ? clients.find((c) => c.id === obra.clientId) ?? null : null;
      await generateEeppPDF({ eepp, lines: lineas, contract: contrato, project: obra, client: mandante });
    } catch (e: any) {
      notify(e.message ?? 'No se pudo generar el PDF.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const eliminar = async () => {
    setOcupado(true);
    try {
      await deletePaymentCertificate(eepp.id);
      notify('Borrador eliminado.', 'success');
      router.push('/dashboard/oficina-tecnica/estados-de-pago');
    } catch (e: any) {
      notify(e.message ?? 'No se pudo eliminar.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Estado de pago N° ${eepp.number}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={est.tone}>{est.label}</StatusBadge>
            {eepp.periodStart && eepp.periodEnd && (
              <span>{formatDate(eepp.periodStart)} — {formatDate(eepp.periodEnd)}</span>
            )}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/oficina-tecnica/estados-de-pago">
              <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Volver</Button>
            </Link>
            <Button variant="outline" onClick={descargarPdf} disabled={ocupado}>
              <FileDown className="mr-2 h-4 w-4" /> PDF
            </Button>
            {esBorrador && can('payment_certificates:create') && (
              <Button variant="ghost" onClick={eliminar} disabled={ocupado}>
                <Trash2 className="mr-2 h-4 w-4 text-danger" /> Descartar
              </Button>
            )}
          </div>
        }
      />

      {!esBorrador && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          Este estado de pago salió de borrador: sus montos quedaron congelados y ya no cambian
          aunque después se editen las partidas.
        </p>
      )}

      {eepp.status === 'rechazado' && eepp.rejectionReason && (
        <Card className="border-danger/40">
          <CardContent className="p-6">
            <div className="text-sm font-semibold text-foreground">Motivo del rechazo</div>
            <p className="mt-1 text-sm text-muted-foreground">{eepp.rejectionReason}</p>
          </CardContent>
        </Card>
      )}

      {/* Trámite */}
      <Card>
        <CardHeader><CardTitle className="text-base">Trámite</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Hito label="Presentado a la ITO" fecha={eepp.presentedAt} />
            <Hito
              label="Aprobado"
              fecha={eepp.approvedAt}
              extra={aprobador ? `por ${aprobador.name}` : undefined}
            />
            <Hito label="Facturado" fecha={eepp.invoicedAt} extra={eepp.invoiceNumber ?? undefined} />
            <Hito label="Pagado" fecha={eepp.paidAt} />
          </div>

          {paso && !enManosDelFlujo && (
            <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
              {paso.status === 'facturado' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">N° de factura</label>
                  <Input value={factura} onChange={(e) => setFactura(e.target.value)}
                    className="w-40" placeholder="Ej: 12345" />
                </div>
              )}
              <Button
                disabled={!puedeAvanzar || ocupado}
                onClick={() => avanzar(
                  paso.status,
                  paso.status === 'facturado' && factura ? { invoiceNumber: factura } : undefined,
                )}
              >
                {paso.label}
              </Button>

              {eepp.status === 'presentado' && can('payment_certificates:create') && (
                <>
                  <Input value={motivo} onChange={(e) => setMotivo(e.target.value)}
                    className="w-64" placeholder="Motivo del rechazo" />
                  <Button
                    variant="outline"
                    disabled={ocupado || !motivo.trim()}
                    onClick={() => avanzar('rechazado', { rejectionReason: motivo })}
                  >
                    Rechazar
                  </Button>
                </>
              )}
            </div>
          )}

          {paso?.status === 'aprobado' && !enManosDelFlujo && !can('payment_certificates:approve') && (
            <p className="text-xs text-muted-foreground">
              Aprobar un estado de pago requiere el permiso «Aprobar Estados de Pago».
            </p>
          )}
        </CardContent>
      </Card>

      {/* La cadena de visto bueno de la empresa, si la configuró. */}
      {enManosDelFlujo && (
        <ApprovalPanel
          documentType="payment_certificate"
          documentId={eepp.id}
          projectId={eepp.projectId}
          camposSellados={{
            numero: eepp.number,
            periodoDesde: eepp.periodStart ?? null,
            periodoHasta: eepp.periodEnd ?? null,
            avancePeriodo: eepp.periodAmount,
            acumulado: eepp.accumulatedAmount,
            reajuste: eepp.reajusteAmount,
            amortizacion: eepp.advanceAmortization,
            retencion: eepp.retentionAmount,
            multa: eepp.penaltyAmount,
            otrosDescuentos: eepp.otherDeductions,
            neto: eepp.netAmount,
            total: eepp.totalAmount,
            contrato: eepp.contractId,
          }}
          onResuelto={(estado) => avanzar(estado)}
          puedePresentar={lineas.length > 0}
          motivoNoPuedePresentar="Un estado de pago sin detalle por partida no se puede cobrar."
        />
      )}

      {/* Detalle */}
      {lineas.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Detalle por partida</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partida</TableHead>
                  <TableHead className="text-right">Contratado</TableHead>
                  <TableHead className="text-right">PU</TableHead>
                  <TableHead className="text-right">Anterior</TableHead>
                  <TableHead className="text-right">Período</TableHead>
                  <TableHead className="text-right">Acumulado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineas.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div className="font-medium text-foreground">{l.name}</div>
                      <div className="text-xs text-muted-foreground">{l.unit}</div>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {l.quantityContract.toLocaleString('es-CL')}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatCLP(l.unitPrice)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatCLP(l.previousAmount)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCLP(l.periodAmount)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatCLP(l.accumulatedAmount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <CaratulaEepp contrato={contrato} caratula={caratula} />

      {eepp.notes && (
        <Card>
          <CardHeader><CardTitle className="text-base">Observaciones</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">{eepp.notes}</p></CardContent>
        </Card>
      )}
    </div>
  );
}

function Hito({ label, fecha, extra }: { label: string; fecha?: Date | null; extra?: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-foreground">{fecha ? formatDate(fecha) : '—'}</div>
      {extra && <div className="text-xs text-muted-foreground">{extra}</div>}
    </div>
  );
}
