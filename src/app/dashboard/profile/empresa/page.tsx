"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useAuth, useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { PanelCard } from '@/components/ui/panel-card';
import { SurfaceCard } from '@/components/ui/surface-card';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Building2, Save, Loader2, ShieldAlert, Info, UserCheck, Edit, Signature,
  Image as ImageIcon, Upload, Trash2, MapPin,
} from 'lucide-react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { getCompanyProfile, invalidateCompanyProfile, type CompanyProfile } from '@/lib/company-profile';
import SignaturePad from '@/components/signature-pad';

const PLAN_LABELS: Record<string, { label: string; tone: StatusTone }> = {
  basic: { label: 'Básico', tone: 'neutral' },
  pro: { label: 'Profesional', tone: 'info' },
  professional: { label: 'Profesional', tone: 'info' },
  enterprise: { label: 'Empresarial', tone: 'warning' },
};

/** Ancho máximo al que se reduce el logo antes de guardarlo. Se guarda como
 *  data URL dentro de la fila del tenant, así que no puede pesar megas: a
 *  512 px se ve nítido en el PDF (donde ocupa ~4 cm) y ronda los 100 KB. */
const LOGO_MAX_WIDTH = 512;
const LOGO_MAX_BYTES = 4 * 1024 * 1024;

/** Reduce la imagen en el navegador y la devuelve como data URL PNG. */
function resizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error('El archivo no es una imagen válida.'));
      img.onload = () => {
        const scale = Math.min(1, LOGO_MAX_WIDTH / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('No se pudo procesar la imagen.'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

type FormState = Pick<
  CompanyProfile,
  'name' | 'rut' | 'giro' | 'direccion' | 'comuna' | 'telefono' | 'email' | 'sitioWeb'
  | 'representanteLegal' | 'representanteRut' | 'representanteCargo'
>;

const EMPTY_FORM: FormState = {
  name: '', rut: '', giro: '', direccion: '', comuna: '',
  telefono: '', email: '', sitioWeb: '',
  representanteLegal: '', representanteRut: '', representanteCargo: '',
};

export default function EmpresaPage() {
  const { user } = useAuth();
  const { updateTenant } = useAppState();
  const { toast } = useToast();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [logo, setLogo] = useState<string | null>(null);
  const [representanteSignature, setRepresentanteSignature] = useState<string | null>(null);
  const [plan, setPlan] = useState<string>('');
  const [createdAt, setCreatedAt] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [savingEmpresa, setSavingEmpresa] = useState(false);
  const [savingRepresentante, setSavingRepresentante] = useState(false);
  const [savingSignature, setSavingSignature] = useState(false);
  const [savingLogo, setSavingLogo] = useState(false);
  const [isDrawingMode, setIsDrawingMode] = useState(false);

  const signaturePadRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canEdit = ['admin', 'operations', 'soporte', 'super-admin'].includes(user?.role ?? '');

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  useEffect(() => {
    if (!user?.tenantId) return;
    let cancelled = false;
    getCompanyProfile(user.tenantId).then(profile => {
      if (cancelled) return;
      setForm({
        name: profile.name,
        rut: profile.rut,
        giro: profile.giro,
        direccion: profile.direccion,
        comuna: profile.comuna,
        telefono: profile.telefono,
        email: profile.email,
        sitioWeb: profile.sitioWeb,
        representanteLegal: profile.representanteLegal,
        representanteRut: profile.representanteRut,
        representanteCargo: profile.representanteCargo,
      });
      setLogo(profile.logo);
      setRepresentanteSignature(profile.representanteSignature);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [user?.tenantId]);

  // Los datos del plan no van en el perfil de empresa; se leen aparte.
  useEffect(() => {
    if (!user?.tenantId) return;
    import('@/modules/core/lib/supabase').then(({ getSupabaseBrowserClient }) => {
      getSupabaseBrowserClient()
        .from('tenants')
        .select('plan, createdAt')
        .eq('id', user.tenantId!)
        .single()
        .then(({ data }: { data: any }) => {
          if (!data) return;
          setPlan(data.plan ?? '');
          setCreatedAt(
            data.createdAt
              ? new Date(data.createdAt).toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })
              : ''
          );
        });
    });
  }, [user?.tenantId]);

  /** Guarda en la tabla y refresca la caché que usan los PDF. */
  const persist = async (data: Record<string, unknown>) => {
    if (!user?.tenantId) throw new Error('Sin empresa asignada.');
    await updateTenant(user.tenantId, data);
    invalidateCompanyProfile();
  };

  const handleSaveEmpresa = async () => {
    if (!canEdit) return;
    if (!form.name.trim()) {
      toast({ variant: 'destructive', title: 'Campo requerido', description: 'La razón social no puede estar vacía.' });
      return;
    }
    setSavingEmpresa(true);
    try {
      await persist({
        name: form.name.trim(),
        rut: form.rut.trim(),
        giro: form.giro.trim(),
        direccion: form.direccion.trim(),
        comuna: form.comuna.trim(),
        telefono: form.telefono.trim(),
        email: form.email.trim(),
        sitioWeb: form.sitioWeb.trim(),
      });
      toast({ title: 'Empresa actualizada', description: 'Los datos aparecerán en los próximos documentos que generes.' });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron guardar los cambios.' });
    } finally {
      setSavingEmpresa(false);
    }
  };

  const handleSaveRepresentante = async () => {
    if (!canEdit) return;
    if (!form.representanteLegal.trim()) {
      toast({ variant: 'destructive', title: 'Campo requerido', description: 'El nombre del representante legal es requerido.' });
      return;
    }
    setSavingRepresentante(true);
    try {
      await persist({
        representanteLegal: form.representanteLegal.trim(),
        representanteRut: form.representanteRut.trim(),
        representanteCargo: form.representanteCargo.trim(),
      });
      toast({ title: 'Representante actualizado', description: 'Los datos del representante legal han sido guardados.' });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron guardar los cambios.' });
    } finally {
      setSavingRepresentante(false);
    }
  };

  const handleLogoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo
    if (!file || !canEdit) return;

    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Formato no válido', description: 'Elige una imagen (PNG, JPG o WEBP).' });
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      toast({ variant: 'destructive', title: 'Imagen muy pesada', description: 'El archivo no puede superar los 4 MB.' });
      return;
    }

    setSavingLogo(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      await persist({ logo: dataUrl });
      setLogo(dataUrl);
      toast({ title: 'Logo guardado', description: 'Ya aparece en los documentos que generes desde ahora.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err?.message ?? 'No se pudo guardar el logo.' });
    } finally {
      setSavingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!canEdit) return;
    setSavingLogo(true);
    try {
      await persist({ logo: null });
      setLogo(null);
      toast({ title: 'Logo eliminado', description: 'Los documentos saldrán sin logo hasta que cargues uno nuevo.' });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar el logo.' });
    } finally {
      setSavingLogo(false);
    }
  };

  const handleSaveSignature = async () => {
    if (!signaturePadRef.current || !canEdit) return;
    const dataUrl = signaturePadRef.current.getTrimmedCanvas().toDataURL('image/png');
    if (!dataUrl || dataUrl.length < 100) {
      toast({ variant: 'destructive', title: 'Firma vacía', description: 'Por favor, dibuja la firma antes de guardar.' });
      return;
    }
    setSavingSignature(true);
    try {
      await persist({ representanteSignature: dataUrl });
      setRepresentanteSignature(dataUrl);
      setIsDrawingMode(false);
      toast({ title: 'Firma guardada', description: 'La firma del representante legal ha sido actualizada.' });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar la firma.' });
    } finally {
      setSavingSignature(false);
    }
  };

  const handleEditSignature = () => {
    setIsDrawingMode(true);
    setTimeout(() => signaturePadRef.current?.clear(), 50);
  };

  if (!canEdit) {
    return (
      <div className="flex flex-col gap-6 pb-10">
        <PageHeader title="Mi Empresa" description="Información de la empresa." />
        <div className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger-subtle p-4 text-danger">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Acceso restringido</p>
            <p className="text-sm">Solo el administrador de la empresa puede gestionar estos datos.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        title="Mi Empresa"
        description="Estos datos y tu logo se estampan en todos los documentos que genera la plataforma."
      />

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">

            {/* Logo */}
            <PanelCard
              title="Logo de la empresa"
              description="Aparece en la cabecera de órdenes de compra, checklists, estados de pago y liquidaciones."
              icon={ImageIcon}
              actions={
                logo ? (
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={handleRemoveLogo} disabled={savingLogo}>
                    <Trash2 className="mr-2 h-4 w-4" /> Quitar
                  </Button>
                ) : undefined
              }
            >
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                {/* Fondo blanco fijo: es la previsualización de cómo se verá sobre el papel. */}
                <div className="flex h-28 w-full shrink-0 items-center justify-center rounded-xl border border-border bg-white p-3 sm:w-56">
                  {logo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={logo} alt="Logo de la empresa" className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-xs text-zinc-400">Sin logo cargado</span>
                  )}
                </div>
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleLogoSelected}
                  />
                  <Button onClick={() => fileInputRef.current?.click()} disabled={savingLogo}>
                    {savingLogo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    {logo ? 'Cambiar logo' : 'Subir logo'}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG o WEBP, hasta 4 MB. Se reduce automáticamente; si tiene fondo transparente, mejor.
                  </p>
                </div>
              </div>
            </PanelCard>

            {/* Datos de la empresa */}
            <PanelCard
              title="Identificación de la empresa"
              description="Razón social, RUT y datos de contacto para la cabecera de los documentos."
              icon={Building2}
              footer={
                <Button onClick={handleSaveEmpresa} disabled={savingEmpresa}>
                  {savingEmpresa ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Guardar datos de empresa
                </Button>
              }
            >
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field id="name" label="Razón social" value={form.name} onChange={set('name')} placeholder="Ej: Constructora ACME Ltda." />
                  <Field id="rut" label="RUT de la empresa" value={form.rut} onChange={set('rut')} placeholder="Ej: 76.040.151-K" />
                </div>
                <Field id="giro" label="Giro comercial" value={form.giro} onChange={set('giro')} placeholder="Ej: Construcción de edificios" />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field id="direccion" label="Dirección" value={form.direccion} onChange={set('direccion')} placeholder="Ej: Tucapel 578" />
                  <Field id="comuna" label="Comuna" value={form.comuna} onChange={set('comuna')} placeholder="Ej: Los Ángeles" />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field id="telefono" label="Teléfono" value={form.telefono} onChange={set('telefono')} placeholder="Ej: +56 9 1234 5678" />
                  <Field id="email" label="Email de contacto" value={form.email} onChange={set('email')} placeholder="Ej: contacto@acme.cl" />
                </div>
                <Field id="sitioWeb" label="Sitio web" value={form.sitioWeb} onChange={set('sitioWeb')} placeholder="Ej: www.acme.cl" />

                <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-xs text-muted-foreground">
                    Los campos que dejes vacíos simplemente no se imprimen; el documento no queda con espacios en blanco.
                  </p>
                </div>
              </div>
            </PanelCard>

            {/* Representante legal */}
            <PanelCard
              title="Representante legal"
              description="Quien firma contratos, finiquitos y liquidaciones en nombre de la empresa."
              icon={UserCheck}
              footer={
                <Button onClick={handleSaveRepresentante} disabled={savingRepresentante}>
                  {savingRepresentante ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Guardar representante legal
                </Button>
              }
            >
              <div className="space-y-5">
                <Field
                  id="rep-name" label="Nombre completo"
                  value={form.representanteLegal} onChange={set('representanteLegal')}
                  placeholder="Ej: Juan Antonio Pérez González"
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field id="rep-rut" label="RUT del representante" value={form.representanteRut} onChange={set('representanteRut')} placeholder="Ej: 12.345.678-9" />
                  <Field id="rep-cargo" label="Cargo" value={form.representanteCargo} onChange={set('representanteCargo')} placeholder="Ej: Gerente General" />
                </div>
                <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-subtle p-3">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <p className="text-xs text-warning">
                    El nombre y RUT del representante aparecen en finiquitos y liquidaciones como la persona que firma en representación de la empresa.
                  </p>
                </div>
              </div>
            </PanelCard>

            {/* Firma del representante legal */}
            <PanelCard
              title="Firma del representante legal"
              description="Se estampa en contratos, finiquitos y liquidaciones de sueldo."
              icon={Signature}
              actions={
                representanteSignature && !isDrawingMode ? (
                  <Button size="sm" variant="outline" onClick={handleEditSignature}>
                    <Edit className="mr-2 h-4 w-4" /> Cambiar firma
                  </Button>
                ) : undefined
              }
            >
              <div className="space-y-4">
                {representanteSignature && !isDrawingMode ? (
                  <>
                    {/* Fondo blanco fijo: la firma se dibuja en tinta negra. */}
                    <div className="flex h-48 w-full items-center justify-center rounded-xl border border-border bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={representanteSignature} alt="Firma del representante legal" className="h-full w-full object-contain p-3" />
                    </div>
                    <div className="flex items-center gap-2 rounded-xl border border-success/25 bg-success-subtle p-2">
                      <Save className="h-4 w-4 shrink-0 text-success" />
                      <p className="text-xs text-success">Firma registrada. Usa «Cambiar firma» para actualizarla.</p>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {isDrawingMode ? 'Dibuja la nueva firma en el recuadro:' : 'Dibuja la firma del representante legal en el recuadro:'}
                    </p>
                    <div className="h-48 w-full overflow-hidden rounded-xl border-2 border-dashed border-muted-foreground/30 bg-white">
                      <SignaturePad ref={signaturePadRef} />
                    </div>
                    <div className="flex gap-2">
                      {isDrawingMode && (
                        <Button variant="ghost" onClick={() => { setIsDrawingMode(false); signaturePadRef.current?.clear(); }} disabled={savingSignature}>
                          Cancelar
                        </Button>
                      )}
                      <Button onClick={handleSaveSignature} disabled={savingSignature} className="flex-1">
                        {savingSignature ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Guardar firma
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </PanelCard>
          </div>

          {/* Columna lateral */}
          <div className="space-y-4">
            <PanelCard title="Plan de suscripción" description="Tu plan actual en la plataforma." icon={Building2}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Plan activo</span>
                  {plan ? (
                    <StatusBadge tone={PLAN_LABELS[plan]?.tone ?? 'neutral'}>
                      {PLAN_LABELS[plan]?.label ?? plan}
                    </StatusBadge>
                  ) : (
                    <span className="text-sm italic text-muted-foreground">No especificado</span>
                  )}
                </div>
                {createdAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Miembro desde</span>
                    <span className="text-sm font-medium">{createdAt}</span>
                  </div>
                )}
                <p className="pt-1 text-xs text-muted-foreground">
                  Para cambiar tu plan, contacta al soporte de la plataforma.
                </p>
              </div>
            </PanelCard>

            {/* Vista previa de la cabecera que verá el cliente en los PDF */}
            <SurfaceCard interactive={false} className="p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Así se verá en tus documentos
              </p>
              {/* Fondo blanco fijo: simula la hoja impresa. */}
              <div className="rounded-xl border border-border bg-white p-4">
                <div className="flex items-start gap-3">
                  {logo && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={logo} alt="" className="h-10 w-16 shrink-0 object-contain" />
                  )}
                  <div className="min-w-0 text-[11px] leading-snug text-zinc-800">
                    <p className="truncate font-bold">{form.name || 'Razón social'}</p>
                    {form.rut && <p className="truncate">RUT: {form.rut}</p>}
                    {[form.direccion, form.comuna].filter(Boolean).length > 0 && (
                      <p className="truncate">{[form.direccion, form.comuna].filter(Boolean).join(', ')}</p>
                    )}
                    {[form.telefono, form.email].filter(Boolean).length > 0 && (
                      <p className="truncate">{[form.telefono, form.email].filter(Boolean).join(' · ')}</p>
                    )}
                  </div>
                </div>
              </div>
              <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
                <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                Los cambios se aplican a los documentos que generes después de guardar.
              </p>
            </SurfaceCard>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  id, label, value, onChange, placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  );
}
