"use client";

/**
 * Contratistas — la carpeta de papeles de cada uno, y quién puede contratarse.
 *
 * El «enrolamiento» que pedía la pizarra no es un botón: es el estado de esta
 * carpeta, y se calcula. Un contratista deja de estar enrolado el día que se le
 * vence el F30-1, sin que nadie apriete nada.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ChevronRight, FolderOpen, ListChecks, Plus, Search, Trash2,
} from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { PlanLocked } from '@/components/plan-locked';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/modules/core/hooks/use-toast';
import {
  ESTADO_ENROLAMIENTO_LABEL, ESTADO_ENROLAMIENTO_TONO,
  expedienteDe, resumenContratistas, vencimientosProximos,
} from '@/lib/contractor-file';

export default function ContratistasPage() {
  const {
    suppliers, contractorDocumentTypes, contractorDocuments,
    can, lockedFeature, updateSupplier,
  } = useAppState();
  const { toast } = useToast();

  const [busqueda, setBusqueda] = useState('');
  const [catalogoAbierto, setCatalogoAbierto] = useState(false);

  const contratistas = useMemo(
    () => suppliers.filter((s) => s.isContractor),
    [suppliers],
  );

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return contratistas;
    return contratistas.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.rut ?? '').toLowerCase().includes(q),
    );
  }, [contratistas, busqueda]);

  const resumen = useMemo(
    () => resumenContratistas(contratistas, contractorDocumentTypes, contractorDocuments),
    [contratistas, contractorDocumentTypes, contractorDocuments],
  );

  const alertas = useMemo(
    () => vencimientosProximos(contratistas, contractorDocumentTypes, contractorDocuments),
    [contratistas, contractorDocumentTypes, contractorDocuments],
  );

  /** Proveedores que todavía no están marcados como contratistas. */
  const candidatos = useMemo(
    () => suppliers.filter((s) => !s.isContractor),
    [suppliers],
  );

  if (lockedFeature('contractors:view')) {
    return <PlanLocked feature="subcontracts" title="Contratistas" />;
  }
  if (!can('contractors:view')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Contratistas" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No tienes permiso para ver el expediente de los contratistas.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contratistas"
        description="El expediente de papeles de cada contratista. Sin él no se le puede firmar un contrato ni pagarle un estado de pago."
        actions={
          can('contractors:manage') ? (
            <Button variant="outline" onClick={() => setCatalogoAbierto(true)}>
              <ListChecks className="mr-2 h-4 w-4" /> Documentos exigidos
            </Button>
          ) : undefined
        }
      />

      {contractorDocumentTypes.length === 0 && (
        <Card className="border-warning/40">
          <CardContent className="flex flex-col items-start gap-3 p-5 text-sm">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Todavía no defines qué papeles le exiges a tus contratistas
            </div>
            <p className="text-muted-foreground">
              Sin esa lista, ningún contratista puede quedar enrolado y no se le puede
              firmar un contrato. Puedes partir del listado estándar chileno y
              después ajustarlo.
            </p>
            {can('contractors:manage') && (
              <Button onClick={() => setCatalogoAbierto(true)}>
                Definir los documentos exigidos
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Resumen */}
      {contratistas.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Contador label="Enrolados" valor={resumen.enrolado} tono="success" />
          <Contador label="Incompletos" valor={resumen.incompleto} tono="warning" />
          <Contador label="Con observaciones" valor={resumen.observado} tono="danger" />
          <Contador label="Con documentos vencidos" valor={resumen.vencido} tono="danger" />
        </div>
      )}

      {/* Lo que vence: el aviso que evita descubrir el F30-1 vencido el día de pagar */}
      {alertas.length > 0 && (
        <Card className="border-warning/40">
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Documentos vencidos o por vencer
            </div>
            <ul className="divide-y divide-border">
              {alertas.slice(0, 8).map((a, i) => {
                const dias = a.linea.diasParaVencer ?? 0;
                return (
                  <li key={i} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <Link
                      href={`/dashboard/oficina-tecnica/contratistas/${a.supplierId}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {a.supplierName}
                    </Link>
                    <span className="text-muted-foreground">· {a.linea.tipo.name}</span>
                    <span className="ml-auto">
                      <StatusBadge tone={dias < 0 ? 'danger' : 'warning'}>
                        {dias < 0
                          ? `Venció hace ${Math.abs(dias)} día(s)`
                          : `Vence en ${dias} día(s)`}
                      </StatusBadge>
                    </span>
                  </li>
                );
              })}
            </ul>
            {alertas.length > 8 && (
              <p className="text-xs text-muted-foreground">y {alertas.length - 8} más.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Buscador */}
      {contratistas.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre o RUT"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
      )}

      {/* Lista */}
      {filtrados.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 p-6 text-sm">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <FolderOpen className="h-4 w-4" />
              {contratistas.length === 0
                ? 'Todavía no marcaste a ningún proveedor como contratista'
                : 'Ningún contratista coincide con la búsqueda'}
            </div>
            {contratistas.length === 0 && (
              <p className="text-muted-foreground">
                Los contratistas salen de tus proveedores: marca abajo a los que le
                subcontratas obra. Un proveedor de áridos no necesita expediente.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {filtrados.map((c) => {
              const exp = expedienteDe(c.id, contractorDocumentTypes, contractorDocuments);
              return (
                <Link
                  key={c.id}
                  href={`/dashboard/oficina-tecnica/contratistas/${c.id}`}
                  className="flex flex-wrap items-center gap-3 p-4 text-sm hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.rut || 'Sin RUT'}
                      {c.representativeName ? ` · ${c.representativeName}` : ''}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {exp.avance}% del expediente
                  </span>
                  <StatusBadge tone={ESTADO_ENROLAMIENTO_TONO[exp.estado]}>
                    {ESTADO_ENROLAMIENTO_LABEL[exp.estado]}
                  </StatusBadge>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Marcar proveedores como contratistas */}
      {can('contractors:manage') && candidatos.length > 0 && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="text-sm font-semibold text-foreground">
              Marcar un proveedor como contratista
            </div>
            <p className="text-sm text-muted-foreground">
              Solo a estos se les pide expediente. Un proveedor de materiales no lo necesita.
            </p>
            <div className="flex flex-wrap gap-2">
              {candidatos.slice(0, 20).map((s) => (
                <Button
                  key={s.id}
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await updateSupplier(s.id, { isContractor: true } as never);
                      toast({ title: `${s.name} ahora es contratista`, description: 'Cárgale sus documentos.' });
                    } catch (e: any) {
                      toast({ variant: 'destructive', title: 'No se pudo marcar', description: e.message });
                    }
                  }}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> {s.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {catalogoAbierto && (
        <DialogoCatalogo onCerrar={() => setCatalogoAbierto(false)} />
      )}
    </div>
  );
}

function Contador({
  label, valor, tono,
}: {
  label: string;
  valor: number;
  tono: 'success' | 'warning' | 'danger';
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="text-2xl font-bold text-foreground">{valor}</div>
        {valor > 0 && tono !== 'success' && (
          <StatusBadge tone={tono}>Requieren atención</StatusBadge>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Catálogo: qué papeles exige la empresa ────────────────────────────── */

function DialogoCatalogo({ onCerrar }: { onCerrar: () => void }) {
  const {
    contractorDocumentTypes,
    seedContractorDocumentTypes, addContractorDocumentType,
    updateContractorDocumentType, deleteContractorDocumentType,
  } = useAppState();
  const { toast } = useToast();

  const [nombre, setNombre] = useState('');
  const [obligatorio, setObligatorio] = useState(true);
  const [vence, setVence] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const tipos = useMemo(
    () => [...contractorDocumentTypes].sort((a, b) => a.sortOrder - b.sortOrder),
    [contractorDocumentTypes],
  );

  async function cargarEstandar() {
    setOcupado(true);
    try {
      const n = await seedContractorDocumentTypes();
      toast(n > 0
        ? { title: `${n} documentos agregados`, description: 'Ajusta cuáles son obligatorios según tu empresa.' }
        : { title: 'Ya los tenías todos', description: 'No se agregó ninguno nuevo.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo cargar', description: e.message });
    } finally {
      setOcupado(false);
    }
  }

  async function agregar() {
    if (!nombre.trim()) return;
    setOcupado(true);
    try {
      await addContractorDocumentType({
        name: nombre.trim(),
        required: obligatorio,
        hasExpiry: vence,
        sortOrder: (tipos[tipos.length - 1]?.sortOrder ?? 0) + 10,
      });
      setNombre(''); setObligatorio(true); setVence(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo agregar', description: e.message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Documentos exigidos a los contratistas</DialogTitle>
          <DialogDescription>
            Los obligatorios son los que deciden si un contratista queda enrolado.
            Los que vencen piden fecha y avisan antes de caducar.
          </DialogDescription>
        </DialogHeader>

        {tipos.length === 0 ? (
          <div className="space-y-3 rounded-md border border-dashed border-border p-4 text-sm">
            <p className="text-muted-foreground">
              Todavía no exiges ningún documento. El listado estándar chileno incluye
              e-RUT, escritura, vigencia, poder, mutual, F30, F30-1, póliza y datos
              bancarios. Puedes ajustarlo después.
            </p>
            <Button onClick={cargarEstandar} disabled={ocupado}>
              Cargar el listado estándar
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {tipos.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className={t.active ? 'text-foreground' : 'text-muted-foreground line-through'}>
                    {t.name}
                  </div>
                  {t.description && (
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                  )}
                </div>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Switch
                    checked={t.required}
                    onCheckedChange={(v) => updateContractorDocumentType(t.id, { required: v })}
                  />
                  Obligatorio
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Switch
                    checked={t.hasExpiry}
                    onCheckedChange={(v) => updateContractorDocumentType(t.id, { hasExpiry: v })}
                  />
                  Vence
                </label>
                <Button
                  variant="ghost" size="icon" aria-label="Quitar"
                  onClick={() => deleteContractorDocumentType(t.id)}
                >
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3 rounded-md border border-border p-3">
          <Label htmlFor="tipo-nuevo">Agregar otro documento</Label>
          <Input
            id="tipo-nuevo"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Certificación ISO 9001"
          />
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={obligatorio} onCheckedChange={setObligatorio} /> Obligatorio
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={vence} onCheckedChange={setVence} /> Tiene vencimiento
            </label>
            <Button size="sm" onClick={agregar} disabled={ocupado || !nombre.trim()}>
              Agregar
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
