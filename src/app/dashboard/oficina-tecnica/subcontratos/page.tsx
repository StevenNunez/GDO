"use client";

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Plus, HardHat, AlertTriangle } from 'lucide-react';
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
import { resumenSubcontratos, ESTADOS_SUBCONTRATO } from '@/lib/subcontract';
import { empresasVinculadas, subcontratosQueContrato } from '@/lib/company-link';
import type { ContractType, Subcontract } from '@/modules/core/lib/data';

const TIPOS: Record<ContractType, string> = {
  suma_alzada: 'Suma alzada',
  precios_unitarios: 'Precios unitarios',
  administracion_delegada: 'Administración delegada',
};

const TONO_ESTADO: Record<Subcontract['status'], 'neutral' | 'success' | 'warning' | 'info'> = {
  borrador: 'neutral',
  vigente: 'success',
  suspendido: 'warning',
  terminado: 'info',
  liquidado: 'neutral',
};

export default function SubcontratosPage() {
  const { getTenantId } = useAuth();
  const {
    subcontracts, subcontractCertificates, suppliers, companyLinks, currentProjectId,
    can, notify, addSubcontract,
  } = useAppState();

  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState<Partial<Subcontract>>({
    type: 'suma_alzada', retentionPercent: 5, advancePercent: 0,
  });
  const [proveedor, setProveedor] = useState('ninguno');
  const [empresaVinculada, setEmpresaVinculada] = useState('ninguna');
  const [guardando, setGuardando] = useState(false);

  const miTenantId = getTenantId() ?? null;

  /** Solo los que paga MI empresa: los de otras empresas se ven en el portal. */
  const deLaObra = useMemo(
    () => subcontratosQueContrato(subcontracts, miTenantId)
      .filter((s) => s.projectId === currentProjectId),
    [subcontracts, miTenantId, currentProjectId],
  );

  const vinculadas = useMemo(
    () => empresasVinculadas(companyLinks, miTenantId),
    [companyLinks, miTenantId],
  );

  const resumen = useMemo(
    () => resumenSubcontratos(deLaObra, subcontractCertificates),
    [deLaObra, subcontractCertificates],
  );

  const crear = async () => {
    if (!nuevo.name?.trim()) {
      notify('Ponle un nombre al subcontrato.', 'destructive');
      return;
    }
    setGuardando(true);
    try {
      const sup = proveedor !== 'ninguno' ? suppliers.find((s) => s.id === proveedor) : null;
      const vinculada = empresaVinculada !== 'ninguna'
        ? vinculadas.find((v) => v.tenantId === empresaVinculada)
        : null;
      await addSubcontract({
        ...nuevo,
        name: nuevo.name.trim(),
        projectId: currentProjectId,
        supplierId: sup?.id ?? null,
        supplierName: sup?.name ?? vinculada?.nombre ?? nuevo.supplierName ?? null,
        counterpartTenantId: vinculada?.tenantId ?? null,
      });
      notify('Subcontrato creado. Ahora carga su itemizado.', 'success');
      setNuevo({ type: 'suma_alzada', retentionPercent: 5, advancePercent: 0 });
      setProveedor('ninguno');
      setEmpresaVinculada('ninguna');
      setCreando(false);
    } catch (e: any) {
      notify(e.message ?? 'No se pudo crear el subcontrato.', 'destructive');
    } finally {
      setGuardando(false);
    }
  };

  if (!can('subcontracts:view')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Subcontratos" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No tienes permiso para ver los subcontratos.
        </CardContent></Card>
      </div>
    );
  }

  if (!currentProjectId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Subcontratos" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Selecciona una obra para ver sus subcontratos.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subcontratos"
        description="Lo que la obra le paga a sus subcontratistas: contrato, estados de pago, retención y cumplimiento laboral."
        actions={can('subcontracts:manage') && (
          <Button onClick={() => setCreando((v) => !v)}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo subcontrato
          </Button>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Contratado" value={formatCLP(resumen.contratado)} hint={`${resumen.vigentes} vigente(s)`} />
        <Kpi label="Ejecutado" value={formatCLP(resumen.ejecutado)} hint="avance en estados de pago firmes" />
        <Kpi label="Pagado" value={formatCLP(resumen.pagado)} hint="lo que salió de caja" />
        <Kpi label="Retenido" value={formatCLP(resumen.retenido)} hint="se devuelve al recibir la obra" />
      </div>

      {resumen.bloqueadosPorF30 > 0 && (
        <Card className="border-warning/40">
          <CardContent className="flex flex-wrap items-center gap-2 p-5 text-sm">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <span className="font-medium text-foreground">
              {resumen.bloqueadosPorF30} estado(s) de pago aprobado(s) sin certificado F30-1.
            </span>
            <span className="text-muted-foreground">
              No se pueden pagar: sin ese respaldo la empresa responde por las deudas laborales del
              subcontratista (Ley 20.123).
            </span>
          </CardContent>
        </Card>
      )}

      {creando && can('subcontracts:manage') && (
        <Card>
          <CardHeader><CardTitle className="text-base">Nuevo subcontrato</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-medium text-muted-foreground">Nombre</Label>
                <Input
                  value={nuevo.name ?? ''}
                  placeholder="Ej: Instalación eléctrica"
                  onChange={(e) => setNuevo((n) => ({ ...n, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Subcontratista</Label>
                <Select value={proveedor} onValueChange={setProveedor}>
                  <SelectTrigger><SelectValue placeholder="Sin proveedor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ninguno">Escribirlo a mano</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {proveedor === 'ninguno' && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Nombre del subcontratista</Label>
                  <Input
                    value={nuevo.supplierName ?? ''}
                    onChange={(e) => setNuevo((n) => ({ ...n, supplierName: e.target.value }))}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Tipo</Label>
                <Select
                  value={nuevo.type ?? 'suma_alzada'}
                  onValueChange={(v) => setNuevo((n) => ({ ...n, type: v as ContractType }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPOS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Monto neto ($)</Label>
                <Input
                  type="number"
                  value={nuevo.amountNet ?? ''}
                  onChange={(e) => setNuevo((n) => ({ ...n, amountNet: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Anticipo (%)</Label>
                <Input
                  type="number"
                  value={nuevo.advancePercent ?? 0}
                  onChange={(e) => setNuevo((n) => ({ ...n, advancePercent: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  Empresa vinculada (opcional)
                </Label>
                <Select value={empresaVinculada} onValueChange={setEmpresaVinculada}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ninguna">No usa la app</SelectItem>
                    {vinculadas.map((v) => (
                      <SelectItem key={v.tenantId} value={v.tenantId}>
                        {v.nombre ?? v.tenantId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Si el subcontratista tiene su propia cuenta, vincúlala y él podrá preparar sus
                  estados de pago desde su lado. Se administra en Empresas vinculadas.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Retención (%)</Label>
                <Input
                  type="number"
                  value={nuevo.retentionPercent ?? 0}
                  onChange={(e) => setNuevo((n) => ({ ...n, retentionPercent: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={crear} disabled={guardando}>
                {guardando ? 'Guardando…' : 'Crear subcontrato'}
              </Button>
              <Button variant="ghost" onClick={() => setCreando(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {deLaObra.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <HardHat className="h-4 w-4" />
              Todavía no hay subcontratos
            </div>
            <p className="text-sm text-muted-foreground">
              Registra acá cada subcontrato con su monto, anticipo y retención. Después sus estados
              de pago se calculan con el mismo motor que el estado de pago al mandante.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subcontrato</TableHead>
                  <TableHead>Subcontratista</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Retención</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {deLaObra.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-medium text-foreground">{s.name}</div>
                      {s.code && <div className="text-xs text-muted-foreground">{s.code}</div>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.supplierName ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{TIPOS[s.type]}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCLP(s.amountNet)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {s.retentionPercent}%
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={TONO_ESTADO[s.status]}>
                        {ESTADOS_SUBCONTRATO[s.status]}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/dashboard/oficina-tecnica/subcontratos/${s.id}`}>
                        <Button variant="ghost" size="sm">Ver</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
