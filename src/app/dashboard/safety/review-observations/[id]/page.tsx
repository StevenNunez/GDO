"use client";

import React, { useMemo } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useAppState } from "@/modules/core/contexts/app-provider";
import { PageHeader } from "@/components/page-header";
import { ObservationRiskBadge } from '@/components/safety/safety-badges';
import { PanelCard } from "@/components/ui/panel-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Eye, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/modules/core/hooks/use-toast";
import { generateBehaviorObservationPDF } from "@/lib/behavior-observation-pdf-generator";
import { toDate } from "@/lib/date-utils";
import { EnviarDocumento } from '@/components/enviar-documento';

const formatDate = (date: Date | string | undefined | null) => {
    const jsDate = toDate(date);
    if (!jsDate) return 'N/A';
    return format(jsDate, "d 'de' MMMM, yyyy", { locale: es });
};

export default function BehaviorObservationDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { behaviorObservations, isLoading } = useAppState();
    const { toast } = useToast();
    
    const observationId = params.id as string;

    const observation = useMemo(() => {
        if (!behaviorObservations) return null;
        return behaviorObservations.find(o => o.id === observationId) || null;
    }, [behaviorObservations, observationId]);

    const handleDownloadPDF = async () => {
        if (!observation) return;
        try {
            await generateBehaviorObservationPDF(observation);
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error al generar PDF', description: error.message });
        }
    };

    if (isLoading) {
        return <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    if (!observation) {
        return (
            <div>
                <Button variant="ghost" onClick={() => router.back()}><ArrowLeft className="mr-2"/> Volver</Button>
                <PageHeader title="Observación no encontrada" description="La observación que buscas no existe o fue eliminada." />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                 <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <PageHeader title={`Observación a ${observation.workerName}`} description={`Obra: ${observation.obra} - Fecha: ${formatDate(observation.observationDate)}`} className="mb-0"/>
                 </div>
                 <div className="flex items-center gap-4">
                    <Button variant="outline" onClick={handleDownloadPDF}>
                        <Download className="mr-2"/> Descargar PDF
                    </Button>
                    <EnviarDocumento
                        size="default"
                        fileName="Observacion_conducta.pdf"
                        asuntoSugerido="Observación de conducta"
                        descripcionDestinatario="quien lo necesite"
                        mensajeSugerido="Adjuntamos la observación de conducta registrada."
                        generarPdf={() => generateBehaviorObservationPDF(observation, 'blob')}
                    />
                    <ObservationRiskBadge level={observation.riskLevel} />
                 </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              <div className="lg:col-span-2 space-y-8">
                  <PanelCard
              title="Detalles de la Observación de Conducta"
              icon={Eye}
              contentClassName="space-y-6"
            >
                          {observation.items.map((item, index) => (
                              <div key={index} className="p-4 border rounded-lg space-y-3 bg-muted/30">
                                  <p className="font-semibold">{index + 1}. {item.question}</p>
                                  <div className="flex items-center gap-4 text-sm">
                                      <span className="font-medium">Respuesta:</span>
                                      {item.status === 'si' && <StatusBadge tone="success">Sí</StatusBadge>}
                                      {item.status === 'no' && <StatusBadge tone="danger">No</StatusBadge>}
                                      {item.status === 'na' && <StatusBadge tone="neutral">N/A</StatusBadge>}
                                  </div>
                              </div>
                          ))}
                      </PanelCard>

                   <PanelCard
              title="Retroalimentación Entregada"
              icon={Eye}
            >
                          <p className="text-sm text-muted-foreground p-4 border rounded-md bg-muted/20 min-h-[80px]">
                              {observation.feedback || "Sin retroalimentación."}
                          </p>
                      </PanelCard>
              </div>

              <div className="lg:col-span-1 space-y-8 sticky top-8">
                  <PanelCard
              title="Firma del Observador"
              icon={Eye}
            >
                           <div className="p-2 border rounded-md bg-white">
                                {observation.observerSignature ? (
                                    <Image src={observation.observerSignature} alt="Firma del observador" width={300} height={150} className="mx-auto" />
                                ) : (
                                    <p className="text-center text-sm text-muted-foreground p-4">No se registró firma.</p>
                                )}
                            </div>
                            <div className="mt-2 text-xs text-center text-muted-foreground">
                                <p>Observador: {observation.observerName}</p>
                            </div>
                        </PanelCard>
                  
                  <PanelCard
              title="Firma del Trabajador"
              icon={Eye}
            >
                           <div className="p-2 border rounded-md bg-white">
                                {observation.workerSignature ? (
                                    <Image src={observation.workerSignature} alt="Firma del trabajador" width={300} height={150} className="mx-auto" />
                                ) : (
                                    <p className="text-center text-sm text-muted-foreground p-4">No se registró firma.</p>
                                )}
                            </div>
                             <div className="mt-2 text-xs text-center text-muted-foreground">
                                <p>Trabajador: {observation.workerName}</p>
                            </div>
                        </PanelCard>
              </div>
            </div>
        </div>
    );
}
