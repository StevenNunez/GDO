'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useAuth, useAppState } from '@/modules/core/contexts/app-provider';
import { useToast } from '@/modules/core/hooks/use-toast';
import { LibroObraAsiento, AsientoTipo } from '@/modules/core/lib/data';
import { PageHeader } from '@/components/page-header';
import { SurfaceCard } from '@/components/ui/surface-card';
import { PanelCard } from '@/components/ui/panel-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import SignaturePad from '@/components/signature-pad';
import {
  BookMarked, Plus, FileDown, Loader2, Pen, CheckCircle2,
  ChevronDown, ChevronUp, AlertTriangle, Clock, User,
  Building2, Shield,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toDate } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import { EnviarDocumento } from '@/components/enviar-documento';

// ── Tipos y constantes ───────────────────────────────────────────────────────

// El tipo de asiento es una categoría (11 valores), no un estado, así que no
// entra en los tonos semánticos de StatusBadge: lleva paleta propia en pares
// claro/oscuro para que el texto siga legible sobre el fondo claro.
const TIPO_OPTIONS: { value: AsientoTipo; label: string; color: string }[] = [
  { value: 'inicio-obra', label: 'Inicio de Obra', color: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30' },
  { value: 'entrega-terreno', label: 'Entrega de Terreno', color: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30' },
  { value: 'orden-trabajo', label: 'Orden de Trabajo', color: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30' },
  { value: 'modificacion-proyecto', label: 'Modificación de Proyecto', color: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30' },
  { value: 'observacion-ito', label: 'Observación del ITO', color: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30' },
  { value: 'respuesta-constructor', label: 'Respuesta del Constructor', color: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30' },
  { value: 'avance', label: 'Avance de Obra', color: 'bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30' },
  { value: 'incidente', label: 'Incidente / Accidente', color: 'bg-red-600/20 text-red-800 dark:text-red-300 border-red-600/40' },
  { value: 'paralizacion', label: 'Paralización', color: 'bg-amber-600/15 text-amber-800 dark:text-amber-300 border-amber-600/30' },
  { value: 'reanudacion', label: 'Reanudación', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' },
  { value: 'termino-obra', label: 'Término de Obra', color: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30' },
];

const ROL_OPTIONS = [
  { value: 'propietario', label: 'Propietario' },
  { value: 'arquitecto', label: 'Arquitecto' },
  { value: 'calculista', label: 'Calculista' },
  { value: 'constructor', label: 'Constructor' },
  { value: 'ito', label: 'Inspector Técnico (ITO)' },
  { value: 'revisor', label: 'Revisor Independiente' },
];

const tipoInfo = (tipo: AsientoTipo) =>
  TIPO_OPTIONS.find(t => t.value === tipo) ?? TIPO_OPTIONS[0];

const fmtDate = (d: any) => {
  const dt = toDate(d);
  return dt ? format(dt, "d 'de' MMMM 'de' yyyy", { locale: es }) : '—';
};

// ── Componente Asiento ───────────────────────────────────────────────────────

function AsientoCard({
  asiento,
  canSign,
  onSign,
}: {
  asiento: LibroObraAsiento;
  canSign: boolean;
  onSign: (a: LibroObraAsiento) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const info = tipoInfo(asiento.tipo);

  return (
    <SurfaceCard interactive={false}>
      <div
        className="cursor-pointer p-5 transition-colors hover:bg-muted/40"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <span className="shrink-0 rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
              N° {asiento.numero}
            </span>
            <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', info.color)}>
              {info.label}
            </span>
            <span className="shrink-0 text-sm text-muted-foreground">
              {fmtDate(asiento.fecha)}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {asiento.firmado ? (
              <StatusBadge tone="success" icon={CheckCircle2}>Firmado</StatusBadge>
            ) : (
              <>
                {canSign && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-primary/40 text-xs text-primary"
                    onClick={e => { e.stopPropagation(); onSign(asiento); }}
                  >
                    <Pen className="mr-1 h-3 w-3" /> Firmar
                  </Button>
                )}
                <StatusBadge tone="warning" icon={Clock}>Sin firma</StatusBadge>
              </>
            )}
            {expanded
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />
            }
          </div>
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{asiento.contenido}</p>
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-border p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Contenido completo</p>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{asiento.contenido}</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-4 w-4 shrink-0" />
            <span>
              <strong>{asiento.autorNombre}</strong>
              {' — '}
              {ROL_OPTIONS.find(r => r.value === asiento.autorRol)?.label ?? asiento.autorRol}
            </span>
          </div>
          {asiento.firmado && asiento.firmaDigital && (
            <div>
              <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-success">
                <CheckCircle2 className="h-3.5 w-3.5" /> Firma digital
              </p>
              {/* La firma se dibuja en negro, así que el fondo blanco es fijo a propósito. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={asiento.firmaDigital}
                alt="Firma digital"
                className="h-20 rounded border border-border bg-white object-contain p-1"
              />
              {asiento.firmadoAt && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Firmado el {fmtDate(asiento.firmadoAt)}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </SurfaceCard>
  );
}

// ── Formulario de configuración (carátula) ───────────────────────────────────

type CaratulaFields = {
  nombreProyecto: string; direccionObra: string; comunaObra: string;
  numeroPermiso: string; fechaPermiso: string;
  nombrePropietario: string; rutPropietario: string;
  nombreArquitecto: string; rutArquitecto: string;
  nombreCalculista: string; rutCalculista: string;
  nombreConstructor: string; rutConstructor: string;
  nombreITO: string; rutITO: string;
  nombreRevisorIndependiente: string; rutRevisorIndependiente: string;
  fechaInicioObra: string; fechaEntregaTerreno: string;
};

const emptyCaratula = (): CaratulaFields => ({
  nombreProyecto: '', direccionObra: '', comunaObra: '',
  numeroPermiso: '', fechaPermiso: '',
  nombrePropietario: '', rutPropietario: '',
  nombreArquitecto: '', rutArquitecto: '',
  nombreCalculista: '', rutCalculista: '',
  nombreConstructor: '', rutConstructor: '',
  nombreITO: '', rutITO: '',
  nombreRevisorIndependiente: '', rutRevisorIndependiente: '',
  fechaInicioObra: '', fechaEntregaTerreno: '',
});

function fieldGroup(
  form: CaratulaFields,
  setForm: React.Dispatch<React.SetStateAction<CaratulaFields>>,
  fields: { id: keyof CaratulaFields; label: string; placeholder?: string; type?: string; required?: boolean }[]
) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {fields.map(f => (
        <div key={f.id} className="space-y-1.5">
          <Label htmlFor={f.id}>
            {f.label}{f.required && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          <Input
            id={f.id}
            type={f.type ?? 'text'}
            placeholder={f.placeholder}
            value={form[f.id] as string}
            onChange={e => setForm(prev => ({ ...prev, [f.id]: e.target.value }))}
          />
        </div>
      ))}
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────

export default function LibroObraPage() {
  const { user } = useAuth();
  const { libroObra, libroObraAsientos, createLibroObra, updateLibroObra, addAsiento, signAsiento, can } = useAppState();
  const { toast } = useToast();

  // Setup state
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [caratulaForm, setCaratulaForm] = useState<CaratulaFields>(emptyCaratula);
  const [isCreating, setIsCreating] = useState(false);

  // New asiento state
  const [showAsientoForm, setShowAsientoForm] = useState(false);
  const [asientoForm, setAsientoForm] = useState({
    fecha: format(new Date(), 'yyyy-MM-dd'),
    tipo: 'avance' as AsientoTipo,
    contenido: '',
    autorRol: 'constructor',
  });
  const [isAddingAsiento, setIsAddingAsiento] = useState(false);

  // Sign state
  const [signTarget, setSignTarget] = useState<LibroObraAsiento | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const sigPadRef = useRef<any>(null);

  // PDF state
  const [isExporting, setIsExporting] = useState(false);

  const canEdit = can('construction_control:edit_structure');
  const canAddAsiento = can('construction_control:register_progress') || canEdit;
  const canSign = canAddAsiento;

  // Populate form when editing existing libro
  const startEdit = useCallback(() => {
    if (libroObra) {
      setCaratulaForm({
        nombreProyecto: libroObra.nombreProyecto,
        direccionObra: libroObra.direccionObra,
        comunaObra: libroObra.comunaObra,
        numeroPermiso: libroObra.numeroPermiso,
        fechaPermiso: libroObra.fechaPermiso ? format(toDate(libroObra.fechaPermiso)!, 'yyyy-MM-dd') : '',
        nombrePropietario: libroObra.nombrePropietario,
        rutPropietario: libroObra.rutPropietario,
        nombreArquitecto: libroObra.nombreArquitecto,
        rutArquitecto: libroObra.rutArquitecto,
        nombreCalculista: libroObra.nombreCalculista ?? '',
        rutCalculista: libroObra.rutCalculista ?? '',
        nombreConstructor: libroObra.nombreConstructor,
        rutConstructor: libroObra.rutConstructor,
        nombreITO: libroObra.nombreITO ?? '',
        rutITO: libroObra.rutITO ?? '',
        nombreRevisorIndependiente: libroObra.nombreRevisorIndependiente ?? '',
        rutRevisorIndependiente: libroObra.rutRevisorIndependiente ?? '',
        fechaInicioObra: libroObra.fechaInicioObra ? format(toDate(libroObra.fechaInicioObra)!, 'yyyy-MM-dd') : '',
        fechaEntregaTerreno: libroObra.fechaEntregaTerreno ? format(toDate(libroObra.fechaEntregaTerreno)!, 'yyyy-MM-dd') : '',
      });
    } else {
      setCaratulaForm(emptyCaratula());
    }
    setIsSetupMode(true);
  }, [libroObra]);

  const parseDate = (s: string) => s ? new Date(s + 'T12:00:00') : undefined;

  const handleSaveCaratula = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = caratulaForm;
    if (!f.nombreProyecto || !f.numeroPermiso || !f.nombrePropietario) {
      toast({ variant: 'destructive', title: 'Faltan datos obligatorios' });
      return;
    }
    setIsCreating(true);
    try {
      const payload = {
        nombreProyecto: f.nombreProyecto,
        direccionObra: f.direccionObra,
        comunaObra: f.comunaObra,
        numeroPermiso: f.numeroPermiso,
        fechaPermiso: parseDate(f.fechaPermiso) ?? null,
        nombrePropietario: f.nombrePropietario,
        rutPropietario: f.rutPropietario,
        nombreArquitecto: f.nombreArquitecto,
        rutArquitecto: f.rutArquitecto,
        nombreCalculista: f.nombreCalculista || undefined,
        rutCalculista: f.rutCalculista || undefined,
        nombreConstructor: f.nombreConstructor,
        rutConstructor: f.rutConstructor,
        nombreITO: f.nombreITO || undefined,
        rutITO: f.rutITO || undefined,
        nombreRevisorIndependiente: f.nombreRevisorIndependiente || undefined,
        rutRevisorIndependiente: f.rutRevisorIndependiente || undefined,
        fechaInicioObra: parseDate(f.fechaInicioObra) ?? null,
        fechaEntregaTerreno: parseDate(f.fechaEntregaTerreno) ?? null,
        estado: 'vigente' as const,
        projectId: null,
      };

      if (libroObra) {
        await updateLibroObra(libroObra.id, payload);
        toast({ title: 'Carátula actualizada' });
      } else {
        await createLibroObra(payload);
        toast({ title: 'Libro de Obra creado', description: 'Ya puedes comenzar a registrar asientos.' });
      }
      setIsSetupMode(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setIsCreating(false);
    }
  };

  const handleAddAsiento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!libroObra) return;
    if (!asientoForm.contenido.trim()) {
      toast({ variant: 'destructive', title: 'Debes escribir el contenido del asiento.' });
      return;
    }
    setIsAddingAsiento(true);
    try {
      await addAsiento({
        libroId: libroObra.id,
        fecha: new Date(asientoForm.fecha + 'T12:00:00'),
        tipo: asientoForm.tipo,
        contenido: asientoForm.contenido.trim(),
        autorRol: asientoForm.autorRol,
      });
      toast({ title: 'Asiento agregado al libro.' });
      setAsientoForm({ fecha: format(new Date(), 'yyyy-MM-dd'), tipo: 'avance', contenido: '', autorRol: 'constructor' });
      setShowAsientoForm(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setIsAddingAsiento(false);
    }
  };

  const handleSign = async () => {
    if (!signTarget || !sigPadRef.current) return;
    if (sigPadRef.current.isEmpty?.()) {
      toast({ variant: 'destructive', title: 'Dibuja tu firma antes de confirmar.' });
      return;
    }
    const firmaDataUrl = sigPadRef.current.getTrimmedCanvas().toDataURL('image/png');
    setIsSigning(true);
    try {
      await signAsiento(signTarget.id, firmaDataUrl);
      toast({ title: 'Asiento firmado', description: `Asiento N°${signTarget.numero} firmado digitalmente.` });
      setSignTarget(null);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setIsSigning(false);
    }
  };

  const handleExportPDF = async () => {
    if (!libroObra) return;
    setIsExporting(true);
    try {
      const { generateLibroObraPDF } = await import('@/lib/libro-obra-pdf-generator');
      await generateLibroObraPDF(libroObra, libroObraAsientos);
      toast({ title: 'PDF generado', description: 'El Libro de Obra fue descargado.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error al generar PDF', description: err.message });
    } finally {
      setIsExporting(false);
    }
  };

  // ── Setup de carátula ────────────────────────────────────────────────────
  if (!libroObra || isSetupMode) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-10">
        <PageHeader
          title={libroObra ? 'Editar Carátula' : 'Configurar Libro de Obra Digital'}
          description={libroObra
            ? 'Actualiza los datos del proyecto y sus partes intervinientes.'
            : 'Completa los datos obligatorios de la carátula del Libro de Obra según la normativa vigente.'
          }
        />

        <div className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <Shield className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            El Libro de Obra es un documento oficial obligatorio según la Ley General de Urbanismo y Construcciones de Chile.
            Debe incluir la individualización del proyecto, permiso municipal y todos los profesionales responsables de la obra.
          </p>
        </div>

        <form onSubmit={handleSaveCaratula} className="space-y-6">
          {/* Identificación */}
          <PanelCard title="Identificación del Proyecto" icon={Building2}>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="nombreProyecto">Nombre del Proyecto <span className="text-destructive">*</span></Label>
                <Input id="nombreProyecto" placeholder="Ej: Edificio Residencial Las Condes Block A" value={caratulaForm.nombreProyecto} onChange={e => setCaratulaForm(p => ({ ...p, nombreProyecto: e.target.value }))} />
              </div>
              {fieldGroup(caratulaForm, setCaratulaForm, [
                { id: 'direccionObra', label: 'Dirección de la obra', placeholder: 'Calle, número', required: true },
                { id: 'comunaObra', label: 'Comuna', placeholder: 'Ej: Providencia', required: true },
                { id: 'numeroPermiso', label: 'N° Permiso Municipal', placeholder: 'Ej: 2024-00123', required: true },
                { id: 'fechaPermiso', label: 'Fecha del Permiso', type: 'date' },
                { id: 'fechaInicioObra', label: 'Fecha Inicio de Obra', type: 'date' },
                { id: 'fechaEntregaTerreno', label: 'Fecha Entrega de Terreno', type: 'date' },
              ])}
            </div>
          </PanelCard>

          {/* Propietario y Arquitecto */}
          <PanelCard title="Propietario y Proyectistas" icon={User}>
              {fieldGroup(caratulaForm, setCaratulaForm, [
                { id: 'nombrePropietario', label: 'Nombre Propietario / Mandante', required: true },
                { id: 'rutPropietario', label: 'RUT Propietario', placeholder: '12.345.678-9' },
                { id: 'nombreArquitecto', label: 'Arquitecto', required: true },
                { id: 'rutArquitecto', label: 'RUT Arquitecto', placeholder: '12.345.678-9' },
                { id: 'nombreCalculista', label: 'Calculista Estructural' },
                { id: 'rutCalculista', label: 'RUT Calculista' },
              ])}
          </PanelCard>

          {/* Constructor e ITO */}
          <PanelCard title="Constructor e Inspección" icon={Shield}>
              {fieldGroup(caratulaForm, setCaratulaForm, [
                { id: 'nombreConstructor', label: 'Empresa Constructora', required: true },
                { id: 'rutConstructor', label: 'RUT Constructora' },
                { id: 'nombreITO', label: 'Inspector Técnico de Obra (ITO)' },
                { id: 'rutITO', label: 'RUT del ITO' },
                { id: 'nombreRevisorIndependiente', label: 'Revisor Independiente' },
                { id: 'rutRevisorIndependiente', label: 'RUT Revisor Independiente' },
              ])}
          </PanelCard>

          <div className="flex gap-3">
            {libroObra && (
              <Button type="button" variant="ghost" onClick={() => setIsSetupMode(false)} disabled={isCreating}>
                Cancelar
              </Button>
            )}
            <Button type="submit" disabled={isCreating} className="flex-1 sm:flex-none">
              {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BookMarked className="mr-2 h-4 w-4" />}
              {libroObra ? 'Guardar cambios' : 'Crear Libro de Obra'}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // ── Vista principal del Libro ────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Libro de Obra Digital"
          description={`${libroObra.nombreProyecto} · Permiso N° ${libroObra.numeroPermiso}`}
        />
        <div className="flex gap-2 flex-wrap">
          {canEdit && (
            <Button variant="outline" size="sm" onClick={startEdit}>
              Editar carátula
            </Button>
          )}
          {libroObraAsientos.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={isExporting}>
              {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
              Exportar PDF
            </Button>
          )}
          {libroObraAsientos.length > 0 && libroObra && (
            <EnviarDocumento
              fileName="Libro_de_Obra.pdf"
              asuntoSugerido="Libro de Obra"
              descripcionDestinatario="la ITO o el mandante"
              mensajeSugerido="Adjuntamos el Libro de Obra al día para su revisión."
              generarPdf={async () => {
                const { generateLibroObraPDF } = await import('@/lib/libro-obra-pdf-generator');
                return generateLibroObraPDF(libroObra, libroObraAsientos, 'blob');
              }}
            />
          )}
          {canAddAsiento && (
            <Button size="sm" onClick={() => setShowAsientoForm(s => !s)}>
              <Plus className="mr-2 h-4 w-4" /> Nuevo asiento
            </Button>
          )}
        </div>
      </div>

      {/* Formulario nuevo asiento */}
      {showAsientoForm && (
        <PanelCard
          title="Nuevo asiento de Libro de Obra"
          description="El texto queda con validez legal una vez firmado."
          icon={Plus}
          className="border-primary/30"
        >
            <form onSubmit={handleAddAsiento} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="asientoFecha">Fecha</Label>
                  <Input
                    id="asientoFecha"
                    type="date"
                    value={asientoForm.fecha}
                    onChange={e => setAsientoForm(f => ({ ...f, fecha: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo de asiento</Label>
                  <Select value={asientoForm.tipo} onValueChange={v => setAsientoForm(f => ({ ...f, tipo: v as AsientoTipo }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPO_OPTIONS.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Redactado en calidad de</Label>
                  <Select value={asientoForm.autorRol} onValueChange={v => setAsientoForm(f => ({ ...f, autorRol: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROL_OPTIONS.map(r => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {asientoForm.tipo === 'incidente' && (
                <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-subtle p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                  <p className="text-sm text-danger">
                    Los incidentes deben notificarse además a la Mutual de Seguridad y a la Inspección del Trabajo según corresponda.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="contenido">Contenido del asiento <span className="text-destructive">*</span></Label>
                <Textarea
                  id="contenido"
                  placeholder="Redacta el contenido del asiento con claridad y precisión. Este texto tendrá validez legal como parte del Libro de Obra oficial..."
                  rows={6}
                  value={asientoForm.contenido}
                  onChange={e => setAsientoForm(f => ({ ...f, contenido: e.target.value }))}
                />
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setShowAsientoForm(false)} disabled={isAddingAsiento}>Cancelar</Button>
                <Button type="submit" disabled={isAddingAsiento} className="flex-1 sm:flex-none">
                  {isAddingAsiento ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Agregar asiento
                </Button>
              </div>
            </form>
        </PanelCard>
      )}

      {/* Tabs: carátula / asientos */}
      <Tabs defaultValue="asientos">
        <TabsList>
          <TabsTrigger value="asientos">
            Asientos ({libroObraAsientos.length})
          </TabsTrigger>
          <TabsTrigger value="caratula">Carátula</TabsTrigger>
        </TabsList>

        {/* ── ASIENTOS ── */}
        <TabsContent value="asientos" className="space-y-3 mt-4">
          {/* Summary pills */}
          {libroObraAsientos.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-3">
              {[
                { label: 'Total', value: libroObraAsientos.length, color: 'text-foreground' },
                { label: 'Firmados', value: libroObraAsientos.filter(a => a.firmado).length, color: 'text-success' },
                { label: 'Sin firma', value: libroObraAsientos.filter(a => !a.firmado).length, color: 'text-warning' },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1.5 text-sm">
                  <span className="text-muted-foreground">{s.label}:</span>
                  <span className={cn('font-bold', s.color)}>{s.value}</span>
                </div>
              ))}
            </div>
          )}

          {libroObraAsientos.length > 0 ? (
            libroObraAsientos.map(asiento => (
              <AsientoCard
                key={asiento.id}
                asiento={asiento}
                canSign={canSign}
                onSign={setSignTarget}
              />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border bg-card p-16 text-center text-muted-foreground">
              <BookMarked className="mb-4 h-12 w-12 opacity-40" />
              <h3 className="text-lg font-bold tracking-tight">Sin asientos registrados</h3>
              <p className="mt-1 max-w-sm text-sm">
                Usa el botón "Nuevo asiento" para agregar el primer registro al Libro de Obra.
              </p>
            </div>
          )}
        </TabsContent>

        {/* ── CARÁTULA ── */}
        <TabsContent value="caratula" className="mt-4">
          <PanelCard
            title="Carátula del Libro de Obra"
            description={`Permiso N° ${libroObra.numeroPermiso}${libroObra.fechaPermiso ? ` — ${fmtDate(libroObra.fechaPermiso)}` : ''}`}
            icon={BookMarked}
          >
            <div className="space-y-6">
              {/* Identificación */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Identificación del Proyecto</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Proyecto:</span> <strong>{libroObra.nombreProyecto}</strong></div>
                  <div><span className="text-muted-foreground">Dirección:</span> {libroObra.direccionObra}, {libroObra.comunaObra}</div>
                  {libroObra.fechaInicioObra && <div><span className="text-muted-foreground">Inicio de obra:</span> {fmtDate(libroObra.fechaInicioObra)}</div>}
                  {libroObra.fechaEntregaTerreno && <div><span className="text-muted-foreground">Entrega de terreno:</span> {fmtDate(libroObra.fechaEntregaTerreno)}</div>}
                </div>
              </div>

              <div className="border-t border-border" />

              {/* Partes */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Partes Intervinientes</p>
                <div className="space-y-2 text-sm">
                  {[
                    { rol: 'Propietario', nombre: libroObra.nombrePropietario, rut: libroObra.rutPropietario },
                    { rol: 'Arquitecto', nombre: libroObra.nombreArquitecto, rut: libroObra.rutArquitecto },
                    { rol: 'Calculista', nombre: libroObra.nombreCalculista, rut: libroObra.rutCalculista },
                    { rol: 'Constructor', nombre: libroObra.nombreConstructor, rut: libroObra.rutConstructor },
                    { rol: 'ITO', nombre: libroObra.nombreITO, rut: libroObra.rutITO },
                    { rol: 'Revisor Independiente', nombre: libroObra.nombreRevisorIndependiente, rut: libroObra.rutRevisorIndependiente },
                  ].filter(p => p.nombre).map(p => (
                    <div key={p.rol} className="flex justify-between gap-4 border-b border-border pb-1.5 last:border-0">
                      <div>
                        <span className="block text-xs text-muted-foreground">{p.rol}</span>
                        <span className="font-medium">{p.nombre}</span>
                      </div>
                      {p.rut && <span className="self-end font-mono text-xs text-muted-foreground">{p.rut}</span>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <StatusBadge tone={libroObra.estado === 'vigente' ? 'success' : 'neutral'}>
                  Estado: {libroObra.estado === 'vigente' ? 'Vigente' : 'Cerrado'}
                </StatusBadge>
              </div>
            </div>
          </PanelCard>
        </TabsContent>
      </Tabs>

      {/* ── Dialog firma ──────────────────────────────────────────────────── */}
      <Dialog open={!!signTarget} onOpenChange={open => { if (!open) { setSignTarget(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Firmar Asiento N° {signTarget?.numero}</DialogTitle>
            <DialogDescription>
              Dibuja tu firma en el recuadro para validar digitalmente este asiento del Libro de Obra.
              Una vez firmado, el asiento no podrá modificarse.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Fondo blanco fijo: la firma se dibuja en tinta negra. */}
            <div className="h-40 w-full overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/30 bg-white">
              <SignaturePad ref={sigPadRef} penColor="black" />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Firmado como: <strong>{user?.name}</strong>
              {signTarget && ` — ${ROL_OPTIONS.find(r => r.value === signTarget.autorRol)?.label ?? signTarget.autorRol}`}
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => sigPadRef.current?.clear()}>
              Borrar
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSignTarget(null)} disabled={isSigning}>
              Cancelar
            </Button>
            <Button onClick={handleSign} disabled={isSigning}>
              {isSigning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pen className="mr-2 h-4 w-4" />}
              Confirmar firma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
