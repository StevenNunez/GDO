"use client";

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, FileDown, ShieldCheck } from 'lucide-react';
import { useAppState, useAuth } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCLP } from '@/lib/format';
import { formatDate } from '@/lib/date-utils';
import {
  acumuladosSubcontrato, estadoCumplimiento, ESTADOS_EEPP_SUBCONTRATO,
} from '@/lib/subcontract';
import { misSubcontratos } from '@/lib/company-link';
import { TONO_EEPP_SUBCONTRATO } from '@/components/operations/subcontrato-estado';
import { generateSubcontratoEeppPDF } from '@/lib/subcontrato-eepp-pdf';

/**
 * Historial de estados de pago del subcontratista, con su PDF.
 *
 * Los montos salen de la fila guardada, no se recalculan: un estado de pago
 * aprobado es un documento que ya se cobró.
 */
export default function HistorialPortalPage() {
  const { user, getTenantId } = useAuth();
  const {
    subcontracts, subcontractCertificates, subcontractCertificateLines,
    projects, can, notify,
  } = useAppState();

  const [descargando, setDescargando] = useState<string | null>(null);

  const mios = useMemo(
    () => misSubcontratos(subcontracts, getTenantId() ?? null, user?.id),
    [subcontracts, getTenantId, user],
  );

  const eepps = useMemo(() => {
    const ids = new Set(mios.map((s) => s.id));
    return subcontractCertificates
      .filter((c) => ids.has(c.subcontractId))
      .sort((a, b) => b.number - a.number);
  }, [subcontractCertificates, mios]);

  const acumulado = useMemo(() => acumuladosSubcontrato(eepps), [eepps]);
  const pagado = useMemo(
    () => eepps.filter((e) => e.status === 'pagado').reduce((s, e) => s + e.totalAmount, 0),
    [eepps],
  );

  const descargar = async (certificateId: string) => {
    const cert = eepps.find((e) => e.id === certificateId);
    const sub = cert ? mios.find((s) => s.id === cert.subcontractId) : null;
    if (!cert || !sub) return;

    setDescargando(certificateId);
    try {
      await generateSubcontratoEeppPDF({
        certificate: cert,
        lines: subcontractCertificateLines
          .filter((l) => l.certificateId === cert.id)
          .sort((a, b) => a.sortOrder - b.sortOrder),
        subcontract: sub,
        projectName: sub.projectId
          ? projects.find((p) => p.id === sub.projectId)?.name ?? null
          : null,
      });
    } catch (e: any) {
      notify(e.message ?? 'No se pudo generar el PDF.', 'destructive');
    } finally {
      setDescargando(null);
    }
  };

  if (!can('subcontractor_portal:view')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Historial de estados de pago" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No tienes acceso al portal del subcontratista.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Historial de estados de pago"
        description="Lo que has presentado y en qué va cada uno."
        actions={
          <Link href="/dashboard/estado-pago">
            <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Volver</Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Cobrado a la fecha" value={formatCLP(acumulado.previousAmount)} />
        <Kpi label="Pagado" value={formatCLP(pagado)} />
        <Kpi label="Retenido" value={formatCLP(acumulado.previousRetention)} />
      </div>

      {eepps.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Todavía no has presentado ningún estado de pago.
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
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {eepps.map((e) => {
                  const sub = mios.find((s) => s.id === e.subcontractId);
                  const descuentos = e.advanceAmortization + e.retentionAmount
                    + e.penaltyAmount + e.otherDeductions;
                  const cumplimiento = sub ? estadoCumplimiento(e, sub) : 'no_exigido';
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.number}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {e.periodStart && e.periodEnd
                          ? `${formatDate(e.periodStart)} — ${formatDate(e.periodEnd)}`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right">{formatCLP(e.periodAmount)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {descuentos > 0 ? `−${formatCLP(descuentos)}` : '—'}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCLP(e.totalAmount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <StatusBadge tone={TONO_EEPP_SUBCONTRATO[e.status]}>
                            {ESTADOS_EEPP_SUBCONTRATO[e.status]}
                          </StatusBadge>
                          {cumplimiento === 'ok' && (
                            <StatusBadge tone="success" icon={ShieldCheck}>F30</StatusBadge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={descargando === e.id}
                          onClick={() => descargar(e.id)}
                        >
                          <FileDown className="mr-1.5 h-3.5 w-3.5" />
                          {descargando === e.id ? '…' : 'PDF'}
                        </Button>
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

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="text-lg font-bold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}
