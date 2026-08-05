"use client";

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  HardHat, Send, ShieldCheck, AlertTriangle, ClipboardList, History,
} from 'lucide-react';
import { useAppState, useAuth } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCLP } from '@/lib/format';
import { formatDate } from '@/lib/date-utils';
import {
  acumuladosSubcontrato, montoItemizado, saldoRetencion, estadoCumplimiento,
  ESTADOS_EEPP_SUBCONTRATO,
} from '@/lib/subcontract';
import { observacionesPendientes } from '@/lib/reception';
import { misSubcontratos, contraparte, esDeOtraEmpresa } from '@/lib/company-link';
import { SubcontratoEeppForm } from '@/components/operations/subcontrato-eepp-form';
import { TONO_EEPP_SUBCONTRATO } from '@/components/operations/subcontrato-estado';

/**
 * Portal del subcontratista: su contrato, su avance y sus estados de pago.
 *
 * Es la misma información que ve la constructora en
 * `/oficina-tecnica/subcontratos/[id]`, pero acotada a SU subcontrato — el
 * recorte lo hace la base de datos por fila (migración 026), no esta pantalla.
 *
 * Reemplaza al módulo viejo, que armaba un "estado de pago" sumando las
 * partidas asignadas a un usuario: sin contrato, sin anticipo, sin retención y
 * sin IVA.
 */
export default function PortalSubcontratistaPage() {
  const { user, getTenantId } = useAuth();
  const {
    subcontracts, subcontractItems, subcontractCertificates, receptions,
    receptionObservations, projects, companyLinks, can, notify,
    setSubcontractCertificateStatus, updateSubcontractCertificate,
    deleteSubcontractCertificate,
  } = useAppState();

  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const miTenantId = getTenantId() ?? null;

  /**
   * Los subcontratos que YO ejecuto. Son dos casos y la base ya limita ambos:
   * el contacto designado dentro de la empresa que contrata (migración 026), y
   * la empresa contraparte que trabaja con su propia cuenta (migración 027).
   */
  const mios = useMemo(
    () => misSubcontratos(subcontracts, miTenantId, user?.id),
    [subcontracts, miTenantId, user],
  );

  const activo = useMemo(
    () => mios.find((s) => s.id === seleccionado) ?? mios[0] ?? null,
    [mios, seleccionado],
  );

  /** Quién me contrató, cuando el subcontrato es de otra empresa. */
  const empresaContratante = useMemo(() => {
    if (!activo || !esDeOtraEmpresa(activo, miTenantId)) return null;
    for (const l of companyLinks) {
      const otra = contraparte(l, miTenantId);
      if (otra && otra.tenantId === activo.tenantId) return otra.nombre;
    }
    return null;
  }, [activo, companyLinks, miTenantId]);

  const items = useMemo(
    () => (activo
      ? subcontractItems.filter((i) => i.subcontractId === activo.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
      : []),
    [subcontractItems, activo],
  );

  const eepps = useMemo(
    () => (activo
      ? subcontractCertificates.filter((c) => c.subcontractId === activo.id)
        .sort((a, b) => b.number - a.number)
      : []),
    [subcontractCertificates, activo],
  );

  const acumulado = useMemo(() => acumuladosSubcontrato(eepps), [eepps]);

  const retencion = useMemo(
    () => (activo
      ? saldoRetencion(eepps, receptions.filter((r) => r.subcontractId === activo.id))
      : { retenido: 0, devuelto: 0, saldo: 0 }),
    [eepps, receptions, activo],
  );

  /** Observaciones de recepción que le tocan subsanar. */
  const observaciones = useMemo(() => {
    if (!activo) return [];
    const misRecepciones = new Set(
      receptions.filter((r) => r.subcontractId === activo.id).map((r) => r.id),
    );
    return observacionesPendientes(
      receptionObservations.filter((o) => misRecepciones.has(o.receptionId)),
    );
  }, [receptions, receptionObservations, activo]);

  const obra = activo?.projectId
    ? projects.find((p) => p.id === activo.projectId)
    : null;

  const borrador = eepps.find((e) => e.status === 'borrador') ?? null;

  const presentar = async (id: string) => {
    setOcupado(true);
    try {
      await setSubcontractCertificateStatus(id, 'presentado', undefined);
      notify('Estado de pago presentado. Queda esperando la aprobación.', 'success');
    } catch (e: any) {
      notify(e.message ?? 'No se pudo presentar.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const guardarCertificado = async (
    id: string, campo: 'f30Date' | 'f30_1Date', valor: string,
  ) => {
    try {
      await updateSubcontractCertificate(id, { [campo]: (valor || null) as never });
    } catch (e: any) {
      notify(e.message ?? 'No se pudo guardar la fecha.', 'destructive');
    }
  };

  if (!can('subcontractor_portal:view')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Mi subcontrato" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No tienes acceso al portal del subcontratista.
        </CardContent></Card>
      </div>
    );
  }

  if (!activo) {
    return (
      <div className="space-y-6">
        <PageHeader title="Mi subcontrato" />
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <HardHat className="h-4 w-4" />
              Todavía no tienes un subcontrato asignado
            </div>
            <p className="text-sm text-muted-foreground">
              La empresa que te contrató tiene que registrar el subcontrato y designarte como su
              contacto. Ahí verás acá tu itemizado y podrás preparar tus estados de pago.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const valorContrato = activo.amountNet || montoItemizado(items);
  const avance = valorContrato > 0
    ? (acumulado.previousAmount / valorContrato) * 100
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mi subcontrato"
        description={[
          activo.name,
          obra?.name,
          empresaContratante ? `Para ${empresaContratante}` : null,
        ].filter(Boolean).join(' · ')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {mios.length > 1 && (
              <Select value={activo.id} onValueChange={setSeleccionado}>
                <SelectTrigger className="w-[16rem]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {mios.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Link href="/dashboard/estado-pago/historial">
              <Button variant="outline">
                <History className="mr-2 h-4 w-4" /> Historial
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Contratado" value={formatCLP(valorContrato)} />
        <Kpi
          label="Cobrado a la fecha"
          value={formatCLP(acumulado.previousAmount)}
          hint={`${avance.toFixed(0)}% del contrato`}
        />
        <Kpi
          label="Retención"
          value={formatCLP(retencion.saldo)}
          hint={retencion.devuelto > 0
            ? `${formatCLP(retencion.devuelto)} ya devuelto`
            : 'se devuelve al recibir el trabajo'}
        />
        <Kpi label="Anticipo por amortizar" value={formatCLP(
          Math.max(0, (activo.amountNet * (activo.advancePercent / 100)) - acumulado.previousAmortization),
        )} />
      </div>

      {observaciones.length > 0 && (
        <Card className="border-warning/40">
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <AlertTriangle className="h-4 w-4 text-warning" />
              {observaciones.length} observación(es) por subsanar
            </div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {observaciones.map((o) => (
                <li key={o.id}>
                  {o.description}
                  {o.location ? ` · ${o.location}` : ''}
                  {o.dueDate ? ` · para el ${formatDate(o.dueDate)}` : ''}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Preparar el estado de pago — mismo formulario que usa la constructora */}
      {borrador ? (
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle className="text-base">
              Estado de pago N° {borrador.number} en borrador
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span className="text-muted-foreground">
                {borrador.periodStart && borrador.periodEnd
                  ? `${formatDate(borrador.periodStart)} — ${formatDate(borrador.periodEnd)}`
                  : 'Sin período'}
              </span>
              <span className="font-semibold text-foreground">
                Total {formatCLP(borrador.totalAmount)}
              </span>
            </div>

            {activo.requiresLaborCompliance && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Fecha del F30</Label>
                  <Input
                    className="h-8" type="date"
                    defaultValue={borrador.f30Date ? String(borrador.f30Date).slice(0, 10) : ''}
                    onBlur={(e) => guardarCertificado(borrador.id, 'f30Date', e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Fecha del F30-1</Label>
                  <Input
                    className="h-8" type="date"
                    defaultValue={borrador.f30_1Date ? String(borrador.f30_1Date).slice(0, 10) : ''}
                    onBlur={(e) => guardarCertificado(borrador.id, 'f30_1Date', e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-2">
                  <p className="text-xs text-muted-foreground">
                    Sin el F30-1 del período la empresa no puede pagarte: lo exige la ley de
                    subcontratación y lo bloquea el sistema.
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button disabled={ocupado} onClick={() => presentar(borrador.id)}>
                <Send className="mr-2 h-4 w-4" /> Presentar a la empresa
              </Button>
              <Button
                variant="ghost" disabled={ocupado}
                onClick={() => deleteSubcontractCertificate(borrador.id)}
              >
                Descartar borrador
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <SubcontratoEeppForm subcontract={activo} permiteMulta={false} />
      )}

      {/* Itemizado */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Mi itemizado
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              Lo contratado con sus precios.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {items.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              La empresa todavía no cargó el itemizado de tu subcontrato.
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Últimos estados de pago */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" /> Mis estados de pago
            </span>
            <Link
              href="/dashboard/estado-pago/historial"
              className="text-sm font-medium text-primary hover:underline"
            >
              Ver todos
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {eepps.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no has presentado ninguno.</p>
          ) : eepps.slice(0, 5).map((e) => {
            const cumplimiento = estadoCumplimiento(e, activo);
            return (
              <div
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 p-3 text-sm"
              >
                <span className="font-medium text-foreground">
                  N° {e.number} · {formatCLP(e.totalAmount)}
                </span>
                <span className="text-muted-foreground">
                  {e.periodEnd ? formatDate(e.periodEnd) : '—'}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {cumplimiento === 'falta_f30_1' && e.status !== 'pagado' && (
                    <StatusBadge tone="danger">Falta F30-1</StatusBadge>
                  )}
                  {cumplimiento === 'ok' && (
                    <StatusBadge tone="success" icon={ShieldCheck}>F30 al día</StatusBadge>
                  )}
                  <StatusBadge tone={TONO_EEPP_SUBCONTRATO[e.status]}>
                    {ESTADOS_EEPP_SUBCONTRATO[e.status]}
                  </StatusBadge>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
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
