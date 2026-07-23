
"use client";

import React, { useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { TaskStatusBadge } from '@/components/safety/safety-badges';
import { useAppState, useAuth } from "@/modules/core/contexts/app-provider";
import { PanelCard } from "@/components/ui/panel-card";
import { ArrowRight, Inbox, ListChecks } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import Link from "next/link";
import type { AssignedSafetyTask } from "@/modules/core/lib/data";
import { toDate } from "@/lib/date-utils";

// Helper para formatear fechas
const formatDate = (date: Date | string | undefined | null) => {
    const jsDate = toDate(date);
    if (!jsDate) return 'N/A';
    return jsDate.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
};


export default function SupervisorAssignedChecklistsPage() {
    const { assignedChecklists } = useAppState();
    const { user } = useAuth();

    const myAssignedChecklists = useMemo(() => {
        if (!user || !assignedChecklists) return [];
        return assignedChecklists
            .filter((c: AssignedSafetyTask) => c.supervisorId === user.id)
            .sort((a: AssignedSafetyTask, b: AssignedSafetyTask) => {
                const dateA = toDate(a.createdAt)?.getTime() || 0;
                const dateB = toDate(b.createdAt)?.getTime() || 0;
                return dateB - dateA;
            });
    }, [assignedChecklists, user]);

    return (
        <div className="flex flex-col gap-8 pb-10">
            <PageHeader
                title="Mis Checklists Asignados"
                description="Aquí encontrarás todos los formularios y checklists que necesitas completar."
            />

            <PanelCard
                title="Tareas Pendientes"
                description="Selecciona un checklist de la lista para comenzar a completarlo. Los checklists completados se enviarán para su revisión."
                icon={ListChecks}
            >
                    <ScrollArea className="h-[calc(80vh-12rem)]">
                        {myAssignedChecklists.length > 0 ? (
                            <div className="space-y-3 p-4">
                                {myAssignedChecklists.map((checklist: AssignedSafetyTask) => (
                                    <Link 
                                        key={checklist.id} 
                                        href={`/dashboard/safety/assigned-checklists/${checklist.id}`}
                                        className="flex cursor-pointer flex-col gap-4 rounded-xl border border-border bg-muted/40 p-4 transition-colors hover:bg-muted sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="flex-grow">
                                            <h4 className="font-semibold">{checklist.templateTitle}</h4>
                                            <p className="text-sm text-muted-foreground">Obra/Proyecto: <span className="font-medium">{checklist.area}</span></p>
                                            <p className="text-xs text-muted-foreground mt-1">Asignado el: {formatDate(checklist.createdAt)}</p>
                                        </div>
                                        <div className="flex items-center gap-4 flex-shrink-0">
                                            <TaskStatusBadge status={checklist.status} />
                                            <ArrowRight className="h-5 w-5 text-muted-foreground"/>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center text-center text-muted-foreground h-full p-12">
                                <Inbox className="mb-4 h-16 w-16 opacity-50"/>
                                <h3 className="text-xl font-bold tracking-tight">¡Todo al día!</h3>
                                <p className="mt-2">No tienes checklists pendientes asignados en este momento.</p>
                            </div>
                        )}
                    </ScrollArea>
                </PanelCard>
        </div>
    );
}
