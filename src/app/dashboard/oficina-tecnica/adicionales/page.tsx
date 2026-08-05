"use client";

import Link from 'next/link';
import { useMemo } from 'react';
import { Plus, FilePlus2, CalendarClock, TrendingUp, Hourglass } from 'lucide-react';
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
import {
  impactoContrato, montoConSigno, TIPOS_ADICIONAL, CAUSAS_ADICIONAL,
} from '@/lib/amendment';
import { ESTADO_ADICIONAL, tonoTipoAdicional } from '@/components/operations/adicional-estado';

export default function AdicionalesPage() {
  const { amendments, contracts, currentProjectId, can } = useAppState();

  const contrato = useMemo(
    () => contracts.find((c) => c.projectId === currentProjectId) ?? null,
    [contracts, currentProjectId],
  );

  const adicionales = useMemo(
    () => (contrato
      ? amendments
        .filter((a) => a.contractId === contrato.id)
        .sort((a, b) => b.number - a.number)
      : []),
    [amendments, contrato],
  );

  const impacto = useMemo(
    () => (contrato ? impactoContrato(contrato, adicionales) : null),
    [contrato, adicionales],
  );

  if (!can('contracts:view')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Adicionales" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No tienes permiso para ver el contrato de la obra.
        </CardContent></Card>
      </div>
    );
  }

  if (!contrato || !impacto) {
    return (
      <div className="space-y-6">
        <PageHeader title="Adicionales" />
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <p className="text-sm text-muted-foreground">
              Esta obra no tiene contrato cargado. Un adicional modifica un contrato: primero hay
              que tener el contrato original.
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

  const variacion = impacto.variacionPercent;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Adicionales y aumentos de obra"
        description={contrato.name}
        actions={can('amendments:manage') && (
          <Link href="/dashboard/oficina-tecnica/adicionales/nuevo">
            <Button><Plus className="mr-2 h-4 w-4" /> Nuevo adicional</Button>
          </Link>
        )}
      />

      {/* Impacto en el contrato: lo aprobado, que es lo único que manda */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={TrendingUp}
          label="Contrato original"
          value={formatCLP(impacto.montoOriginal)}
        />
        <Kpi
          icon={FilePlus2}
          label="Adicionales aprobados"
          value={`${impacto.montoAdicionales >= 0 ? '+' : '−'}${formatCLP(Math.abs(impacto.montoAdicionales))}`}
          hint={variacion !== null ? `${variacion >= 0 ? '+' : ''}${variacion.toFixed(1)}% del contrato` : undefined}
        />
        <Kpi
          icon={TrendingUp}
          label="Monto vigente"
          value={formatCLP(impacto.montoVigente)}
          destacado
        />
        <Kpi
          icon={CalendarClock}
          label="Término vigente"
          value={impacto.fechaTerminoVigente ? formatDate(impacto.fechaTerminoVigente) : '—'}
          hint={impacto.diasAumento > 0
            ? `+${impacto.diasAumento} días sobre el plazo original`
            : 'Sin aumentos de plazo'}
        />
      </div>

      {(impacto.montoEnTramite !== 0 || impacto.diasEnTramite > 0) && (
        <Card className="border-info/40">
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-5 text-sm">
            <span className="flex items-center gap-2 font-medium text-foreground">
              <Hourglass className="h-4 w-4 text-info" />
              Presentado y sin respuesta del mandante
            </span>
            {impacto.montoEnTramite !== 0 && (
              <span className="text-muted-foreground">
                {formatCLP(impacto.montoEnTramite)} en juego
              </span>
            )}
            {impacto.diasEnTramite > 0 && (
              <span className="text-muted-foreground">{impacto.diasEnTramite} días de plazo</span>
            )}
            <span className="text-muted-foreground">
              · No cambia el contrato hasta que se apruebe, así que no entra todavía en los estados
              de pago.
            </span>
          </CardContent>
        </Card>
      )}

      {adicionales.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <FilePlus2 className="h-4 w-4" />
              Todavía no hay adicionales
            </div>
            <p className="text-sm text-muted-foreground">
              Registra acá la obra extraordinaria apenas se detecta, aunque aún no esté valorizada:
              lo que no queda por escrito antes de ejecutarse suele terminar sin pagarse.
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
                  <TableHead>Adicional</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Días</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {adicionales.map((a) => {
                  const est = ESTADO_ADICIONAL[a.status];
                  const monto = montoConSigno(a);
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.number}</TableCell>
                      <TableCell>
                        <div className="font-medium text-foreground">{a.name}</div>
                        <StatusBadge tone={tonoTipoAdicional(a.type)}>
                          {TIPOS_ADICIONAL[a.type]}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {CAUSAS_ADICIONAL[a.cause]}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {monto === 0 ? '—' : `${monto < 0 ? '−' : ''}${formatCLP(Math.abs(monto))}`}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {a.extraDays > 0 ? `+${a.extraDays}` : '—'}
                      </TableCell>
                      <TableCell><StatusBadge tone={est.tone}>{est.label}</StatusBadge></TableCell>
                      <TableCell className="text-right">
                        <Link href={`/dashboard/oficina-tecnica/adicionales/${a.id}`}>
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

function Kpi({
  icon: Icon, label, value, hint, destacado,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  destacado?: boolean;
}) {
  return (
    <Card className={destacado ? 'border-primary/50' : undefined}>
      <CardContent className="space-y-1 p-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <div className={`text-xl font-bold ${destacado ? 'text-primary' : 'text-foreground'}`}>
          {value}
        </div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
