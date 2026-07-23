
"use client";

import React, { useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { ObservationRiskBadge } from '@/components/safety/safety-badges';
import { useAppState } from "@/modules/core/contexts/app-provider";
import { PanelCard } from "@/components/ui/panel-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Inbox, ArrowRight, Eye } from "lucide-react";
import Link from "next/link";
import type { BehaviorObservation } from "@/modules/core/lib/data";
import { toDate } from "@/lib/date-utils";

const formatDate = (date: Date | string | undefined | null) => {
    const jsDate = toDate(date);
    if (!jsDate) return 'N/A';
    return jsDate.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function ReviewBehaviorObservationsPage() {
    const { behaviorObservations, isLoading } = useAppState();

    const sortedObservations = useMemo(() => {
        if (!behaviorObservations) return [];
        return [...behaviorObservations].sort((a, b) => {
            const dateA = toDate(a.observationDate)?.getTime() || 0;
            const dateB = toDate(b.observationDate)?.getTime() || 0;
            return dateB - dateA;
        });
    }, [behaviorObservations]);

    if (isLoading) {
        return <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    return (
        <div className="flex flex-col gap-8 pb-10">
            <PageHeader
                title="Revisión de Observaciones de Conducta"
                description="Aquí puedes ver todos los formularios de observación de conducta que se han registrado."
            />

            <PanelCard
                title="Historial de Observaciones"
                description="Selecciona una observación para ver los detalles completos y descargar el informe en PDF."
                icon={Eye}
            >
                    <ScrollArea className="h-[calc(80vh-12rem)]">
                        {sortedObservations.length > 0 ? (
                            <div className="space-y-3 p-4">
                                {sortedObservations.map((obs: BehaviorObservation) => (
                                    <Link key={obs.id} href={`/dashboard/safety/review-observations/${obs.id}`} >
                                        <div className="flex cursor-pointer flex-col gap-4 rounded-xl border border-border bg-muted/40 p-4 transition-colors hover:bg-muted sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex-grow">
                                                <h4 className="font-semibold">Observación a: {obs.workerName}</h4>
                                                <p className="text-sm text-muted-foreground">Obra: <span className="font-medium">{obs.obra}</span></p>
                                                <p className="text-xs text-muted-foreground mt-1">Registrado por: {obs.observerName} el {formatDate(obs.observationDate)}</p>
                                            </div>
                                            <div className="flex items-center gap-4 flex-shrink-0">
                                                <ObservationRiskBadge level={obs.riskLevel} />
                                                <ArrowRight className="h-5 w-5 text-muted-foreground"/>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                             <div className="flex flex-col items-center justify-center text-center text-muted-foreground h-full p-12">
                                <Inbox className="mb-4 h-16 w-16 opacity-50"/>
                                <h3 className="text-xl font-bold tracking-tight">No hay observaciones</h3>
                                <p className="mt-2">Aún no se ha registrado ninguna observación de conducta.</p>
                            </div>
                        )}
                    </ScrollArea>
                </PanelCard>
        </div>
    );
}
