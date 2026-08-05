"use client";

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trash2, Send, FilePlus2, Download, Clock } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/date-utils';
import { openObraFile } from '@/lib/storage';
import { estadoRdi, diasParaResponder, diasDeRespuesta, PRIORIDADES_RDI } from '@/lib/rdi';
import { DISCIPLINAS } from '@/lib/documents';
import { siguienteNumeroAdicional } from '@/lib/amendment';
import { ESTADO_RDI, textoPlazo } from '@/components/operations/rdi-estado';
import { FileField, type ArchivoAdjunto } from '@/components/operations/file-field';

export default function DetalleRdiPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const {
    rdis, documents, workItems, amendments, contracts, users, currentProjectId,
    can, notify, answerRdi, setRdiStatus, deleteRdi, updateRdi, addAmendment,
  } = useAppState();

  const [respuesta, setRespuesta] = useState('');
  const [impactoCosto, setImpactoCosto] = useState(false);
  const [impactoPlazo, setImpactoPlazo] = useState(false);
  const [archivo, setArchivo] = useState<ArchivoAdjunto | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const rdi = useMemo(() => rdis.find((r) => r.id === id) ?? null, [rdis, id]);

  const documento = useMemo(
    () => (rdi?.documentId ? documents.find((d) => d.id === rdi.documentId) ?? null : null),
    [documents, rdi],
  );
  const partida = useMemo(
    () => (rdi?.workItemId ? workItems.find((w) => w.id === rdi.workItemId) ?? null : null),
    [workItems, rdi],
  );
  const adicional = useMemo(
    () => (rdi?.amendmentId ? amendments.find((a) => a.id === rdi.amendmentId) ?? null : null),
    [amendments, rdi],
  );
  const contrato = useMemo(
    () => contracts.find((c) => c.projectId === currentProjectId) ?? null,
    [contracts, currentProjectId],
  );

  if (!rdi) {
    return (
      <div className="space-y-6">
        <PageHeader title="RDI" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No se encontró el requerimiento.
        </CardContent></Card>
      </div>
    );
  }

  const estado = estadoRdi(rdi);
  const est = ESTADO_RDI[estado];
  const dias = diasParaResponder(rdi);
  const demora = diasDeRespuesta(rdi);
  const quienRespondio = rdi.answeredBy
    ? users.find((u) => u.id === rdi.answeredBy)?.name ?? null
    : null;

  const abrir = async (path: string) => {
    try {
      await openObraFile(path);
    } catch (e: any) {
      notify(e.message ?? 'No se pudo abrir el archivo.', 'destructive');
    }
  };

  const responder = async () => {
    if (!respuesta.trim()) {
      notify('Escribe la respuesta.', 'destructive');
      return;
    }
    setOcupado(true);
    try {
      await answerRdi(rdi.id, {
        answer: respuesta.trim(),
        impactCost: impactoCosto,
        impactTime: impactoPlazo,
        answerFilePath: archivo?.path ?? null,
        answerFileName: archivo?.name ?? null,
      });
      notify(
        impactoCosto || impactoPlazo
          ? 'Respuesta registrada. Declara impacto: genera el adicional para no perderlo.'
          : 'Respuesta registrada.',
        'success',
      );
      setRespuesta('');
      setArchivo(null);
    } catch (e: any) {
      notify(e.message ?? 'No se pudo registrar la respuesta.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const cambiarEstado = async (nuevo: typeof rdi.status) => {
    setOcupado(true);
    try {
      await setRdiStatus(rdi.id, nuevo);
      notify('RDI actualizada.', 'success');
    } catch (e: any) {
      notify(e.message ?? 'No se pudo cambiar el estado.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const borrar = async () => {
    setOcupado(true);
    try {
      await deleteRdi(rdi.id);
      notify('RDI eliminada.', 'success');
      router.push('/dashboard/oficina-tecnica/rdi');
    } catch (e: any) {
      notify(e.message ?? 'No se pudo eliminar.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  /**
   * Cierra el círculo de la Fase 4: la respuesta que reconoce obra extra se
   * convierte en un adicional en borrador, ya enlazado a esta RDI. Nace en
   * borrador y sin monto: valorizarlo es un trabajo aparte, pero al menos deja
   * de perderse.
   */
  const generarAdicional = async () => {
    if (!contrato) {
      notify('Esta obra no tiene contrato cargado: el adicional cuelga del contrato.', 'destructive');
      return;
    }
    setOcupado(true);
    try {
      const delContrato = amendments.filter((a) => a.contractId === contrato.id);
      const amendmentId = await addAmendment({
        contractId: contrato.id,
        projectId: rdi.projectId,
        number: siguienteNumeroAdicional(delContrato),
        name: `RDI N° ${rdi.number} · ${rdi.subject}`,
        type: rdi.impactCost ? 'obra_extraordinaria' : 'aumento_plazo',
        cause: 'modificacion_proyecto',
        description: [
          `Origen: RDI N° ${rdi.number}.`,
          `Consulta: ${rdi.question}`,
          rdi.answer ? `Respuesta: ${rdi.answer}` : null,
        ].filter(Boolean).join('\n\n'),
        currency: contrato.currency,
        status: 'borrador',
      });
      await updateRdi(rdi.id, { amendmentId });
      notify('Adicional creado en borrador desde la RDI.', 'success');
      router.push(`/dashboard/oficina-tecnica/adicionales/${amendmentId}`);
    } catch (e: any) {
      notify(e.message ?? 'No se pudo generar el adicional.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const declaraImpacto = rdi.impactCost || rdi.impactTime;
  const respondida = rdi.status === 'respondida' || rdi.status === 'cerrada';

  return (
    <div className="space-y-6">
      <PageHeader
        title={`RDI N° ${rdi.number}`}
        description={rdi.subject}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/oficina-tecnica/rdi">
              <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Volver</Button>
            </Link>
            {can('rdi:create') && rdi.status === 'abierta' && (
              <Button variant="outline" onClick={borrar} disabled={ocupado}>
                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge tone={est.tone}>{est.label}</StatusBadge>
        {rdi.status === 'abierta' && (
          <span className={`flex items-center gap-1.5 text-sm ${
            dias !== null && dias < 0 ? 'text-danger' : 'text-muted-foreground'
          }`}>
            <Clock className="h-4 w-4" />
            {textoPlazo(dias)}
            {rdi.dueDate ? ` · vence ${formatDate(rdi.dueDate)}` : ''}
          </span>
        )}
        {demora !== null && (
          <span className="text-sm text-muted-foreground">Respondida en {demora} días</span>
        )}
        {rdi.priority !== 'normal' && (
          <StatusBadge tone={rdi.priority === 'alta' ? 'warning' : 'neutral'}>
            Prioridad {PRIORIDADES_RDI[rdi.priority].toLowerCase()}
          </StatusBadge>
        )}
      </div>

      {/* La consulta */}
      <Card>
        <CardHeader><CardTitle className="text-base">Consulta</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="whitespace-pre-line text-sm text-foreground">{rdi.question}</p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Dato label="Dirigida a" value={rdi.askedTo ?? '—'} />
            <Dato label="Especialidad" value={DISCIPLINAS[rdi.discipline]} />
            <Dato label="Preguntada" value={rdi.askedAt ? formatDate(rdi.askedAt) : '—'} />
            <Dato label="Respuesta comprometida" value={rdi.dueDate ? formatDate(rdi.dueDate) : 'Sin plazo'} />
          </div>

          <div className="flex flex-wrap gap-4">
            {documento && (
              <Link
                href={`/dashboard/oficina-tecnica/planos/${documento.id}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                Plano: {documento.code ? `${documento.code} · ` : ''}{documento.name}
              </Link>
            )}
            {partida && (
              <span className="text-sm text-muted-foreground">Partida: {partida.name}</span>
            )}
            {rdi.filePath && (
              <Button variant="ghost" size="sm" onClick={() => abrir(rdi.filePath as string)}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> {rdi.fileName ?? 'Adjunto'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* La respuesta */}
      {respondida ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Respuesta</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="whitespace-pre-line text-sm text-foreground">{rdi.answer}</p>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span>
                {rdi.answeredAt ? formatDate(rdi.answeredAt) : '—'}
                {quienRespondio ? ` · ${quienRespondio}` : ''}
              </span>
              {rdi.answerFilePath && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => abrir(rdi.answerFilePath as string)}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" /> {rdi.answerFileName ?? 'Adjunto'}
                </Button>
              )}
            </div>

            {declaraImpacto && (
              <div className="space-y-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
                <div className="text-sm font-semibold text-foreground">
                  La respuesta declara {rdi.impactCost ? 'obra extra' : ''}
                  {rdi.impactCost && rdi.impactTime ? ' y ' : ''}
                  {rdi.impactTime ? 'mayor plazo' : ''}
                </div>
                {adicional ? (
                  <Link
                    href={`/dashboard/oficina-tecnica/adicionales/${adicional.id}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Adicional N° {adicional.number} · {adicional.name}
                  </Link>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Todavía no hay adicional asociado. Generarlo ahora deja el respaldo enlazado;
                      si se hace después, cuando la obra ya avanzó, es cuando se pierde.
                    </p>
                    {can('amendments:manage') && (
                      <Button onClick={generarAdicional} disabled={ocupado}>
                        <FilePlus2 className="mr-2 h-4 w-4" /> Generar adicional desde esta RDI
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}

            {rdi.status === 'respondida' && can('rdi:create') && (
              <Button variant="outline" onClick={() => cambiarEstado('cerrada')} disabled={ocupado}>
                Cerrar RDI
              </Button>
            )}
          </CardContent>
        </Card>
      ) : rdi.status === 'abierta' && can('rdi:answer') ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Registrar la respuesta</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              rows={5}
              value={respuesta}
              placeholder="Lo que respondió el proyectista o el mandante, tal cual."
              onChange={(e) => setRespuesta(e.target.value)}
            />

            <FileField
              label="Respaldo de la respuesta (opcional)"
              carpeta="rdi"
              value={archivo}
              onChange={setArchivo}
            />

            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">
                ¿La respuesta cambia el contrato?
              </Label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={impactoCosto}
                  onCheckedChange={(v) => setImpactoCosto(v === true)}
                />
                Implica obra extra (costo)
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={impactoPlazo}
                  onCheckedChange={(v) => setImpactoPlazo(v === true)}
                />
                Implica mayor plazo
              </label>
              <p className="text-xs text-muted-foreground">
                Marcar esto no crea el adicional solo: lo deja señalado para generarlo, porque
                cuánto y cómo se cobra es una decisión aparte.
              </p>
            </div>

            <Button onClick={responder} disabled={ocupado}>
              <Send className="mr-2 h-4 w-4" /> Registrar respuesta
            </Button>
          </CardContent>
        </Card>
      ) : rdi.status === 'abierta' ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Esta RDI está esperando respuesta. Registrarla requiere el permiso de responder
            requerimientos — quien pregunta no es quien contesta.
          </CardContent>
        </Card>
      ) : null}

      {rdi.notes && (
        <p className="text-sm text-muted-foreground">{rdi.notes}</p>
      )}
    </div>
  );
}

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}
