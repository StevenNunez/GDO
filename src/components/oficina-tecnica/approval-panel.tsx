"use client";

/**
 * Panel de aprobación — se enchufa en cualquier documento (migración 029).
 *
 * Es UN componente para los cuatro documentos que pasan por la cadena de visto
 * bueno. La pantalla del documento no sabe aprobar: le pasa su tipo, su id y
 * los campos que no pueden cambiar después de firmado, y el panel se encarga
 * del resto. Por eso agregar el flujo a un quinto documento son tres líneas y
 * no una pantalla nueva.
 *
 * Lo que muestra según el estado:
 *  - sin trámite     → botón «Presentar a aprobación»
 *  - en trámite      → la cadena con quién firmó y quién falta; si te toca a
 *                      ti, los botones de aprobar y rechazar
 *  - rechazado       → el motivo arriba de todo, que es lo que hay que corregir
 *  - aprobado        → las firmas, y la alerta si el documento cambió después
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCheck, Check, ChevronRight, CircleDashed, Clock, PenLine,
  ShieldAlert, Undo2, X,
} from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { useAuth } from '@/modules/core/contexts/app-provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import SignaturePad from '@/components/signature-pad';
import { useToast } from '@/modules/core/hooks/use-toast';
import { formatDateTime } from '@/lib/date-utils';
import {
  diasEsperando, documentoAlterado, firmaPorCuentaDe, historialDe,
  huellaDocumento, motivoRechazo, pasoActual, progresoAprobacion, puedeFirmar,
} from '@/lib/approval';
import type { ApprovalDocumentType, ApprovalRequest } from '@/modules/core/lib/data';

interface ApprovalPanelProps {
  documentType: ApprovalDocumentType;
  documentId: string;
  projectId?: string | null;
  /**
   * Los campos que quedan sellados por la firma: montos, plazos y partes. De
   * acá sale la huella. Poner de más no rompe nada; poner de menos deja pasar
   * ediciones sin que nadie se entere.
   */
  camposSellados: Record<string, unknown>;
  /** Se llama cuando el trámite cierra, para que el documento cambie su estado. */
  onResuelto?: (status: 'aprobado' | 'rechazado') => void | Promise<void>;
  /** Bloquea presentar (p. ej. un EEPP sin líneas). */
  puedePresentar?: boolean;
  motivoNoPuedePresentar?: string;
}

export function ApprovalPanel({
  documentType, documentId, projectId, camposSellados,
  onResuelto, puedePresentar = true, motivoNoPuedePresentar,
}: ApprovalPanelProps) {
  const {
    approvalRequests, approvalActions, approvalFlows, approvalDelegations, users,
    submitForApproval, actOnApproval, cancelApprovalRequest,
  } = useAppState();
  const { user } = useAuth();
  const { toast } = useToast();

  const [huella, setHuella] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [dialogo, setDialogo] = useState<null | 'aprobar' | 'rechazar'>(null);
  const [motivo, setMotivo] = useState('');
  const firmaRef = useRef<any>(null);
  const [firmaHecha, setFirmaHecha] = useState(false);

  /** El trámite vigente: el abierto, o el último cerrado si no hay ninguno. */
  const request = useMemo<ApprovalRequest | null>(() => {
    const propios = approvalRequests.filter(
      (r) => r.documentType === documentType && r.documentId === documentId,
    );
    return propios.find((r) => r.status === 'pendiente')
      ?? [...propios].sort((a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt))[0]
      ?? null;
  }, [approvalRequests, documentType, documentId]);

  const hayFlujo = useMemo(
    () => approvalFlows.some((f) => f.documentType === documentType && f.active),
    [approvalFlows, documentType],
  );

  // La huella se recalcula cuando cambia el documento: así se detecta la
  // edición posterior a la firma sin tener que guardar nada más.
  useEffect(() => {
    let vivo = true;
    huellaDocumento(camposSellados)
      .then((h) => { if (vivo) setHuella(h); })
      .catch(() => { if (vivo) setHuella(null); });
    return () => { vivo = false; };
  }, [camposSellados]);

  // El rol de cada usuario: lo necesita la delegación de un paso POR ROL
  // (el jefe de terreno de vacaciones delega, y hay que saber que era él).
  const rolPorUsuario = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u.role])),
    [users],
  );
  const quienFirma = {
    userId: user?.id, role: user?.role,
    delegaciones: approvalDelegations, rolPorUsuario,
  };

  const meToca = request ? puedeFirmar(request, quienFirma) : false;
  // Si firmo por delegación, la pantalla lo dice ANTES de estampar la firma:
  // nadie debería firmar sin saber a nombre de quién queda.
  const porCuentaDe = request ? firmaPorCuentaDe(request, quienFirma) : null;
  const progreso = request ? progresoAprobacion(request) : null;
  const paso = request ? pasoActual(request) : null;
  const rechazo = request ? motivoRechazo(request, approvalActions) : null;
  const historial = request ? historialDe(approvalActions, request.id) : [];
  const alterado = request && request.status === 'aprobado'
    ? documentoAlterado(request, huella)
    : false;

  const nombreDe = (id?: string | null) =>
    users.find((u) => u.id === id)?.name ?? 'alguien de la empresa';

  /* ── Acciones ────────────────────────────────────────────────────────── */

  async function presentar() {
    setEnviando(true);
    try {
      const id = await submitForApproval({
        documentType, documentId, projectId, documentHash: huella,
      });
      toast(id
        ? { title: 'Presentado a aprobación', description: 'Ya está en la bandeja del primer aprobador.' }
        : { title: 'Sin flujo configurado', description: 'La empresa no definió una cadena de aprobación para este documento.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo presentar', description: e.message });
    } finally {
      setEnviando(false);
    }
  }

  async function firmar(accion: 'aprobado' | 'rechazado') {
    if (!request) return;
    if (accion === 'rechazado' && !motivo.trim()) {
      toast({ variant: 'destructive', title: 'Falta el motivo', description: 'Sin motivo, quien corrige no sabe qué corregir.' });
      return;
    }

    let firma: string | null = null;
    if (accion === 'aprobado' && paso?.requiresSignature) {
      if (!firmaHecha) {
        toast({ variant: 'destructive', title: 'Falta la firma', description: 'Este paso pide firma para aprobar.' });
        return;
      }
      try {
        firma = firmaRef.current?.getTrimmedCanvas()?.toDataURL('image/png') ?? null;
      } catch {
        firma = null;
      }
    }

    setEnviando(true);
    try {
      const r = await actOnApproval({
        requestId: request.id,
        action: accion,
        comment: motivo.trim() || null,
        signature: firma,
        documentHash: huella,
      });

      setDialogo(null);
      setMotivo('');
      setFirmaHecha(false);

      if (r.status === 'aprobado' || r.status === 'rechazado') {
        await onResuelto?.(r.status);
        toast({
          title: r.status === 'aprobado' ? 'Documento aprobado' : 'Documento rechazado',
          description: r.status === 'aprobado'
            ? 'Pasó todos los pasos de la cadena.'
            : 'Se avisó el motivo a quien lo preparó.',
        });
      } else {
        toast({ title: 'Firmado', description: 'Pasa al siguiente aprobador.' });
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo firmar', description: e.message });
    } finally {
      setEnviando(false);
    }
  }

  async function retirar() {
    if (!request) return;
    try {
      await cancelApprovalRequest(request.id);
      toast({ title: 'Retirado del trámite', description: 'Puedes corregirlo y volver a presentarlo.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo retirar', description: e.message });
    }
  }

  /* ── Sin flujo configurado: el panel no estorba ──────────────────────── */

  if (!hayFlujo && !request) return null;

  /* ── Sin trámite abierto ─────────────────────────────────────────────── */

  if (!request || request.status === 'anulado') {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">Aprobación</div>
            <p className="text-sm text-muted-foreground">
              {request?.status === 'anulado'
                ? 'El trámite anterior se retiró. Corrige y vuelve a presentarlo.'
                : 'Este documento todavía no entra a la cadena de visto bueno.'}
            </p>
            {!puedePresentar && motivoNoPuedePresentar && (
              <p className="mt-1 text-sm text-warning">{motivoNoPuedePresentar}</p>
            )}
          </div>
          <Button onClick={presentar} disabled={enviando || !puedePresentar}>
            Presentar a aprobación
          </Button>
        </CardContent>
      </Card>
    );
  }

  /* ── En trámite o cerrado ────────────────────────────────────────────── */

  const tono = request.status === 'aprobado' ? 'success'
    : request.status === 'rechazado' ? 'danger' : 'warning';

  return (
    <Card className={request.status === 'rechazado' ? 'border-danger/40' : undefined}>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <BadgeCheck className="h-4 w-4" />
            Aprobación
            <StatusBadge tone={tono}>
              {request.status === 'pendiente'
                ? `Paso ${progreso!.firmados + 1} de ${progreso!.total}`
                : request.status === 'aprobado' ? 'Aprobado' : 'Rechazado'}
            </StatusBadge>
          </div>
          {request.status === 'pendiente' && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {diasEsperando(request) === 0
                ? 'Presentado hoy'
                : `${diasEsperando(request)} día(s) esperando`}
            </span>
          )}
        </div>

        {/* El motivo del rechazo va arriba de todo: es lo que hay que corregir. */}
        {rechazo && (
          <div className="rounded-md border border-danger/40 bg-danger-subtle p-3 text-sm">
            <div className="font-medium text-foreground">
              Rechazado en «{rechazo.paso}»{rechazo.por ? ` por ${rechazo.por}` : ''}
            </div>
            <p className="mt-1 text-muted-foreground">{rechazo.motivo}</p>
          </div>
        )}

        {alterado && (
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-subtle p-3 text-sm">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">El documento cambió después de aprobado.</span>{' '}
              Las firmas corresponden a otra versión. Preséntalo de nuevo si el cambio es válido.
            </p>
          </div>
        )}

        {/* La cadena completa: quién firmó, quién falta. */}
        <ol className="space-y-2">
          {request.stepsSnapshot.map((s, i) => {
            const accion = historial.find((a) => a.stepOrder === i);
            const enCurso = request.status === 'pendiente' && i === request.currentStep;
            return (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5">
                  {accion?.action === 'aprobado' ? <Check className="h-4 w-4 text-success" />
                    : accion?.action === 'rechazado' ? <X className="h-4 w-4 text-danger" />
                    : enCurso ? <ChevronRight className="h-4 w-4 text-warning" />
                    : <CircleDashed className="h-4 w-4 text-muted-foreground" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={enCurso ? 'font-medium text-foreground' : 'text-foreground'}>
                    {s.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {accion
                      ? `${accion.actorName ?? 'Firmado'}${accion.onBehalfOfName ? ` (por ${accion.onBehalfOfName})` : ''}${accion.actorCargo ? ` · ${accion.actorCargo}` : ''} · ${formatDateTime(accion.actedAt)}`
                      : s.approverUserId
                        ? `Espera a ${nombreDe(s.approverUserId)}`
                        : `Aprueba: ${s.approverRole}`}
                  </div>
                  {accion?.comment && (
                    <p className="mt-1 text-xs text-muted-foreground">«{accion.comment}»</p>
                  )}
                </div>
                {accion?.signature && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={accion.signature} alt="Firma" className="h-8 w-auto opacity-80 dark:invert" />
                )}
              </li>
            );
          })}
        </ol>

        {/* Botonera */}
        {request.status === 'pendiente' && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            {meToca ? (
              <>
                <Button size="sm" onClick={() => { setMotivo(''); setFirmaHecha(false); setDialogo('aprobar'); }}>
                  <PenLine className="mr-2 h-4 w-4" />
                  {paso?.requiresSignature ? 'Firmar y aprobar' : 'Aprobar'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setMotivo(''); setDialogo('rechazar'); }}>
                  <X className="mr-2 h-4 w-4" /> Rechazar
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Esperando a {paso?.approverUserId ? nombreDe(paso.approverUserId) : `«${paso?.name}»`}.
              </p>
            )}
            {request.submittedBy === user?.id && (
              <Button size="sm" variant="ghost" onClick={retirar} className="ml-auto">
                <Undo2 className="mr-2 h-4 w-4" /> Retirar
              </Button>
            )}
          </div>
        )}
      </CardContent>

      {/* ── Diálogo de firma / rechazo ─────────────────────────────────── */}
      <Dialog open={dialogo !== null} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialogo === 'aprobar' ? `Aprobar «${paso?.name}»` : `Rechazar «${paso?.name}»`}
            </DialogTitle>
            <DialogDescription>
              {dialogo === 'aprobar'
                ? (porCuentaDe
                  ? `Firmas POR CUENTA DE ${nombreDe(porCuentaDe)}, que delegó su firma en ti. Queda registrado así en el documento.`
                  : 'Tu nombre, RUT y cargo quedan registrados junto a la firma.')
                : 'El motivo se le muestra a quien preparó el documento. Es obligatorio.'}
            </DialogDescription>
          </DialogHeader>

          {dialogo === 'aprobar' && paso?.requiresSignature && (
            <div className="space-y-2">
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
          )}

          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={dialogo === 'rechazar'
              ? 'Qué hay que corregir (ej: falta el F30-1 del período)'
              : 'Comentario (opcional)'}
            rows={3}
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)}>Cancelar</Button>
            <Button
              onClick={() => firmar(dialogo === 'aprobar' ? 'aprobado' : 'rechazado')}
              disabled={enviando || (dialogo === 'rechazar' && !motivo.trim())}
              variant={dialogo === 'rechazar' ? 'destructive' : 'default'}
            >
              {dialogo === 'aprobar' ? 'Aprobar' : 'Rechazar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
