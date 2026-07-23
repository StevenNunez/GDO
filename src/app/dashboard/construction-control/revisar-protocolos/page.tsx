"use client";

import React, { useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertCircle, Loader2, ThumbsUp, ThumbsDown, CheckSquare, Inbox, Clock,
} from 'lucide-react';
import { PanelCard } from '@/components/ui/panel-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { WorkItem } from '@/modules/core/lib/data';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/modules/core/hooks/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { toDate } from '@/lib/date-utils';
import { Progress } from '@/components/ui/progress';

export default function RevisarProtocolosPage() {
  const { workItems, isLoading, approveWorkItem, rejectWorkItem, can } = useAppState();
  const { toast } = useToast();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const [rejectTarget, setRejectTarget] = useState<WorkItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  const itemsForReview = useMemo(() => {
    return (workItems || [])
      .filter((item: WorkItem) => item.status === 'pending-quality-review')
      .sort((a, b) => {
        const tA = toDate(a.actualEndDate)?.getTime() ?? 0;
        const tB = toDate(b.actualEndDate)?.getTime() ?? 0;
        return tA - tB;
      });
  }, [workItems]);

  const handleApprove = async (itemId: string) => {
    setProcessingId(itemId);
    try {
      await approveWorkItem(itemId);
      toast({ title: "Partida aprobada", description: "El protocolo ha sido aprobado y la partida marcada como completada." });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (!reason) {
      toast({ variant: 'destructive', title: 'Motivo requerido', description: 'Debes indicar el motivo del rechazo.' });
      return;
    }
    setIsRejecting(true);
    try {
      await rejectWorkItem(rejectTarget.id, reason);
      toast({ title: "Partida rechazada", description: `Se notificó el motivo: "${reason}"`, variant: 'destructive' });
      setRejectTarget(null);
      setRejectReason('');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsRejecting(false);
    }
  };

  if (!can('construction_control:review_protocols')) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Acceso Denegado</AlertTitle>
        <AlertDescription>No tienes permiso para revisar protocolos.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Revisar Protocolos de Calidad"
        description="Bandeja de aprobación para partidas finalizadas que requieren validación técnica."
      />

      {/* Reject reason dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={open => { if (!open) { setRejectTarget(null); setRejectReason(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rechazar protocolo</DialogTitle>
            <DialogDescription>
              Indica el motivo del rechazo para{' '}
              <strong>{rejectTarget?.path} — {rejectTarget?.name}</strong>.
              El responsable podrá corregir y volver a enviar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="rejectReason">Motivo del rechazo <span className="text-destructive">*</span></Label>
            <Textarea
              id="rejectReason"
              placeholder="Ej: La capa de hormigón no alcanza el espesor mínimo especificado (≥15 cm). Verificar y corregir antes de reenviar."
              rows={4}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRejectTarget(null); setRejectReason(''); }} disabled={isRejecting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleRejectSubmit} disabled={isRejecting || !rejectReason.trim()}>
              {isRejecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ThumbsDown className="mr-2 h-4 w-4" />}
              Confirmar rechazo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PanelCard
        title="Partidas pendientes de aprobación"
        description="Partidas marcadas al 100% que requieren tu validación técnica antes de ser cerradas."
        icon={CheckSquare}
        actions={
          itemsForReview.length > 0 ? (
            <StatusBadge tone="warning">{itemsForReview.length} pendiente{itemsForReview.length > 1 ? 's' : ''}</StatusBadge>
          ) : undefined
        }
      >
          <ScrollArea className="h-[calc(80vh-14rem)]">
            {isLoading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : itemsForReview.length > 0 ? (
              <div className="space-y-3 pr-2">
                {itemsForReview.map(item => (
                  <div key={item.id} className="space-y-3 rounded-xl border border-border bg-muted/40 p-4 transition-colors hover:bg-muted">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          <span className="font-mono text-xs text-muted-foreground mr-1">{item.path}</span>
                          {item.name}
                        </p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {item.quantity.toLocaleString('es-CL')} {item.unit}
                          {' · '}
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Enviado {item.actualEndDate
                              ? formatDistanceToNow(toDate(item.actualEndDate)!, { addSuffix: true, locale: es })
                              : 'recientemente'}
                          </span>
                        </p>
                      </div>
                      {processingId === item.id ? (
                        <Loader2 className="h-5 w-5 animate-spin shrink-0 mt-1" />
                      ) : (
                        <div className="flex gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-danger/40 text-danger hover:bg-danger-subtle hover:text-danger"
                            onClick={() => { setRejectTarget(item); setRejectReason(''); }}
                          >
                            <ThumbsDown className="mr-1.5 h-3.5 w-3.5" /> Rechazar
                          </Button>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" className="bg-success text-background hover:bg-success/90">
                                <ThumbsUp className="mr-1.5 h-3.5 w-3.5" /> Aprobar
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>¿Aprobar protocolo?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esto marcará <strong>{item.name}</strong> como completada definitivamente. No se podrá registrar más avance.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleApprove(item.id)}
                                  className="bg-success text-background hover:bg-success/90"
                                >
                                  Sí, aprobar y cerrar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div className="flex items-center gap-2">
                      <Progress value={item.progress} className="h-1.5 flex-1" />
                      <span className="font-mono text-xs text-success">{item.progress.toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center text-center text-muted-foreground">
                <Inbox className="mb-4 h-16 w-16 text-success opacity-50" />
                <h3 className="text-xl font-bold tracking-tight">¡Bandeja limpia!</h3>
                <p className="mt-1 text-sm">No hay partidas pendientes de revisión.</p>
              </div>
            )}
          </ScrollArea>
      </PanelCard>
    </div>
  );
}
