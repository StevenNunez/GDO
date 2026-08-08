"use client";

/**
 * Licitación y firma del contrato de subcontrato (migración 032).
 *
 * Tres cosas en una tarjeta, porque en la práctica son un solo momento:
 *  1. las cotizaciones recibidas y el cuadro comparativo, que se CALCULA;
 *  2. la adjudicación, que exige justificar si no se elige la más barata;
 *  3. la firma de las dos partes sobre el documento del contrato.
 *
 * El cuadro no se adjunta como imagen: se arma de las ofertas cargadas. Un
 * comparativo escaneado sirve para archivar, pero no se le puede preguntar
 * nada seis meses después.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award, FileSignature, FileText, Paperclip, PenLine, Plus, Trash2, TrendingDown,
} from 'lucide-react';
import { useAppState, useAuth } from '@/modules/core/contexts/app-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import SignaturePad from '@/components/signature-pad';
import { useToast } from '@/modules/core/hooks/use-toast';
import { formatCLP } from '@/lib/format';
import { formatDate } from '@/lib/date-utils';
import { formatFileSize, openObraFile, uploadObraFile } from '@/lib/storage';
import { isDemoMode } from '@/modules/core/lib/demo/demo-config';
import { huellaDocumento } from '@/lib/approval';
import {
  PARTE_LABEL, ahorroVsReferencia, cuadroComparativo, estadoFirmas,
  puedeFirmarse, type ParteFirmante,
} from '@/lib/tender';
import { generateSubcontratoContratoPDF } from '@/lib/subcontrato-contrato-pdf';
import { EnviarDocumento } from '@/components/enviar-documento';
import type { Subcontract, SubcontractItem } from '@/modules/core/lib/data';

interface Props {
  subcontract: Subcontract;
  items: SubcontractItem[];
  /** Presupuesto meta de la partida, si existe: contexto para el cuadro. */
  referencia?: number | null;
  /** ¿Ya pasó la cadena de aprobación interna? Puerta previa a la firma. */
  aprobadoInternamente: boolean;
  editable: boolean;
  projectName?: string | null;
}

export function LicitacionPanel({
  subcontract: sc, items, referencia, aprobadoInternamente, editable, projectName,
}: Props) {
  const {
    subcontractQuotes, subcontractAttachments, documentSignatures, suppliers,
    deleteSubcontractQuote, addSubcontractAttachment, deleteSubcontractAttachment,
  } = useAppState();
  const { getTenantId } = useAuth();
  const { toast } = useToast();

  const [nuevaOferta, setNuevaOferta] = useState(false);
  const [adjudicando, setAdjudicando] = useState<string | null>(null);
  const [firmando, setFirmando] = useState<ParteFirmante | null>(null);
  const [huella, setHuella] = useState<string | null>(null);

  const ofertas = useMemo(
    () => subcontractQuotes.filter((q) => q.subcontractId === sc.id),
    [subcontractQuotes, sc.id],
  );

  const adjuntos = useMemo(
    () => subcontractAttachments.filter((a) => a.subcontractId === sc.id),
    [subcontractAttachments, sc.id],
  );

  const cuadro = useMemo(
    () => cuadroComparativo(ofertas, { moneda: sc.currency, referencia }),
    [ofertas, sc.currency, referencia],
  );

  const ahorro = useMemo(
    () => ahorroVsReferencia(cuadro.adjudicada, referencia),
    [cuadro.adjudicada, referencia],
  );

  /**
   * Lo que sella la firma: si cambia el monto o el plazo después de firmado,
   * la huella deja de calzar y la pantalla lo denuncia.
   */
  const camposSellados = useMemo(() => ({
    codigo: sc.code ?? '',
    nombre: sc.name,
    contratista: sc.supplierId ?? sc.supplierName ?? '',
    monto: sc.amountNet,
    moneda: sc.currency,
    anticipo: sc.advancePercent,
    retencion: sc.retentionPercent,
    plazoDias: sc.plazoDias ?? 0,
    multa: sc.multaValue,
    inicio: sc.startDate ?? null,
  }), [sc]);

  useEffect(() => {
    let vivo = true;
    huellaDocumento(camposSellados)
      .then((h) => { if (vivo) setHuella(h); })
      .catch(() => { if (vivo) setHuella(null); });
    return () => { vivo = false; };
  }, [camposSellados]);

  const firmas = useMemo(
    () => estadoFirmas(documentSignatures, 'subcontract', sc.id, huella),
    [documentSignatures, sc.id, huella],
  );

  const puerta = useMemo(
    () => puedeFirmarse(sc, { tieneItemizado: items.length > 0, aprobadoInternamente }),
    [sc, items.length, aprobadoInternamente],
  );

  async function descargarContrato() {
    try {
      await generateSubcontratoContratoPDF({
        subcontract: sc,
        items,
        contractor: suppliers.find((s) => s.id === sc.supplierId) ?? null,
        signatures: documentSignatures.filter(
          (f) => f.documentType === 'subcontract' && f.documentId === sc.id,
        ),
        projectName,
      });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo generar', description: e.message });
    }
  }

  async function subirAdjunto(file: File, kind: 'cuadro_comparativo' | 'contrato' | 'anexo') {
    const tenantId = getTenantId();
    if (!tenantId) return;
    try {
      const subido = await uploadObraFile(file, {
        tenantId, projectId: sc.projectId, carpeta: `subcontratos/${sc.id}`,
      });
      await addSubcontractAttachment({
        subcontractId: sc.id, kind, name: file.name,
        filePath: subido.path, fileName: subido.fileName, fileSize: subido.fileSize,
      });
      toast({ title: 'Archivo adjuntado' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo adjuntar', description: e.message });
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">Licitación y firma</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={descargarContrato}>
            <FileText className="mr-2 h-4 w-4" /> Documento del contrato
          </Button>
          <EnviarDocumento
            fileName={`Contrato_${(sc.code || sc.name).replace(/[^\w-]+/g, '_')}.pdf`}
            asuntoSugerido={`Contrato ${sc.code ? `N° ${sc.code}` : ''} · ${sc.name}`.replace(/\s+/g, ' ')}
            destinatarioSugerido={suppliers.find((s) => s.id === sc.supplierId)?.email ?? null}
            descripcionDestinatario="el contratista"
            mensajeSugerido={'Estimados: adjuntamos el contrato para su revisión y firma.'}
            generarPdf={() => generateSubcontratoContratoPDF({
              subcontract: sc,
              items,
              contractor: suppliers.find((s) => s.id === sc.supplierId) ?? null,
              signatures: documentSignatures.filter(
                (f) => f.documentType === 'subcontract' && f.documentId === sc.id,
              ),
              projectName,
              salida: 'blob',
            })}
          />
          {editable && (
            <Button size="sm" variant="outline" onClick={() => setNuevaOferta(true)}>
              <Plus className="mr-2 h-4 w-4" /> Cotización
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ── Cuadro comparativo ─────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-foreground">Cuadro comparativo</div>

          {cuadro.lineas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay cotizaciones cargadas. El cuadro se arma solo con las ofertas
              que registres; no hace falta adjuntarlo como imagen.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Oferente</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-right">Dif. vs. menor</TableHead>
                      {referencia ? <TableHead className="text-right">vs. presupuesto</TableHead> : null}
                      <TableHead className="text-right">Plazo</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cuadro.lineas.map((l) => (
                      <TableRow key={l.quote.id} className={l.quote.awarded ? 'bg-success-subtle' : undefined}>
                        <TableCell className="text-muted-foreground">{l.posicion}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-foreground">{l.quote.supplierName}</span>
                            {l.quote.awarded && (
                              <StatusBadge tone="success" icon={Award}>Adjudicada</StatusBadge>
                            )}
                            {l.vencida && <StatusBadge tone="danger">Validez vencida</StatusBadge>}
                          </div>
                          {l.quote.filePath && (
                            <button
                              type="button"
                              className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              onClick={() => openObraFile(l.quote.filePath!)}
                            >
                              <Paperclip className="h-3 w-3" /> {l.quote.fileName}
                            </button>
                          )}
                          {l.quote.awarded && l.quote.awardReason && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Motivo: {l.quote.awardReason}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium text-foreground">
                          {sc.currency === 'UF'
                            ? `${l.quote.amountNet.toLocaleString('es-CL')} UF`
                            : formatCLP(l.quote.amountNet)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {l.esLaMasEconomica
                            ? '—'
                            : `+${formatCLP(l.diferencia)} (${l.diferenciaPct.toFixed(1)}%)`}
                        </TableCell>
                        {referencia ? (
                          <TableCell className={`text-right ${(l.vsReferencia ?? 0) > 0 ? 'text-danger' : 'text-success'}`}>
                            {l.vsReferencia === null
                              ? '—'
                              : `${l.vsReferencia > 0 ? '+' : ''}${formatCLP(l.vsReferencia)}`}
                          </TableCell>
                        ) : null}
                        <TableCell className="text-right text-muted-foreground">
                          {l.quote.plazoDias ? `${l.quote.plazoDias} d` : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {editable && !firmas.completo && (
                            <div className="flex justify-end gap-1">
                              {!l.quote.awarded && (
                                <Button size="sm" variant="outline"
                                  onClick={() => setAdjudicando(l.quote.id)}>
                                  Adjudicar
                                </Button>
                              )}
                              <Button
                                size="sm" variant="ghost" aria-label="Borrar"
                                onClick={() => deleteSubcontractQuote(l.quote.id, l.quote.filePath)}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-danger" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {cuadro.fueraDeMoneda.length > 0 && (
                <p className="text-xs text-warning">
                  {cuadro.fueraDeMoneda.length} oferta(s) en otra moneda quedan fuera del
                  cuadro: compararlas exigiría el valor de la UF del día y el ranking sería
                  falso. Regístralas en la moneda del contrato para compararlas.
                </p>
              )}

              {ahorro && (
                <p className="flex items-center gap-2 text-sm">
                  <TrendingDown className={`h-4 w-4 ${ahorro.monto <= 0 ? 'text-success' : 'text-danger'}`} />
                  <span className="text-muted-foreground">
                    Adjudicada {ahorro.monto <= 0 ? 'bajo' : 'sobre'} el presupuesto por{' '}
                    <span className="font-medium text-foreground">
                      {formatCLP(Math.abs(ahorro.monto))} ({Math.abs(ahorro.pct).toFixed(1)}%)
                    </span>
                  </span>
                </p>
              )}
            </>
          )}
        </div>

        {/* ── Firma de las dos partes ────────────────────────────────── */}
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">Firma del contrato</span>
            <StatusBadge tone={firmas.completo ? 'success' : 'warning'}>
              {firmas.completo
                ? 'Firmado por ambas partes'
                : `Falta la firma de: ${firmas.faltan.map((p) => PARTE_LABEL[p]).join(' y ')}`}
            </StatusBadge>
          </div>

          {firmas.alterado && (
            <p className="rounded-md border border-warning/40 bg-warning-subtle p-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                El contrato cambió después de firmado.
              </span>{' '}
              Las firmas corresponden a otras condiciones. Vuelve a firmarlo si el cambio es válido.
            </p>
          )}

          {!puerta.puede && !firmas.completo && (
            <p className="text-sm text-warning">{puerta.motivo}</p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {(['empresa', 'contraparte'] as ParteFirmante[]).map((parte) => {
              const f = parte === 'empresa' ? firmas.empresa : firmas.contraparte;
              return (
                <div key={parte} className="rounded-md border border-border p-3 text-sm">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {PARTE_LABEL[parte]}
                  </div>
                  {f ? (
                    <div className="mt-1 space-y-1">
                      {f.signature && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.signature} alt="Firma" className="h-10 w-auto dark:invert" />
                      )}
                      <div className="font-medium text-foreground">{f.signerName}</div>
                      <div className="text-xs text-muted-foreground">
                        {[f.signerRut, f.signerRole].filter(Boolean).join(' · ')}
                        {f.signerRut || f.signerRole ? ' · ' : ''}
                        {formatDate(f.signedAt)}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 text-muted-foreground">Sin firmar.</p>
                  )}
                  {editable && !f && (
                    <Button
                      size="sm" className="mt-2"
                      disabled={!puerta.puede}
                      onClick={() => setFirmando(parte)}
                    >
                      <PenLine className="mr-2 h-3.5 w-3.5" /> Firmar
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Adjuntos ───────────────────────────────────────────────── */}
        <div className="space-y-2 border-t border-border pt-4">
          <div className="text-sm font-medium text-foreground">
            Archivos del contrato
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              Cuadro comparativo firmado, contrato escaneado, anexos.
            </span>
          </div>

          {adjuntos.length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border">
              {adjuntos.map((a) => (
                <li key={a.id} className="flex items-center gap-3 p-2 text-sm">
                  <button
                    type="button"
                    className="inline-flex min-w-0 flex-1 items-center gap-2 text-left hover:underline"
                    onClick={() => openObraFile(a.filePath)}
                  >
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate text-foreground">{a.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatFileSize(a.fileSize)}
                    </span>
                  </button>
                  {editable && (
                    <Button
                      variant="ghost" size="icon" aria-label="Borrar"
                      onClick={() => deleteSubcontractAttachment(a.id, a.filePath)}
                    >
                      <Trash2 className="h-4 w-4 text-danger" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {editable && (
            isDemoMode() ? (
              <p className="text-xs text-muted-foreground">
                El modo demo funciona sobre el navegador, sin servidor: no guarda archivos.
                Todo lo demás de esta pantalla sí funciona.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="adj-contrato" className="text-xs text-muted-foreground">
                  Adjuntar:
                </Label>
                <Input
                  id="adj-contrato" type="file" className="max-w-xs"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) subirAdjunto(f, 'contrato');
                    e.target.value = '';
                  }}
                />
              </div>
            )
          )}
        </div>
      </CardContent>

      {nuevaOferta && (
        <DialogoOferta subcontract={sc} onCerrar={() => setNuevaOferta(false)} />
      )}
      {adjudicando && (
        <DialogoAdjudicar
          quoteId={adjudicando}
          esLaMasEconomica={
            cuadro.lineas.find((l) => l.quote.id === adjudicando)?.esLaMasEconomica ?? true
          }
          onCerrar={() => setAdjudicando(null)}
        />
      )}
      {firmando && (
        <DialogoFirma
          subcontract={sc}
          parte={firmando}
          huella={huella}
          onCerrar={() => setFirmando(null)}
        />
      )}
    </Card>
  );
}

/* ── Alta de una cotización ────────────────────────────────────────────── */

function DialogoOferta({
  subcontract: sc, onCerrar,
}: {
  subcontract: Subcontract;
  onCerrar: () => void;
}) {
  const { addSubcontractQuote, suppliers } = useAppState();
  const { getTenantId } = useAuth();
  const { toast } = useToast();

  const [nombre, setNombre] = useState('');
  const [monto, setMonto] = useState(0);
  const [plazo, setPlazo] = useState<number | ''>('');
  const [validez, setValidez] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function guardar() {
    if (!nombre.trim()) {
      toast({ variant: 'destructive', title: 'Falta el oferente' });
      return;
    }
    setOcupado(true);
    try {
      let subido: { path: string; fileName: string; fileSize: number } | null = null;
      if (archivo) {
        const tenantId = getTenantId();
        if (!tenantId) throw new Error('No se pudo determinar la empresa.');
        subido = await uploadObraFile(archivo, {
          tenantId, projectId: sc.projectId, carpeta: `subcontratos/${sc.id}/cotizaciones`,
        });
      }

      await addSubcontractQuote({
        subcontractId: sc.id,
        // Si el oferente ya es proveedor, se enlaza; si no, queda como texto.
        supplierId: suppliers.find(
          (s) => s.name.toLowerCase() === nombre.trim().toLowerCase(),
        )?.id ?? null,
        supplierName: nombre.trim(),
        amountNet: monto,
        currency: sc.currency,
        plazoDias: plazo === '' ? null : Number(plazo),
        validUntil: (validez || null) as never,
        ...(subido
          ? { filePath: subido.path, fileName: subido.fileName, fileSize: subido.fileSize }
          : {}),
      });
      onCerrar();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo guardar', description: e.message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva cotización</DialogTitle>
          <DialogDescription>
            Se compara en {sc.currency}, la moneda del contrato. Con estas filas la app
            arma el cuadro comparativo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="of-nombre">Oferente</Label>
            <Input id="of-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)}
              list="proveedores-conocidos" placeholder="Nombre de la empresa" />
            <datalist id="proveedores-conocidos">
              {suppliers.map((s) => <option key={s.id} value={s.name} />)}
            </datalist>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="of-monto">Monto neto ({sc.currency})</Label>
              <Input id="of-monto" type="number" min={0} value={monto || ''}
                onChange={(e) => setMonto(Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="of-plazo">Plazo (días)</Label>
              <Input id="of-plazo" type="number" min={0} value={plazo}
                onChange={(e) => setPlazo(e.target.value === '' ? '' : Number(e.target.value))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="of-validez">Válida hasta</Label>
            <Input id="of-validez" type="date" value={validez}
              onChange={(e) => setValidez(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Pasada esa fecha la app no deja adjudicarla sin pedirla de nuevo.
            </p>
          </div>

          {!isDemoMode() && (
            <div className="space-y-2">
              <Label htmlFor="of-archivo">PDF de la oferta</Label>
              <Input id="of-archivo" type="file" accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={ocupado}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Adjudicación ──────────────────────────────────────────────────────── */

function DialogoAdjudicar({
  quoteId, esLaMasEconomica, onCerrar,
}: {
  quoteId: string;
  esLaMasEconomica: boolean;
  onCerrar: () => void;
}) {
  const { awardSubcontractQuote } = useAppState();
  const { toast } = useToast();
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function adjudicar() {
    setOcupado(true);
    try {
      await awardSubcontractQuote({ quoteId, awardReason: motivo.trim() || null });
      toast({
        title: 'Oferta adjudicada',
        description: 'El contrato tomó su monto, plazo y contratista.',
      });
      onCerrar();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo adjudicar', description: e.message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjudicar esta oferta</DialogTitle>
          <DialogDescription>
            El contrato va a tomar el monto, el plazo y el contratista de la oferta.
          </DialogDescription>
        </DialogHeader>

        {!esLaMasEconomica && (
          <p className="rounded-md border border-warning/40 bg-warning-subtle p-3 text-sm text-muted-foreground">
            Esta no es la oferta más económica. Escribe por qué la eliges: es el dato que
            nadie encuentra cuando alguien pregunta seis meses después.
          </p>
        )}

        <Textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          placeholder={esLaMasEconomica
            ? 'Comentario (opcional)'
            : 'Ej: único con experiencia en trabajo en altura y plazo 20 días menor'}
        />

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button
            onClick={adjudicar}
            disabled={ocupado || (!esLaMasEconomica && !motivo.trim())}
          >
            <Award className="mr-2 h-4 w-4" /> Adjudicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Firma de una parte ────────────────────────────────────────────────── */

function DialogoFirma({
  subcontract: sc, parte, huella, onCerrar,
}: {
  subcontract: Subcontract;
  parte: ParteFirmante;
  huella: string | null;
  onCerrar: () => void;
}) {
  const { signDocument, suppliers, users } = useAppState();
  const { user } = useAuth();
  const { toast } = useToast();

  const contratista = suppliers.find((s) => s.id === sc.supplierId);
  const yo = users.find((u) => u.id === user?.id);

  // Se precargan los datos que ya conocemos, pero quedan editables: quien firma
  // por el contratista puede no ser el representante que está en la ficha.
  const [nombre, setNombre] = useState(
    parte === 'empresa' ? (yo?.name ?? '') : (contratista?.representativeName ?? ''),
  );
  const [rut, setRut] = useState(
    parte === 'empresa' ? (yo?.rut ?? '') : (contratista?.representativeRut ?? ''),
  );
  const [cargo, setCargo] = useState(
    parte === 'empresa' ? (yo?.cargo ?? '') : 'Representante legal',
  );
  const firmaRef = useRef<any>(null);
  const [firmaHecha, setFirmaHecha] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function firmar() {
    if (!nombre.trim()) {
      toast({ variant: 'destructive', title: 'Falta el nombre de quien firma' });
      return;
    }
    if (!firmaHecha) {
      toast({ variant: 'destructive', title: 'Falta la firma', description: 'Dibújala en el recuadro.' });
      return;
    }

    setOcupado(true);
    try {
      let imagen: string | null = null;
      try {
        imagen = firmaRef.current?.getTrimmedCanvas()?.toDataURL('image/png') ?? null;
      } catch { imagen = null; }

      await signDocument({
        documentType: 'subcontract',
        documentId: sc.id,
        party: parte,
        signerName: nombre,
        signerRut: rut,
        signerRole: cargo,
        signature: imagen,
        documentHash: huella,
      });
      toast({ title: 'Contrato firmado', description: `Firma registrada por ${PARTE_LABEL[parte].toLowerCase()}.` });
      onCerrar();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo firmar', description: e.message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <FileSignature className="mr-2 inline h-4 w-4" />
            Firma de {PARTE_LABEL[parte].toLowerCase()}
          </DialogTitle>
          <DialogDescription>
            {parte === 'contraparte'
              ? 'El contratista firma en persona; no necesita cuenta en la app. Su nombre y RUT quedan registrados junto a la firma.'
              : 'Tu nombre, RUT y cargo quedan registrados junto a la firma.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="fi-nombre">Nombre</Label>
            <Input id="fi-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fi-rut">RUT</Label>
            <Input id="fi-rut" value={rut} onChange={(e) => setRut(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-3">
            <Label htmlFor="fi-cargo">Cargo</Label>
            <Input id="fi-cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Firma</Label>
          <div className="h-32 w-full rounded-md border border-border bg-white">
            <SignaturePad
              ref={firmaRef}
              penColor="black"
              onEnd={() => setFirmaHecha(true)}
              canvasProps={{ className: 'h-32 w-full rounded-md' }}
            />
          </div>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => { firmaRef.current?.clear?.(); setFirmaHecha(false); }}
          >
            Borrar y firmar de nuevo
          </button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={firmar} disabled={ocupado}>Firmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
