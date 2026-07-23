
"use client";

import React, { useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { TaskStatusBadge, InspectionRiskBadge } from '@/components/safety/safety-badges';
import { useAppState, useAuth } from "@/modules/core/contexts/app-provider";
import { PanelCard } from "@/components/ui/panel-card";
import { ArrowRight, Inbox, ShieldAlert } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import Link from "next/link";
import { type SafetyInspection, type User } from "@/modules/core/lib/data";
import { toDate } from "@/lib/date-utils";

const formatDate = (date: Date | string | undefined | null) => {
    const jsDate = toDate(date);
    if (!jsDate) return 'N/A';
    return jsDate.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function AssignedInspectionsPage() {
    const { safetyInspections, users } = useAppState();
    const { user } = useAuth();

    const myAssignedInspections = useMemo(() => {
        if (!user || !safetyInspections) return [];
        return safetyInspections
            .filter((c: SafetyInspection) => c.assignedTo === user.id)
            .sort((a: SafetyInspection, b: SafetyInspection) => b.date.getTime() - a.date.getTime());
    }, [safetyInspections, user]);
    
    const userMap = useMemo(() => new Map<string, string>((users || []).map((u: User) => [u.id, u.name])), [users]);

    return (
        <div className="flex flex-col gap-8 pb-10">
            <PageHeader
                title="Mis Inspecciones de Seguridad Asignadas"
                description="Aquí encontrarás las tareas de seguridad que debes resolver."
            />

            <PanelCard
                title="Tareas Pendientes de Seguridad"
                description="Selecciona una inspección para ver los detalles y registrar la solución."
                icon={ShieldAlert}
            >
                    <ScrollArea className="h-[calc(80vh-12rem)]">
                        {myAssignedInspections.length > 0 ? (
                            <div className="space-y-3 p-4">
                                {myAssignedInspections.map((inspection: SafetyInspection) => (
                                    <Link 
                                        key={inspection.id} 
                                        href={`/dashboard/safety/assigned-inspections/${inspection.id}`}
                                        className="flex cursor-pointer flex-col gap-4 rounded-xl border border-border bg-muted/40 p-4 transition-colors hover:bg-muted sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="flex-grow">
                                            <p className="font-semibold text-primary">{inspection.area} - {inspection.location}</p>
                                            <p className="text-sm font-medium text-foreground truncate">{inspection.description}</p>
                                            <p className="text-xs text-muted-foreground mt-1">Asignado por: {userMap.get(inspection.inspectorId) || 'Desconocido'}</p>
                                            <p className="text-xs text-muted-foreground">Fecha: {formatDate(inspection.date)}</p>
                                        </div>
                                        <div className="flex items-center gap-4 flex-shrink-0">
                                            <InspectionRiskBadge level={inspection.riskLevel} />
                                            <TaskStatusBadge status={inspection.status} />
                                            <ArrowRight className="h-5 w-5 text-muted-foreground"/>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center text-center text-muted-foreground h-full p-12">
                                <Inbox className="mb-4 h-16 w-16 opacity-50"/>
                                <h3 className="text-xl font-bold tracking-tight">¡Todo en orden!</h3>
                                <p className="mt-2">No tienes inspecciones de seguridad pendientes en este momento.</p>
                            </div>
                        )}
                    </ScrollArea>
                </PanelCard>
        </div>
    );
}
