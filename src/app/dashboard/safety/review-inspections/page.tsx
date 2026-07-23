
"use client";

import React, { useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { TaskStatusBadge, InspectionRiskBadge } from '@/components/safety/safety-badges';
import { useAppState } from "@/modules/core/contexts/app-provider";
import { PanelCard } from "@/components/ui/panel-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Inbox, ArrowRight, ShieldAlert } from "lucide-react";
import Link from "next/link";
import type { SafetyInspection, User } from "@/modules/core/lib/data";
import { toDate } from "@/lib/date-utils";

const formatDate = (date: Date | string | undefined | null) => {
    const jsDate = toDate(date);
    if (!jsDate) return 'N/A';
    return jsDate.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function ReviewInspectionsPage() {
    const { safetyInspections, users, isLoading } = useAppState();
    
    const userMap = useMemo(() => new Map<string, string>((users || []).map((u: User) => [u.id, u.name])), [users]);

    const inspectionsToReview = useMemo(() => {
        if (!safetyInspections) return [];
        return (safetyInspections as SafetyInspection[])
            .filter((i: SafetyInspection) => i.status === 'completed' || i.status === 'approved' || i.status === 'rejected')
            .sort((a: SafetyInspection, b: SafetyInspection) => {
                const dateA = (a.completedAt || a.date);
                const dateB = (b.completedAt || b.date);
                const timeA = toDate(dateA)?.getTime() || 0;
                const timeB = toDate(dateB)?.getTime() || 0;
                return timeB - timeA;
            });
    }, [safetyInspections]);

    if (isLoading) {
        return <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    return (
        <div className="flex flex-col gap-8 pb-10">
            <PageHeader
                title="Revisión de Inspecciones de Seguridad"
                description="Aprueba o rechaza las soluciones implementadas por los supervisores."
            />

            <PanelCard
                title="Bandeja de Revisiones de Inspecciones"
                description="Las inspecciones completadas por los supervisores aparecerán aquí para tu aprobación final."
                icon={ShieldAlert}
            >
                    <ScrollArea className="h-[calc(80vh-12rem)]">
                        {inspectionsToReview.length > 0 ? (
                            <div className="space-y-3 p-4">
                                {inspectionsToReview.map((inspection: SafetyInspection) => (
                                    <Link key={inspection.id} href={`/dashboard/safety/review-inspections/${inspection.id}`} >
                                        <div className="flex cursor-pointer flex-col gap-4 rounded-xl border border-border bg-muted/40 p-4 transition-colors hover:bg-muted sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex-grow">
                                                <p className="font-semibold text-primary">{inspection.description}</p>
                                                <p className="text-sm text-muted-foreground">Obra: <span className="font-medium">{inspection.area}</span></p>
                                                <p className="text-sm text-muted-foreground">Cerrado por: <span className="font-medium">{inspection.completionExecutor || 'Desconocido'}</span></p>
                                                <p className="text-xs text-muted-foreground mt-1">Fecha de Cierre: {formatDate(inspection.completedAt)}</p>
                                            </div>
                                            <div className="flex items-center gap-4 flex-shrink-0">
                                                <InspectionRiskBadge level={inspection.riskLevel} />
                                                <TaskStatusBadge status={inspection.status} review />
                                                <ArrowRight className="h-5 w-5 text-muted-foreground"/>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                             <div className="flex flex-col items-center justify-center text-center text-muted-foreground h-full p-12">
                                <Inbox className="mb-4 h-16 w-16 opacity-50"/>
                                <h3 className="text-xl font-bold tracking-tight">Bandeja Vacía</h3>
                                <p className="mt-2">No hay inspecciones pendientes de revisión en este momento.</p>
                            </div>
                        )}
                    </ScrollArea>
                </PanelCard>
        </div>
    );
}
