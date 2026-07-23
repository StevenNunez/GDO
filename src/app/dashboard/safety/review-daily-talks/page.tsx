"use client";

import React, { useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { useAppState } from "@/modules/core/contexts/app-provider";
import { PanelCard } from "@/components/ui/panel-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Inbox, ArrowRight, MessageSquare } from "lucide-react";
import Link from "next/link";
import type { DailyTalk } from "@/modules/core/lib/data";
import { toDate } from "@/lib/date-utils";

const formatDate = (date: Date | string | undefined | null) => {
    const jsDate = toDate(date);
    if (!jsDate) return 'N/A';
    return jsDate.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function ReviewDailyTalksPage() {
    const { dailyTalks, isLoading } = useAppState();

    const sortedTalks = useMemo(() => {
        if (!dailyTalks) return [];
        return [...dailyTalks].sort((a, b) => {
            const dateA = toDate(a.fecha)?.getTime() || 0;
            const dateB = toDate(b.fecha)?.getTime() || 0;
            return dateB - dateA;
        });
    }, [dailyTalks]);


    if (isLoading) {
        return <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    return (
        <div className="flex flex-col gap-8">
            <PageHeader
                title="Historial de Charlas Diarias"
                description="Aquí puedes ver todos los registros de charlas de 5 minutos."
            />

            <PanelCard
                title="Historial"
                description="Selecciona una charla para ver sus detalles y descargar el PDF."
                icon={MessageSquare}
            >
                    <ScrollArea className="h-[calc(80vh-12rem)]">
                        {sortedTalks.length > 0 ? (
                            <div className="space-y-3 p-4">
                                {sortedTalks.map((talk: DailyTalk) => (
                                    <Link key={talk.id} href={`/dashboard/safety/review-daily-talks/${talk.id}`} >
                                        <div className="flex cursor-pointer flex-col gap-4 rounded-xl border border-border bg-muted/40 p-4 transition-colors hover:bg-muted sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex-grow">
                                                <h4 className="font-semibold">Charla del {formatDate(talk.fecha)}</h4>
                                                <p className="text-sm text-muted-foreground">Obra: <span className="font-medium">{talk.obra}</span></p>
                                                <p className="text-sm text-muted-foreground">Expositor: <span className="font-medium">{talk.expositorName}</span></p>
                                            </div>
                                            <div className="flex items-center gap-4 flex-shrink-0">
                                                <ArrowRight className="h-5 w-5 text-muted-foreground"/>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                             <div className="flex flex-col items-center justify-center text-center text-muted-foreground h-full p-12">
                                <Inbox className="mb-4 h-16 w-16 opacity-50"/>
                                <h3 className="text-xl font-bold tracking-tight">Sin registros</h3>
                                <p className="mt-2">No se han registrado charlas diarias todavía.</p>
                            </div>
                        )}
                    </ScrollArea>
                </PanelCard>
        </div>
    );
}
