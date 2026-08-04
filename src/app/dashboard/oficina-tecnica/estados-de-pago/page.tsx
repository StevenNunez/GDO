"use client";

import Link from 'next/link';
import { useMemo } from 'react';
import { Plus, ReceiptText } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCLP } from '@/lib/format';
import { formatDate } from '@/lib/date-utils';
import { ESTADO_EEPP } from '@/components/operations/eepp-estado';
import { acumuladosAnteriores, montoRetencionAcumulada } from '@/components/operations/eepp-utils';

export default function EstadosDePagoPage() {
  const { paymentCertificates, contracts, currentProjectId, can } = useAppState();

  const contrato = useMemo(
    () => contracts.find((c) => c.projectId === currentProjectId) ?? null,
    [contracts, currentProjectId],
  );

  const eepps = useMemo(
    () => (contrato
      ? paymentCertificates
        .filter((p) => p.contractId === contrato.id)
        .sort((a, b) => b.number - a.number)
      : []),
    [paymentCertificates, contrato],
  );

  const acumulado = useMemo(() => acumuladosAnteriores(eepps), [eepps]);
  const retenidoTotal = useMemo(() => montoRetencionAcumulada(eepps), [eepps]);

  if (!can('payment_certificates:view')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Estados de Pago" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No tienes permiso para ver los estados de pago.
        </CardContent></Card>
      </div>
    );
  }

  if (!contrato) {
    return (
      <div className="space-y-6">
        <PageHeader title="Estados de Pago" />
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <p className="text-sm text-muted-foreground">
              Esta obra no tiene contrato cargado. El estado de pago sale del contrato: de ahí
              vienen el anticipo, la retención y la base del reajuste.
            </p>
            <Link
              href="/dashboard/oficina-tecnica/contrato"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Cargar el contrato
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hayBorrador = eepps.some((e) => e.status === 'borrador');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estados de Pago"
        description={`${contrato.name} · Cobrado a la fecha: ${formatCLP(acumulado.previousAmount)}`}
        actions={can('payment_certificates:create') && !hayBorrador && (
          <Link href="/dashboard/oficina-tecnica/estados-de-pago/nuevo">
            <Button><Plus className="mr-2 h-4 w-4" /> Nuevo estado de pago</Button>
          </Link>
        )}
      />

      {hayBorrador && (
        <p className="text-sm text-muted-foreground">
          Hay un estado de pago en borrador. Ciérralo o descártalo antes de emitir el siguiente:
          dos borradores abiertos a la vez se descontarían anticipo el uno al otro.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Resumen label="Cobrado acumulado" value={formatCLP(acumulado.previousAmount)} />
        <Resumen label="Anticipo amortizado" value={formatCLP(acumulado.previousAmortization)} />
        <Resumen label="Retención acumulada" value={formatCLP(retenidoTotal)} />
      </div>

      {eepps.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <ReceiptText className="h-4 w-4" />
              Todavía no hay estados de pago
            </div>
            <p className="text-sm text-muted-foreground">
              El primero toma el avance registrado en la EDT y lo valoriza según el contrato.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N°</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Avance</TableHead>
                  <TableHead className="text-right">Descuentos</TableHead>
                  <TableHead className="text-right">Total a pagar</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {eepps.map((e) => {
                  const est = ESTADO_EEPP[e.status];
                  const descuentos = e.advanceAmortization + e.retentionAmount
                    + e.penaltyAmount + e.otherDeductions;
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.number}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {e.periodStart && e.periodEnd
                          ? `${formatDate(e.periodStart)} — ${formatDate(e.periodEnd)}`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right">{formatCLP(e.periodAmount + e.feeAmount)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {descuentos > 0 ? `−${formatCLP(descuentos)}` : '—'}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatCLP(e.totalAmount)}</TableCell>
                      <TableCell><StatusBadge tone={est.tone}>{est.label}</StatusBadge></TableCell>
                      <TableCell className="text-right">
                        <Link href={`/dashboard/oficina-tecnica/estados-de-pago/${e.id}`}>
                          <Button variant="ghost" size="sm">Ver</Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Resumen({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-lg font-bold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}
