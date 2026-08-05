"use client";

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Download, Ban } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/date-utils';
import { formatFileSize, openObraFile } from '@/lib/storage';
import {
  revisionVigente, revisionesDe, revisionesOrdenadas, estadoRevision,
  DISCIPLINAS, TIPOS_DOCUMENTO,
} from '@/lib/documents';
import { FileField, type ArchivoAdjunto } from '@/components/operations/file-field';
import type { EstadoRevision } from '@/lib/documents';
import type { StatusTone } from '@/components/ui/status-badge';

const TONO_REVISION: Record<EstadoRevision, StatusTone> = {
  vigente: 'success',
  superada: 'neutral',
  anulada: 'danger',
};

const ETIQUETA_REVISION: Record<EstadoRevision, string> = {
  vigente: 'Vigente',
  superada: 'Superada',
  anulada: 'Anulada',
};

function hoyISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function DetallePlanoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const {
    documents, documentRevisions, rdis, can, notify,
    addDocumentRevision, updateDocumentRevision, deleteDocumentRevision, deleteDocument,
  } = useAppState();

  const [nueva, setNueva] = useState({
    revision: '', issueDate: hoyISO(), receivedAt: hoyISO(), notes: '',
  });
  const [archivo, setArchivo] = useState<ArchivoAdjunto | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const documento = useMemo(
    () => documents.find((d) => d.id === id) ?? null,
    [documents, id],
  );

  const propias = useMemo(
    () => (documento ? revisionesDe(documentRevisions, documento.id) : []),
    [documentRevisions, documento],
  );
  const vigente = useMemo(() => revisionVigente(propias), [propias]);
  const ordenadas = useMemo(() => revisionesOrdenadas(propias), [propias]);

  /** RDI que se hicieron sobre este documento: la trazabilidad del porqué. */
  const rdisDelPlano = useMemo(
    () => (documento ? rdis.filter((r) => r.documentId === documento.id) : []),
    [rdis, documento],
  );

  if (!documento) {
    return (
      <div className="space-y-6">
        <PageHeader title="Documento" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No se encontró el documento.
        </CardContent></Card>
      </div>
    );
  }

  const puedeEditar = can('documents:manage');

  const agregarRevision = async () => {
    if (!nueva.revision.trim()) {
      notify('Escribe el nombre de la revisión (A, B, 0, 1…).', 'destructive');
      return;
    }
    setOcupado(true);
    try {
      await addDocumentRevision({
        documentId: documento.id,
        revision: nueva.revision.trim(),
        issueDate: (nueva.issueDate || null) as never,
        receivedAt: (nueva.receivedAt || null) as never,
        notes: nueva.notes || null,
        filePath: archivo?.path ?? null,
        fileName: archivo?.name ?? null,
        fileSize: archivo?.size ?? null,
        mimeType: archivo?.mimeType ?? null,
      });
      notify('Revisión cargada. Ahora es la vigente si es la más nueva.', 'success');
      setNueva({ revision: '', issueDate: hoyISO(), receivedAt: hoyISO(), notes: '' });
      setArchivo(null);
    } catch (e: any) {
      notify(e.message ?? 'No se pudo cargar la revisión.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const anular = async (revId: string, anulada: boolean) => {
    setOcupado(true);
    try {
      await updateDocumentRevision(revId, { status: anulada ? 'activa' : 'anulada' });
      notify(anulada ? 'Revisión reactivada.' : 'Revisión anulada.', 'success');
    } catch (e: any) {
      notify(e.message ?? 'No se pudo cambiar la revisión.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const borrarRevision = async (revId: string, filePath: string | null | undefined) => {
    setOcupado(true);
    try {
      await deleteDocumentRevision(revId, filePath);
      notify('Revisión eliminada.', 'success');
    } catch (e: any) {
      notify(e.message ?? 'No se pudo eliminar.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const borrarDocumento = async () => {
    setOcupado(true);
    try {
      await deleteDocument(documento.id);
      notify('Documento eliminado.', 'success');
      router.push('/dashboard/oficina-tecnica/planos');
    } catch (e: any) {
      notify(e.message ?? 'No se pudo eliminar.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const abrir = async (path: string) => {
    try {
      await openObraFile(path);
    } catch (e: any) {
      notify(e.message ?? 'No se pudo abrir el archivo.', 'destructive');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={documento.code ? `${documento.code} · ${documento.name}` : documento.name}
        description={`${TIPOS_DOCUMENTO[documento.type]} · ${DISCIPLINAS[documento.discipline]}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/oficina-tecnica/planos">
              <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Volver</Button>
            </Link>
            {vigente?.filePath && (
              <Button variant="outline" onClick={() => abrir(vigente.filePath as string)}>
                <Download className="mr-2 h-4 w-4" /> Abrir vigente
              </Button>
            )}
            {puedeEditar && (
              <Button variant="outline" onClick={borrarDocumento} disabled={ocupado}>
                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
              </Button>
            )}
          </div>
        }
      />

      {/* Qué revisión manda */}
      <Card className={vigente ? undefined : 'border-warning/40'}>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-5">
          {vigente ? (
            <>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Revisión vigente
                </div>
                <div className="text-xl font-bold text-foreground">Rev. {vigente.revision}</div>
              </div>
              <div className="text-sm text-muted-foreground">
                Emitida {vigente.issueDate ? formatDate(vigente.issueDate) : 'sin fecha'}
                {vigente.receivedAt ? ` · recibida ${formatDate(vigente.receivedAt)}` : ''}
              </div>
              {!vigente.filePath && (
                <StatusBadge tone="danger">Sin archivo cargado</StatusBadge>
              )}
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              Este documento todavía no tiene ninguna revisión utilizable.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Nueva revisión */}
      {puedeEditar && (
        <Card>
          <CardHeader><CardTitle className="text-base">Cargar una revisión</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Revisión</Label>
                <Input
                  value={nueva.revision}
                  placeholder="A, B, 0, 1…"
                  onChange={(e) => setNueva((n) => ({ ...n, revision: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Fecha de emisión</Label>
                <Input
                  type="date"
                  value={nueva.issueDate}
                  onChange={(e) => setNueva((n) => ({ ...n, issueDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Recibida en obra</Label>
                <Input
                  type="date"
                  value={nueva.receivedAt}
                  onChange={(e) => setNueva((n) => ({ ...n, receivedAt: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Nota</Label>
                <Input
                  value={nueva.notes}
                  placeholder="Qué cambió"
                  onChange={(e) => setNueva((n) => ({ ...n, notes: e.target.value }))}
                />
              </div>
            </div>

            <FileField carpeta="planos" value={archivo} onChange={setArchivo} />

            <p className="text-xs text-muted-foreground">
              La vigente es la de fecha de emisión más nueva, no la que se cargue última: si sube
              una revisión antigua que faltaba, el plano vigente no cambia.
            </p>

            <Button onClick={agregarRevision} disabled={ocupado}>
              <Plus className="mr-2 h-4 w-4" /> Agregar revisión
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Historial */}
      <Card>
        <CardHeader><CardTitle className="text-base">Historial de revisiones</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {ordenadas.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Todavía no hay revisiones.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rev.</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Emitida</TableHead>
                  <TableHead>Recibida</TableHead>
                  <TableHead>Archivo</TableHead>
                  <TableHead>Nota</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordenadas.map((r) => {
                  const estado = estadoRevision(r, vigente);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.revision}</TableCell>
                      <TableCell>
                        <StatusBadge tone={TONO_REVISION[estado]}>
                          {ETIQUETA_REVISION[estado]}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.issueDate ? formatDate(r.issueDate) : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.receivedAt ? formatDate(r.receivedAt) : '—'}
                      </TableCell>
                      <TableCell>
                        {r.filePath ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => abrir(r.filePath as string)}
                          >
                            <Download className="mr-1.5 h-3.5 w-3.5" />
                            {formatFileSize(r.fileSize)}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sin archivo</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.notes ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        {puedeEditar && (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={ocupado}
                              onClick={() => anular(r.id, r.status === 'anulada')}
                            >
                              <Ban className="mr-1.5 h-3.5 w-3.5" />
                              {r.status === 'anulada' ? 'Reactivar' : 'Anular'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={ocupado}
                              onClick={() => borrarRevision(r.id, r.filePath)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Trazabilidad con las RDI */}
      {rdisDelPlano.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Consultas sobre este documento</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {rdisDelPlano.map((r) => (
              <Link
                key={r.id}
                href={`/dashboard/oficina-tecnica/rdi/${r.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 p-3 text-sm hover:border-primary/50"
              >
                <span className="font-medium text-foreground">RDI N° {r.number} · {r.subject}</span>
                <span className="text-muted-foreground">
                  {r.status === 'abierta' ? 'Sin responder' : 'Respondida'}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {documento.notes && (
        <p className="text-sm text-muted-foreground">{documento.notes}</p>
      )}

    </div>
  );
}
