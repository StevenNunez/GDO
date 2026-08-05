"use client";

import Link from 'next/link';
import { useMemo } from 'react';
import {
  FileSignature, Wallet, Calculator, Boxes, ShieldAlert,
  CalendarClock, TrendingUp, AlertTriangle, FilePlus2,
  MessageCircleQuestion, FileStack, CalendarRange, HardHat, ClipboardCheck, Link2,
} from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { IndicadoresCard } from '@/components/operations/indicadores-card';
import { formatCLP } from '@/lib/format';
import { formatDate } from '@/lib/date-utils';
import {
  calcDiasAtraso, garantiasPorVencer,
  montoAnticipo, contractAmountClp, indiceALaFecha,
} from '@/lib/contract';
import { impactoContrato } from '@/lib/amendment';
import { resumenRdi } from '@/lib/rdi';

const HERRAMIENTAS = [
  { href: '/dashboard/oficina-tecnica/contrato', icon: FileSignature, title: 'Contrato', description: 'Ficha contractual, anticipo, retención y garantías.' },
  { href: '/dashboard/oficina-tecnica/adicionales', icon: FilePlus2, title: 'Adicionales', description: 'Obra extraordinaria, aumentos de obra y de plazo.' },
  { href: '/dashboard/oficina-tecnica/rdi', icon: MessageCircleQuestion, title: 'RDI', description: 'Consultas al mandante y al proyectista, con plazo.' },
  { href: '/dashboard/oficina-tecnica/planos', icon: FileStack, title: 'Planos', description: 'Documentos por revisión, con la vigente siempre clara.' },
  { href: '/dashboard/oficina-tecnica/programacion', icon: CalendarRange, title: 'Programación', description: 'Lookahead, programa semanal, PPC y causas.' },
  { href: '/dashboard/oficina-tecnica/subcontratos', icon: HardHat, title: 'Subcontratos', description: 'Contratos, estados de pago, retención y F30-1.' },
  { href: '/dashboard/oficina-tecnica/recepcion', icon: ClipboardCheck, title: 'Recepción', description: 'Provisoria y definitiva, observaciones y retención.' },
  { href: '/dashboard/vinculos', icon: Link2, title: 'Empresas vinculadas', description: 'Que tu subcontratista trabaje desde su propia cuenta.' },
  { href: '/dashboard/oficina-tecnica/presupuesto', icon: Wallet, title: 'Presupuesto', description: 'Gastos generales, imprevistos, utilidad e IVA.' },
  { href: '/dashboard/oficina-tecnica/apu', icon: Calculator, title: 'APU', description: 'Análisis de precio unitario por partida.' },
  { href: '/dashboard/oficina-tecnica/recursos', icon: Boxes, title: 'Recursos', description: 'Catálogo de materiales, mano de obra y equipos.' },
];

export default function OficinaTecnicaPage() {
  const { contracts, guarantees, amendments, rdis, marketIndices, currentProjectId, can } = useAppState();

  const contrato = useMemo(
    () => contracts.find((c) => c.projectId === currentProjectId) ?? null,
    [contracts, currentProjectId],
  );

  const garantiasContrato = useMemo(
    () => (contrato ? guarantees.filter((g) => g.contractId === contrato.id) : []),
    [guarantees, contrato],
  );

  const porVencer = useMemo(() => garantiasPorVencer(garantiasContrato), [garantiasContrato]);

  const valorUf = useMemo(() => indiceALaFecha(marketIndices, 'uf'), [marketIndices]);

  const resumenConsultas = useMemo(
    () => resumenRdi(rdis.filter((r) => r.projectId === currentProjectId)),
    [rdis, currentProjectId],
  );

  const adicionalesContrato = useMemo(
    () => (contrato ? amendments.filter((a) => a.contractId === contrato.id) : []),
    [amendments, contrato],
  );

  // El contrato vigente (con los adicionales aprobados) es el que manda.
  const impacto = useMemo(
    () => (contrato ? impactoContrato(contrato, adicionalesContrato) : null),
    [contrato, adicionalesContrato],
  );

  const fechaTermino = impacto?.fechaTerminoVigente ?? null;
  const diasAtraso = calcDiasAtraso(fechaTermino, new Date());
  const montoClp = contrato ? contractAmountClp(contrato, valorUf) : null;

  if (!can('module_technical_office:view')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Oficina Técnica" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No tienes permiso para ver este módulo.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Oficina Técnica"
        description="El puente entre el contrato y el terreno: presupuesto, contrato, garantías y control del avance valorizado."
      />

      {/* Estado del contrato de la obra activa */}
      {!contrato ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <FileSignature className="h-4 w-4" />
              Esta obra todavía no tiene contrato cargado
            </div>
            <p className="text-sm text-muted-foreground">
              Sin la ficha del contrato no se puede calcular un estado de pago: de ahí salen el
              anticipo a amortizar, la retención, el plazo y la base del reajuste.
            </p>
            <Link
              href="/dashboard/oficina-tecnica/contrato"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Cargar el contrato
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            icon={TrendingUp}
            label={impacto && impacto.montoAdicionales !== 0 ? 'Monto vigente' : 'Monto del contrato'}
            value={impacto && impacto.montoAdicionales !== 0
              ? formatCLP(impacto.montoVigente)
              : (montoClp !== null ? formatCLP(montoClp) : '—')}
            hint={impacto && impacto.montoAdicionales !== 0
              ? `Original ${formatCLP(impacto.montoOriginal)} + adicionales aprobados`
              : (contrato.currency === 'UF'
                ? (valorUf ? `${contrato.amountNet.toLocaleString('es-CL')} UF` : 'Falta el valor de la UF')
                : undefined)}
          />
          <Kpi
            icon={Wallet}
            label="Anticipo"
            value={contrato.advancePercent > 0 ? formatCLP(montoAnticipo(contrato)) : 'Sin anticipo'}
            hint={contrato.advancePercent > 0 ? `${contrato.advancePercent}% · se amortiza según avance` : undefined}
          />
          <Kpi
            icon={CalendarClock}
            label="Término contractual"
            value={fechaTermino ? formatDate(fechaTermino) : '—'}
            hint={fechaTermino
              ? (diasAtraso > 0
                ? `${diasAtraso} días de atraso`
                : (impacto && impacto.diasAumento > 0 ? `En plazo · +${impacto.diasAumento} días aprobados` : 'En plazo'))
              : 'Falta inicio o plazo'}
            tone={diasAtraso > 0 ? 'danger' : undefined}
          />
          <Kpi
            icon={ShieldAlert}
            label="Garantías"
            value={`${garantiasContrato.length}`}
            hint={porVencer.length > 0 ? `${porVencer.length} requieren atención` : 'Todas al día'}
            tone={porVencer.length > 0 ? 'warning' : undefined}
          />
        </div>
      )}

      {impacto && (impacto.montoEnTramite !== 0 || impacto.diasEnTramite > 0) && (
        <Card className="border-info/40">
          <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 p-5 text-sm">
            <span className="flex items-center gap-2 font-medium text-foreground">
              <FilePlus2 className="h-4 w-4 text-info" />
              Adicionales presentados sin respuesta del mandante
            </span>
            {impacto.montoEnTramite !== 0 && (
              <span className="text-muted-foreground">{formatCLP(impacto.montoEnTramite)}</span>
            )}
            {impacto.diasEnTramite > 0 && (
              <span className="text-muted-foreground">{impacto.diasEnTramite} días de plazo</span>
            )}
            <Link
              href="/dashboard/oficina-tecnica/adicionales"
              className="text-sm font-medium text-primary hover:underline"
            >
              Ver adicionales
            </Link>
          </CardContent>
        </Card>
      )}

      {(resumenConsultas.vencidas > 0 || resumenConsultas.impactoSinCobrar > 0) && (
        <Card className="border-warning/40">
          <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 p-5 text-sm">
            <span className="flex items-center gap-2 font-medium text-foreground">
              <MessageCircleQuestion className="h-4 w-4 text-warning" />
              Requerimientos de información
            </span>
            {resumenConsultas.vencidas > 0 && (
              <span className="text-muted-foreground">
                {resumenConsultas.vencidas} vencida(s) sin respuesta
              </span>
            )}
            {resumenConsultas.impactoSinCobrar > 0 && (
              <span className="text-muted-foreground">
                {resumenConsultas.impactoSinCobrar} con impacto declarado y sin adicional
              </span>
            )}
            <Link
              href="/dashboard/oficina-tecnica/rdi"
              className="text-sm font-medium text-primary hover:underline"
            >
              Ver RDI
            </Link>
          </CardContent>
        </Card>
      )}

      {porVencer.length > 0 && (
        <Card className="border-warning/40">
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Garantías que requieren atención
            </div>
            <ul className="space-y-2">
              {porVencer.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">
                    {g.number ? `N° ${g.number}` : 'Sin número'}
                    {g.bank ? ` · ${g.bank}` : ''}
                  </span>
                  <span className="text-foreground">Vence {formatDate(g.expiryDate)}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/dashboard/oficina-tecnica/contrato"
              className="inline-block text-sm font-medium text-primary hover:underline"
            >
              Ver garantías
            </Link>
          </CardContent>
        </Card>
      )}

      <IndicadoresCard />

      {/* Herramientas del módulo */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {HERRAMIENTAS.map(({ href, icon: Icon, title, description }) => (
          <Link key={href} href={href} className="group">
            <Card className="h-full transition-colors group-hover:border-primary/50">
              <CardContent className="space-y-2 p-5">
                <Icon className="h-5 w-5 text-primary" />
                <div className="font-semibold text-foreground">{title}</div>
                <p className="text-sm text-muted-foreground">{description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, hint, tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  tone?: 'danger' | 'warning';
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <div className="text-xl font-bold text-foreground">{value}</div>
        {hint && (
          tone
            ? <StatusBadge tone={tone}>{hint}</StatusBadge>
            : <p className="text-xs text-muted-foreground">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}
