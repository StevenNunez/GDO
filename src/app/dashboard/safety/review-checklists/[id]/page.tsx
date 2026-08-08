"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useAppState, useAuth } from "@/modules/core/contexts/app-provider";
import { PageHeader } from "@/components/page-header";
import { TaskStatusBadge } from '@/components/safety/safety-badges';
import { PanelCard } from "@/components/ui/panel-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Calendar, ClipboardCheck, Download, Loader2, ThumbsDown, ThumbsUp, User as UserIcon } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import SignaturePad from "@/components/signature-pad";
import { useToast } from "@/modules/core/hooks/use-toast";
import type { AssignedSafetyTask, User } from "@/modules/core/lib/data";
import { Badge } from "@/components/ui/badge";
import { toDate } from "@/lib/date-utils";
import { generateChecklistPDF } from "@/lib/checklist-pdf-generator";
import { EnviarDocumento } from '@/components/enviar-documento';


const formatDate = (date: Date | string | undefined | null, includeTime = false) => {
    const jsDate = toDate(date);
    if (!jsDate) return 'N/A';
    const formatString = includeTime ? "d 'de' MMMM, yyyy HH:mm" : "d 'de' MMMM, yyyy";
    return format(jsDate, formatString, { locale: es });
};

export default function AprReviewChecklistPage() {
    const params = useParams();
    const router = useRouter();
    const { assignedChecklists, users, isLoading, reviewAssignedChecklist } = useAppState();
    const { user } = useAuth();
    const { toast } = useToast();
    
    const signaturePadRef = useRef<any>(null);
    const checklistId = params.id as string;

    const checklist = useMemo(() => {
        if (!assignedChecklists) return null;
        return assignedChecklists.find((c: AssignedSafetyTask) => c.id === checklistId) || null;
    }, [assignedChecklists, checklistId]);

    const [rejectionNotes, setRejectionNotes] = useState("");
    const [aprSignature, setAprSignature] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (checklist) {
            setRejectionNotes((checklist as any).rejectionNotes || "");
            setAprSignature((checklist as any).reviewedBy?.signature || null);
        }
    }, [checklist]);


    const supervisor = useMemo(() => {
        if (!checklist) return undefined;
        return (users || []).find((u: User) => u.id === checklist.supervisorId);
    }, [checklist, users]);
    
    const aprUser = useMemo(() => {
        if (!checklist) return undefined;
        return (users || []).find((u: User) => u.id === checklist.assignerId);
    }, [checklist, users]);

    const handleReview = async (status: 'approved' | 'rejected') => {
        if (!checklist) return;
        if (status === 'rejected' && !rejectionNotes.trim()) {
            toast({ variant: 'destructive', title: 'Error', description: 'Debes proporcionar una razón para el rechazo en las notas.' });
            return;
        }
        if (!aprSignature) {
            toast({ variant: 'destructive', title: 'Error', description: 'Debes firmar para registrar tu revisión.' });
            return;
        }

        setIsSubmitting(true);
        try {
            await reviewAssignedChecklist(checklistId, status, rejectionNotes, aprSignature);
            toast({ title: `Checklist ${status === 'approved' ? 'aprobado' : 'rechazado'}`, description: 'El estado ha sido guardado.' });
            router.push('/dashboard/safety/review-checklists');
        } catch(error: any) {
            toast({ variant: 'destructive', title: 'Error al Revisar', description: error.message || 'No se pudo completar la acción.' });
        } finally {
            setIsSubmitting(false);
        }
    }
    
     const handleDownloadPDF = async () => {
        if (!checklist) return;
        try {
            await generateChecklistPDF(checklist, users, supervisor, aprUser);
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error al generar PDF', description: error.message });
        }
    };


    if (isLoading) {
        return <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    if (!checklist) {
        return (
            <div>
                <Button variant="ghost" onClick={() => router.back()}><ArrowLeft className="mr-2"/> Volver</Button>
                <PageHeader title="Checklist no encontrado" description="El checklist que buscas no existe o fue eliminado." />
            </div>
        );
    }
    
    const isReviewed = checklist.status === 'approved' || checklist.status === 'rejected';
    const canDownload = isReviewed || checklist.status === 'completed';

    return (
        <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                 <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <PageHeader title={checklist.templateTitle} description={`Revisando para la obra: ${checklist.area}`} className="mb-0"/>
                 </div>
                 <div className="flex items-center gap-4">
                    {canDownload && (
                      <>
                        <Button variant="outline" onClick={handleDownloadPDF}>
                            <Download className="mr-2"/> Descargar PDF
                        </Button>
                        <EnviarDocumento
                            size="default"
                            fileName={`Checklist_${checklist.templateTitle.replace(/[^\w-]+/g, '_')}.pdf`}
                            asuntoSugerido={`Checklist · ${checklist.templateTitle}`}
                            descripcionDestinatario="quien lo necesite"
                            mensajeSugerido="Adjuntamos el checklist de prevención firmado."
                            generarPdf={() => generateChecklistPDF(checklist, users, supervisor, aprUser, 'blob')}
                        />
                      </>
                    )}
                    <TaskStatusBadge status={checklist.status} review />
                 </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              <div className="lg:col-span-2 space-y-8">
                  <PanelCard
              title="Detalles del Checklist Completado"
              description="Revisa las respuestas y detalles proporcionados por el supervisor."
              icon={ClipboardCheck}
              contentClassName="space-y-6"
            >
                          {(checklist.items || []).map((item: any, index: number) => {
                              const responsibleUser = (users || []).find((u: User) => u.id === item.responsibleUserId);
                              return (
                                  <div key={index} className="p-4 border rounded-lg space-y-3 bg-muted/30">
                                      <p className="font-semibold">{index + 1}. {item.element}</p>
                                      <div className="flex items-center gap-4 text-sm">
                                          <span className="font-medium">Respuesta:</span>
                                          {item.yes && <StatusBadge tone="success">Sí</StatusBadge>}
                                          {item.no && <StatusBadge tone="danger">No</StatusBadge>}
                                          {item.na && <StatusBadge tone="neutral">N/A</StatusBadge>}
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                           <div className="flex items-center gap-2 text-muted-foreground">
                                              <UserIcon className="h-4 w-4"/>
                                              <span>Responsable: <span className="font-semibold text-foreground">{responsibleUser?.name || 'No asignado'}</span></span>
                                          </div>
                                           <div className="flex items-center gap-2 text-muted-foreground">
                                              <Calendar className="h-4 w-4"/>
                                              <span>Fecha Cumplimiento: <span className="font-semibold text-foreground">{formatDate(item.completionDate)}</span></span>
                                          </div>
                                      </div>
                                  </div>
                              );
                          })}
                      </PanelCard>

                   <PanelCard
              title="Observaciones del Supervisor"
              icon={ClipboardCheck}
            >
                          <p className="rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                              {checklist.observations || "Sin observaciones."}
                          </p>
                      </PanelCard>

                   <PanelCard
              title="Evidencia Fotográfica"
              description="Fotos adjuntadas por el supervisor durante la inspección."
              icon={ClipboardCheck}
            >
                          {checklist.evidencePhotos && checklist.evidencePhotos.length > 0 ? (
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                  {checklist.evidencePhotos.map((photo: string, index: number) => (
                                      <div key={index} className="relative aspect-video group">
                                          <Image src={photo} alt={`Evidencia ${index + 1}`} layout="fill" className="object-cover rounded-md" />
                                      </div>
                                  ))}
                              </div>
                          ) : (
                              <p className="text-sm text-muted-foreground italic">No se adjuntaron fotos.</p>
                          )}
                      </PanelCard>
              </div>

              <div className="lg:col-span-1 space-y-8 sticky top-8">
                  <PanelCard title="Firma del Supervisor" icon={ClipboardCheck}>
                        {/* Fondo blanco fijo: la firma se dibuja en tinta negra. */}
                        <div className="relative h-32 w-full rounded-md border border-border bg-white">
                            {checklist.performedBy?.signature ? (
                                <Image src={checklist.performedBy.signature} layout="fill" alt="Firma del supervisor" className="object-contain p-2" />
                            ) : (
                                <p className="flex h-full items-center justify-center text-sm text-muted-foreground">No se registró firma.</p>
                            )}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                            <p>Realizado por: <span className="font-medium text-foreground">{supervisor?.name}</span></p>
                            <p>Fecha: {formatDate(checklist.completedAt, true)}</p>
                        </div>
                  </PanelCard>

                  <PanelCard
              title="Acciones de Revisión"
              description="Aprueba o rechaza el checklist. Tu firma y notas quedarán registradas."
              icon={ClipboardCheck}
              contentClassName="space-y-4"
            >
                           <div>
                               <Label htmlFor="rejectionNotes">Notas de Revisión (Obligatorio si se rechaza)</Label>
                               <Textarea 
                                   id="rejectionNotes"
                                   placeholder="Ej: Faltan fotos del sector norte, el ítem 3 no está completo..."
                                   value={rejectionNotes}
                                   onChange={(e) => setRejectionNotes(e.target.value)}
                                   disabled={isSubmitting || isReviewed}
                               />
                           </div>
                           
                           <div>
                                <Label>Firma del Revisor (APR)</Label>
                                <div className="w-full h-40 border rounded-md bg-white relative">
                                    {isReviewed && aprSignature ? (
                                        <Image src={aprSignature} layout="fill" alt="Firma del APR" className="object-contain p-2"/>
                                    ) : (
                                        <SignaturePad 
                                            ref={signaturePadRef} 
                                            onEnd={() => setAprSignature(signaturePadRef.current?.getTrimmedCanvas().toDataURL('image/png'))}
                                        />
                                    )}
                                </div>
                                {(isReviewed && checklist.reviewedBy?.date) && (
                                    <p className="text-xs text-muted-foreground text-center mt-1">
                                        Revisado el: {formatDate(checklist.reviewedBy.date, true)}
                                    </p>
                                )}
                           </div>

                           {!isReviewed && (
                             <div className="flex gap-2">
                               <Button variant="destructive" className="flex-1" onClick={() => handleReview('rejected')} disabled={isSubmitting}>
                                   {isSubmitting ? <Loader2 className="mr-2 animate-spin"/> : <ThumbsDown className="mr-2"/>} Rechazar
                               </Button>
                               <Button className="flex-1 bg-success text-background hover:bg-success/90" onClick={() => handleReview('approved')} disabled={isSubmitting}>
                                   {isSubmitting ? <Loader2 className="mr-2 animate-spin"/> : <ThumbsUp className="mr-2"/>} Aprobar
                               </Button>
                             </div>
                           )}
                      </PanelCard>
              </div>
            </div>

        </div>
    );
}
