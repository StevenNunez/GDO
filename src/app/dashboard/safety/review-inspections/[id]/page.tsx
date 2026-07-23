"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useAppState, useAuth } from "@/modules/core/contexts/app-provider";
import { PageHeader } from "@/components/page-header";
import { TaskStatusBadge, InspectionRiskBadge } from '@/components/safety/safety-badges';
import { PanelCard } from "@/components/ui/panel-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Download, Loader2, ShieldAlert, ThumbsDown, ThumbsUp } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import SignaturePad from "@/components/signature-pad";
import { useToast } from "@/modules/core/hooks/use-toast";
import type { SafetyInspection, User } from "@/modules/core/lib/data";
import { toDate } from "@/lib/date-utils";
import { generateInspectionPDF } from "@/lib/inspection-pdf-generator";


const formatDate = (date: Date | string | undefined | null, includeTime = false) => {
  const jsDate = toDate(date);
  if (!jsDate) return 'N/A';
  const formatString = includeTime ? "d 'de' MMMM, yyyy HH:mm" : "d 'de' MMMM, yyyy";
  return format(jsDate, formatString, { locale: es });
};

export default function ReviewInspectionPage() {
    const params = useParams();
    const router = useRouter();
    const { safetyInspections, users, isLoading, reviewSafetyInspection } = useAppState();
    const { user } = useAuth();
    const { toast } = useToast();
    
    const signaturePadRef = useRef<any>(null);
    const inspectionId = params.id as string;

    const inspection = useMemo(() => {
        if (!safetyInspections) return null;
        return safetyInspections.find((i: SafetyInspection) => i.id === inspectionId) || null;
    }, [safetyInspections, inspectionId]);

    const [rejectionNotes, setRejectionNotes] = useState( (inspection as any)?.rejectionNotes || "");
    const [aprSignature, setAprSignature] = useState<string | null>((inspection as any)?.reviewedBy?.signature || null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const supervisor = useMemo(() => {
        if (!inspection) return null;
        return (users || []).find((u: User) => u.id === inspection.assignedTo);
    }, [inspection, users]);
    
    const aprUser = useMemo(() => {
        if (!inspection) return null;
        return (users || []).find((u: User) => u.id === inspection.inspectorId);
    }, [inspection, users]);

    const handleReview = async (status: 'approved' | 'rejected') => {
        if (!inspection) return;
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
            await reviewSafetyInspection(inspectionId, status, rejectionNotes, aprSignature);
            toast({ title: `Inspección ${status === 'approved' ? 'aprobada' : 'rechazada'}`, description: 'El estado ha sido guardado.' });
            router.push('/dashboard/safety/review-inspections');
        } catch(error: any) {
             toast({ variant: 'destructive', title: 'Error al Revisar', description: error.message || 'No se pudo completar la acción.' });
        } finally {
            setIsSubmitting(false);
        }
    }
    
    const handleDownloadPDF = async () => {
        if (!inspection) return;
        
        // Use fallback data if user objects are not found
        const supervisorData = supervisor || { id: inspection.assignedTo, name: inspection.completionExecutor || 'Usuario no encontrado' } as User;
        const aprData = aprUser || { id: inspection.inspectorId, name: inspection.inspectorName || 'Inspector no encontrado' } as User;

        try {
            await generateInspectionPDF(inspection, supervisorData, aprData);
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error al generar PDF', description: error.message });
        }
    };


    if (isLoading) {
        return <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    if (!inspection) {
        return (
            <div>
                <Button variant="ghost" onClick={() => router.back()}><ArrowLeft className="mr-2"/> Volver</Button>
                <PageHeader title="Inspección no encontrada" description="La inspección que buscas no existe o fue eliminada." />
            </div>
        );
    }
    
    const isReviewed = inspection.status === 'approved' || inspection.status === 'rejected';

    return (
        <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                 <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <PageHeader title="Revisar Inspección de Seguridad" description={`Obra: ${inspection.area}`} className="mb-0"/>
                 </div>
                 <div className="flex items-center gap-4">
                    {(isReviewed || inspection.status === 'completed') && (
                        <Button variant="outline" onClick={handleDownloadPDF}>
                            <Download className="mr-2"/> Descargar PDF
                        </Button>
                    )}
                    <TaskStatusBadge status={inspection.status} review />
                 </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              <div className="lg:col-span-2 space-y-8">
                   <PanelCard
                      title="Parte 1: Observación Detectada"
                      icon={ShieldAlert}
                      contentClassName="space-y-4"
                      actions={<InspectionRiskBadge level={inspection.riskLevel} withPrefix />}
                   >
                        <div>
                            <h4 className="text-sm font-semibold">Descripción:</h4>
                            <p className="mt-1 rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">{inspection.description}</p>
                        </div>
                        <div>
                            <h4 className="text-sm font-semibold">Plan de Acción:</h4>
                            <p className="mt-1 rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">{inspection.actionPlan || 'No especificado'}</p>
                        </div>
                        {inspection.evidencePhotoUrl && (
                            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                                <div className="relative aspect-video">
                                    <Image src={inspection.evidencePhotoUrl} alt="Evidencia del problema" layout="fill" className="rounded-md object-cover" />
                                </div>
                            </div>
                        )}
                   </PanelCard>

                   <PanelCard
                      title="Parte 2: Cierre de la Observación"
                      icon={ShieldAlert}
                      tone="success"
                      contentClassName="space-y-4"
                   >
                        <div>
                            <h4 className="text-sm font-semibold">Notas de Cierre:</h4>
                            <p className="mt-1 rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">{inspection.completionNotes || 'Sin notas.'}</p>
                        </div>
                        {inspection.completionPhotos && inspection.completionPhotos.length > 0 && (
                            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                                {inspection.completionPhotos.map((photo: string, i: number) => (
                                    <div key={i} className="relative aspect-video">
                                        <Image src={photo} alt={`Solución ${i + 1}`} layout="fill" className="rounded-md object-cover" />
                                    </div>
                                ))}
                            </div>
                        )}
                        <div>
                            {/* Fondo blanco fijo: la firma se dibuja en tinta negra. */}
                            <div className="relative h-32 w-full rounded-md border border-border bg-white">
                                {inspection.completionSignature ? (
                                    <Image src={inspection.completionSignature} layout="fill" alt="Firma de cierre" className="object-contain p-2" />
                                ) : (
                                    <p className="flex h-full items-center justify-center text-sm text-muted-foreground">No se registró firma de cierre.</p>
                                )}
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                                <p>Cerrado por: <span className="font-medium text-foreground">{inspection.completionExecutor || 'Desconocido'}</span></p>
                                <p>Fecha: {formatDate(inspection.completedAt, true)}</p>
                            </div>
                        </div>
                   </PanelCard>
              </div>

              <div className="lg:col-span-1 space-y-8 sticky top-8">
                   <PanelCard title="Detalles de Asignación" icon={ShieldAlert} contentClassName="space-y-2 text-sm">
                        <p className="text-muted-foreground">Reportado por: <span className="font-medium text-foreground">{aprUser?.name || inspection.inspectorName}</span></p>
                        <p className="text-muted-foreground">Asignado a: <span className="font-medium text-foreground">{supervisor?.name || 'Usuario no encontrado'}</span></p>
                        <p className="text-muted-foreground">Fecha de Reporte: <span className="font-medium text-foreground">{formatDate(inspection.date)}</span></p>
                   </PanelCard>

                   <PanelCard
              title="Acciones de Revisión Final"
              description="Aprueba o rechaza la solución implementada."
              icon={ShieldAlert}
              contentClassName="space-y-4"
            >
                           <div>
                               <Label htmlFor="rejectionNotes">Notas de Revisión (Obligatorio si se rechaza)</Label>
                               <Textarea 
                                   id="rejectionNotes"
                                   placeholder="Ej: La solución no es adecuada, se debe mejorar..."
                                   value={rejectionNotes}
                                   onChange={(e) => setRejectionNotes(e.target.value)}
                                   disabled={isSubmitting || isReviewed}
                               />
                           </div>
                           
                           <div>
                                <Label>Firma del Revisor (APR/Admin)</Label>
                                <div className="w-full h-40 border rounded-md bg-white relative">
                                    {isReviewed && aprSignature ? (
                                        <Image src={aprSignature} layout="fill" alt="Firma del Revisor" className="object-contain p-2"/>
                                    ) : (
                                        <SignaturePad 
                                            ref={signaturePadRef} 
                                            onEnd={() => setAprSignature(signaturePadRef.current?.getTrimmedCanvas().toDataURL('image/png'))}
                                        />
                                    )}
                                </div>
                                {(isReviewed && inspection.reviewedBy?.date) && (
                                    <p className="text-xs text-muted-foreground text-center mt-1">
                                        Revisado el: {formatDate(inspection.reviewedBy.date, true)}
                                    </p>
                                )}
                           </div>

                           {!isReviewed && (
                            <div className="flex gap-2">
                                <Button variant="destructive" className="flex-1" onClick={() => handleReview('rejected')} disabled={isSubmitting}>
                                    {isSubmitting ? <Loader2 className="mr-2 animate-spin"/> : <ThumbsDown className="mr-2"/>} Rechazar
                                </Button>
                                <Button className="flex-1 bg-success text-background hover:bg-success/90" onClick={() => handleReview('approved')} disabled={!aprSignature || isSubmitting}>
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
