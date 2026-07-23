
"use client";

import React, { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { useAppState, useAuth } from "@/modules/core/contexts/app-provider";
import { PanelCard } from "@/components/ui/panel-card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, CheckCircle, Edit, FileText } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/modules/core/hooks/use-toast";
import { toDate } from "@/lib/date-utils";

const formatDate = (date: Date | string | undefined | null) => {
    const jsDate = toDate(date);
    if (!jsDate) return 'N/A';
    return format(jsDate, "d 'de' MMMM, yyyy", { locale: es });
};

export default function SignDailyTalkPage() {
    const params = useParams();
    const router = useRouter();
    const { dailyTalks, isLoading, signDailyTalk } = useAppState();
    const { user } = useAuth();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const talkId = params.id as string;

    const talk = useMemo(() => {
        if (!dailyTalks) return null;
        return dailyTalks.find(o => o.id === talkId) || null;
    }, [dailyTalks, talkId]);
    
    const attendeeInfo = useMemo(() => {
        if (!talk || !user) return null;
        return talk.asistentes.find(a => a.id === user.id);
    }, [talk, user]);


    const handleSign = async () => {
        setIsSubmitting(true);
        try {
            await signDailyTalk(talkId);
            toast({
                title: "¡Charla Firmada!",
                description: "Gracias por confirmar tu asistencia.",
            });
            router.push('/dashboard/worker');
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: "Error al firmar",
                description: error.message || "No se pudo registrar tu firma."
            });
        } finally {
            setIsSubmitting(false);
        }
    }
    
    if (isLoading) {
        return <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    if (!talk) {
        return (
            <div>
                <Button variant="ghost" onClick={() => router.back()}><ArrowLeft className="mr-2"/> Volver</Button>
                <PageHeader title="Charla no encontrada" description="El registro que buscas no existe o fue eliminado." />
            </div>
        );
    }
    
    if (!attendeeInfo) {
         return (
            <div>
                <Button variant="ghost" onClick={() => router.back()}><ArrowLeft className="mr-2"/> Volver</Button>
                <PageHeader title="No estás en la lista" description="No estás registrado como asistente para esta charla." />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-8 max-w-2xl mx-auto">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <PageHeader title="Confirmar Asistencia" description={`Charla de seguridad del ${formatDate(talk.fecha)}`} className="mb-0"/>
            </div>

            <PanelCard title="Detalles de la Charla" icon={FileText} contentClassName="space-y-4">
                    <div>
                        <p className="text-sm font-semibold text-muted-foreground">Expositor</p>
                        <p>{talk.expositorName}</p>
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-muted-foreground">Temas Tratados</p>
                        <p className="mt-1 rounded-md bg-muted/50 p-3 text-sm">{talk.temas}</p>
                    </div>
            </PanelCard>

            {attendeeInfo.signed ? (
                 <div className="rounded-3xl border border-success/30 bg-success/5 p-6 text-center">
                        <CheckCircle className="mx-auto mb-2 h-12 w-12 text-success"/>
                        <p className="text-lg font-bold tracking-tight text-success">Ya has firmado esta charla</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Tu asistencia fue confirmada el {formatDate(attendeeInfo.signedAt)}.
                        </p>
                </div>
            ) : (
                 <PanelCard
                    title="Confirmación de Firma"
                    description={`Al hacer clic en "Leer y Firmar", confirmas que has asistido y comprendido los temas tratados en esta charla de seguridad. Tu firma quedará registrada con tu nombre de usuario y la fecha actual.`}
                    icon={Edit}
                    footer={
                        <Button className="w-full" size="lg" onClick={handleSign} disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <Edit className="mr-2 h-5 w-5"/>}
                            Leer y Firmar Digitalmente
                        </Button>
                    }
                 >
                    <></>
                </PanelCard>
            )}
        </div>
    );
}
