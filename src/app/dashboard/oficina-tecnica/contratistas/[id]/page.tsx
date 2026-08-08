"use client";

/**
 * Expediente de UN contratista: una fila por cada papel que la empresa exige,
 * esté cargado o no. Lo que falta es tan importante como lo que hay, así que
 * se recorren los TIPOS y no los documentos.
 */

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Check, Download, FileUp, Paperclip, X,
} from 'lucide-react';
import { useAppState, useAuth } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { PlanLocked } from '@/components/plan-locked';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/modules/core/hooks/use-toast';
import { formatDate } from '@/lib/date-utils';
import { formatFileSize, openObraFile, uploadObraFile } from '@/lib/storage';
import { isDemoMode } from '@/modules/core/lib/demo/demo-config';
import {
  ESTADO_DOCUMENTO_LABEL, ESTADO_DOCUMENTO_TONO,
  ESTADO_ENROLAMIENTO_LABEL, ESTADO_ENROLAMIENTO_TONO,
  expedienteDe, puedeContratarse, type LineaExpediente,
} from '@/lib/contractor-file';

export default function ExpedienteContratistaPage() {
  const { id } = useParams<{ id: string }>();
  const {
    suppliers, contractorDocumentTypes, contractorDocuments, users,
    can, lockedFeature, updateSupplier,
  } = useAppState();

  const [cargando, setCargando] = useState<LineaExpediente | null>(null);
  const [revisando, setRevisando] = useState<LineaExpediente | null>(null);

  const contratista = useMemo(
    () => suppliers.find((s) => s.id === id) ?? null,
    [suppliers, id],
  );

  const exp = useMemo(
    () => expedienteDe(id, contractorDocumentTypes, contractorDocuments),
    [id, contractorDocumentTypes, contractorDocuments],
  );

  const puerta = useMemo(() => puedeContratarse(exp), [exp]);

  if (lockedFeature('contractors:view')) {
    return <PlanLocked feature="subcontracts" title="Contratistas" />;
  }
  if (!contratista) {
    return (
      <div className="space-y-6">
        <PageHeader title="Contratista" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No se encontró el contratista.
        </CardContent></Card>
      </div>
    );
  }

  const editable = can('contractors:manage');
  const nombreDe = (uid?: string | null) => users.find((u) => u.id === uid)?.name ?? '—';

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/oficina-tecnica/contratistas"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Contratistas
      </Link>

      <PageHeader
        title={contratista.name}
        description={[contratista.rut, contratista.representativeName]
          .filter(Boolean).join(' · ') || 'Sin datos de identificación'}
        actions={
          <StatusBadge tone={ESTADO_ENROLAMIENTO_TONO[exp.estado]}>
            {ESTADO_ENROLAMIENTO_LABEL[exp.estado]}
          </StatusBadge>
        }
      />

      {/* La puerta: se le puede firmar contrato o no, y por qué */}
      <Card className={puerta.puede ? 'border-success/40' : 'border-warning/40'}>
        <CardContent className="space-y-2 p-5 text-sm">
          <div className="font-medium text-foreground">
            {puerta.puede
              ? 'Enrolado: se le puede firmar un contrato.'
              : 'Todavía no se le puede firmar un contrato.'}
          </div>
          {puerta.motivo && <p className="text-muted-foreground">{puerta.motivo}</p>}
          <div className="pt-1 text-xs text-muted-foreground">
            Expediente al {exp.avance}% de los documentos obligatorios.
          </div>
        </CardContent>
      </Card>

      {/* Datos de la empresa, los que hacen falta para redactar el contrato */}
      {editable && (
        <Card>
          <CardHeader><CardTitle className="text-base">Datos para el contrato</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <CampoEmpresa
              label="Razón social" valor={contratista.legalName}
              onGuardar={(v) => updateSupplier(contratista.id, { legalName: v } as never)}
            />
            <CampoEmpresa
              label="Giro" valor={contratista.giro}
              onGuardar={(v) => updateSupplier(contratista.id, { giro: v } as never)}
            />
            <CampoEmpresa
              label="Representante legal" valor={contratista.representativeName}
              onGuardar={(v) => updateSupplier(contratista.id, { representativeName: v } as never)}
            />
            <CampoEmpresa
              label="RUT del representante" valor={contratista.representativeRut}
              onGuardar={(v) => updateSupplier(contratista.id, { representativeRut: v } as never)}
            />
          </CardContent>
        </Card>
      )}

      {/* El expediente */}
      <Card>
        <CardHeader><CardTitle className="text-base">Documentos</CardTitle></CardHeader>
        <CardContent className="p-0">
          {exp.lineas.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              Esta empresa todavía no definió qué documentos exige. Se configura en
              Contratistas → «Documentos exigidos».
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {exp.lineas.map((linea) => (
                <li key={linea.tipo.id} className="flex flex-wrap items-start gap-3 p-4 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{linea.tipo.name}</span>
                      {!linea.tipo.required && (
                        <span className="text-xs text-muted-foreground">(opcional)</span>
                      )}
                    </div>

                    {linea.documento ? (
                      <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                        <div>
                          {linea.documento.number ? `N° ${linea.documento.number} · ` : ''}
                          {linea.documento.issueDate
                            ? `Emitido ${formatDate(linea.documento.issueDate)}` : 'Sin fecha de emisión'}
                          {linea.tipo.hasExpiry && linea.documento.expiryDate
                            ? ` · Vence ${formatDate(linea.documento.expiryDate)}` : ''}
                        </div>
                        {linea.documento.filePath && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                            onClick={() => openObraFile(linea.documento!.filePath!)}
                          >
                            <Paperclip className="h-3 w-3" />
                            {linea.documento.fileName}
                            {linea.documento.fileSize
                              ? ` (${formatFileSize(linea.documento.fileSize)})` : ''}
                          </button>
                        )}
                        {linea.documento.status === 'observado' && linea.documento.observations && (
                          <p className="text-danger">
                            Observado: {linea.documento.observations}
                          </p>
                        )}
                        {linea.documento.status === 'aprobado' && linea.documento.reviewedAt && (
                          <div>
                            Aprobado por {nombreDe(linea.documento.reviewedBy)} el{' '}
                            {formatDate(linea.documento.reviewedAt)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {linea.tipo.description ?? 'Sin cargar.'}
                      </p>
                    )}
                  </div>

                  <StatusBadge tone={ESTADO_DOCUMENTO_TONO[linea.estado]}>
                    {ESTADO_DOCUMENTO_LABEL[linea.estado]}
                    {linea.estado === 'por_vencer' && linea.diasParaVencer !== null
                      ? ` (${linea.diasParaVencer}d)` : ''}
                  </StatusBadge>

                  {editable && (
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" onClick={() => setCargando(linea)}>
                        <FileUp className="mr-1 h-3.5 w-3.5" />
                        {linea.documento ? 'Reemplazar' : 'Cargar'}
                      </Button>
                      {linea.documento && linea.documento.status !== 'aprobado' && (
                        <Button size="sm" onClick={() => setRevisando(linea)}>
                          Revisar
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {cargando && (
        <DialogoCargar
          supplierId={contratista.id}
          linea={cargando}
          onCerrar={() => setCargando(null)}
        />
      )}
      {revisando && (
        <DialogoRevisar linea={revisando} onCerrar={() => setRevisando(null)} />
      )}
    </div>
  );
}

/* ── Campo editable de la ficha ────────────────────────────────────────── */

function CampoEmpresa({
  label, valor, onGuardar,
}: {
  label: string;
  valor?: string | null;
  onGuardar: (v: string | null) => Promise<void> | void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        defaultValue={valor ?? ''}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v !== (valor ?? '')) onGuardar(v || null);
        }}
      />
    </div>
  );
}

/* ── Cargar o reemplazar un papel ──────────────────────────────────────── */

function DialogoCargar({
  supplierId, linea, onCerrar,
}: {
  supplierId: string;
  linea: LineaExpediente;
  onCerrar: () => void;
}) {
  const { upsertContractorDocument } = useAppState();
  const { getTenantId } = useAuth();
  const { toast } = useToast();

  const [numero, setNumero] = useState(linea.documento?.number ?? '');
  const [emision, setEmision] = useState(fechaInput(linea.documento?.issueDate));
  const [vencimiento, setVencimiento] = useState(fechaInput(linea.documento?.expiryDate));
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const demo = isDemoMode();

  async function guardar() {
    if (linea.tipo.hasExpiry && !vencimiento) {
      toast({
        variant: 'destructive',
        title: 'Falta el vencimiento',
        description: 'Este documento caduca: sin la fecha no se puede controlar.',
      });
      return;
    }

    setOcupado(true);
    try {
      let subido: { path: string; fileName: string; fileSize: number } | null = null;
      if (archivo) {
        const tenantId = getTenantId();
        // La ruta TIENE que empezar por el tenant: la RLS del bucket compara
        // esa primera carpeta con la empresa de quien sube.
        if (!tenantId) throw new Error('No se pudo determinar la empresa.');
        subido = await uploadObraFile(archivo, {
          tenantId,
          projectId: null,
          carpeta: `contratistas/${supplierId}`,
        });
      }

      await upsertContractorDocument({
        supplierId,
        documentTypeId: linea.tipo.id,
        number: numero.trim() || null,
        issueDate: (emision || null) as never,
        expiryDate: (vencimiento || null) as never,
        ...(subido
          ? { filePath: subido.path, fileName: subido.fileName, fileSize: subido.fileSize }
          : {}),
        status: 'en_revision',
      });

      toast({ title: 'Documento cargado', description: 'Queda esperando el visto bueno de oficina central.' });
      onCerrar();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo cargar', description: e.message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{linea.tipo.name}</DialogTitle>
          <DialogDescription>
            {linea.documento
              ? 'El documento nuevo reemplaza al anterior y vuelve a revisión.'
              : 'Carga el papel y sus fechas. Después oficina central lo revisa.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="doc-numero">N° o folio (opcional)</Label>
            <Input id="doc-numero" value={numero} onChange={(e) => setNumero(e.target.value)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="doc-emision">Emisión</Label>
              <Input id="doc-emision" type="date" value={emision}
                onChange={(e) => setEmision(e.target.value)} />
            </div>
            {linea.tipo.hasExpiry && (
              <div className="space-y-2">
                <Label htmlFor="doc-vence">Vencimiento</Label>
                <Input id="doc-vence" type="date" value={vencimiento}
                  onChange={(e) => setVencimiento(e.target.value)} />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-archivo">Archivo</Label>
            <Input
              id="doc-archivo" type="file" disabled={demo}
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">
              {demo
                ? 'El modo demo funciona sobre el navegador, sin servidor: puedes registrar el documento y sus fechas, pero sin adjuntar el archivo.'
                : 'PDF o imagen, hasta 25 MB.'}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={ocupado}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Revisión de oficina central ───────────────────────────────────────── */

function DialogoRevisar({
  linea, onCerrar,
}: {
  linea: LineaExpediente;
  onCerrar: () => void;
}) {
  const { reviewContractorDocument } = useAppState();
  const { toast } = useToast();
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function revisar(status: 'aprobado' | 'observado') {
    if (status === 'observado' && !motivo.trim()) {
      toast({ variant: 'destructive', title: 'Falta el motivo', description: 'Sin él, el contratista no sabe qué corregir.' });
      return;
    }
    setOcupado(true);
    try {
      await reviewContractorDocument(linea.documento!.id, { status, observations: motivo });
      onCerrar();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo revisar', description: e.message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Revisar «{linea.tipo.name}»</DialogTitle>
          <DialogDescription>
            Aprobarlo lo suma al expediente. Observarlo lo devuelve, y el motivo se
            muestra en la carpeta del contratista.
          </DialogDescription>
        </DialogHeader>

        {linea.documento?.filePath && (
          <Button
            variant="outline"
            onClick={() => openObraFile(linea.documento!.filePath!)}
          >
            <Download className="mr-2 h-4 w-4" /> Ver el archivo
          </Button>
        )}

        <Textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Qué está mal (obligatorio solo si lo observas)"
          rows={3}
        />

        <DialogFooter>
          <Button
            variant="outline" disabled={ocupado || !motivo.trim()}
            onClick={() => revisar('observado')}
          >
            <X className="mr-2 h-4 w-4" /> Observar
          </Button>
          <Button disabled={ocupado} onClick={() => revisar('aprobado')}>
            <Check className="mr-2 h-4 w-4" /> Aprobar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** `YYYY-MM-DD` para un `<input type="date">`, sin pasar por UTC. */
function fechaInput(v: Date | string | null | undefined): string {
  if (!v) return '';
  if (typeof v === 'string') return v.slice(0, 10);
  const mm = String(v.getMonth() + 1).padStart(2, '0');
  const dd = String(v.getDate()).padStart(2, '0');
  return `${v.getFullYear()}-${mm}-${dd}`;
}
