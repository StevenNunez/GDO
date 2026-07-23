
"use client";

import React, { useMemo } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { InspectionRiskBadge } from '@/components/safety/safety-badges';
import { PanelCard } from '@/components/ui/panel-card';
import { StatTile } from '@/components/ui/stat-tile';
import { ListChecks, CheckCircle, ArrowRight, Inbox, ShieldAlert, MessageSquare } from 'lucide-react';
import { useAppState, useAuth } from '@/modules/core/contexts/app-provider';
import { Button } from '@/components/ui/button';
import { isPast, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { AssignedSafetyTask, SafetyInspection, User } from '@/modules/core/lib/data';
import { toDate } from '@/lib/date-utils';

const formatDate = (date: Date | string | undefined | null) => {
    const jsDate = toDate(date);
    if (!jsDate) return 'N/A';
    return jsDate.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function SafetyDashboardPage() {
    const { user } = useAuth();
    const { assignedChecklists, safetyInspections, users, can } = useAppState();

    const stats = useMemo(() => {
        const safeChecklists: AssignedSafetyTask[] = assignedChecklists || [];
        const safeInspections: SafetyInspection[] = safetyInspections || [];
        const totalChecklists = safeChecklists.length;
        const totalInspections = safeInspections.length;
        
        if (totalChecklists === 0 && totalInspections === 0) {
            return { 
                totalChecklists: 0, assigned: 0, forReview: 0, approved: 0,
                totalInspections: 0, inspectionsOpen: 0, inspectionsOverdue: 0,
            };
        }

        const assigned = safeChecklists.filter((c: AssignedSafetyTask) => c.status === 'assigned').length;
        const forReview = safeChecklists.filter((c: AssignedSafetyTask) => c.status === 'completed').length;
        const approved = safeChecklists.filter((c: AssignedSafetyTask) => c.status === 'approved').length;
        
        const inspectionsOpen = safeInspections.filter((i: SafetyInspection) => i.status === 'open').length;
        const inspectionsOverdue = safeInspections.filter((i: SafetyInspection) => {
            if (i.status !== 'open' || !i.deadline) return false;
            const deadlineDate = toDate(i.deadline) || new Date(i.deadline);
            return isPast(deadlineDate);
        }).length;

        return { 
            totalChecklists, assigned, forReview, approved,
            totalInspections, inspectionsOpen, inspectionsOverdue,
        };
    }, [assignedChecklists, safetyInspections]);

    const checklistsForReview = useMemo(() => {
        return (assignedChecklists || [])
            .filter((c: AssignedSafetyTask) => c.status === 'completed')
            .sort((a: AssignedSafetyTask, b: AssignedSafetyTask) => {
                const dateA = toDate(a.completedAt)?.getTime() || 0;
                const dateB = toDate(b.completedAt)?.getTime() || 0;
                return dateB - dateA;
            })
            .slice(0, 5);
    }, [assignedChecklists]);
    
    const openInspections = useMemo(() => {
         return (safetyInspections || [])
            .filter((c: SafetyInspection) => c.status === 'open')
            .sort((a: SafetyInspection, b: SafetyInspection) => {
                const deadlineA = a.deadline ? a.deadline.getTime() : Infinity;
                const deadlineB = b.deadline ? b.deadline.getTime() : Infinity;
                return deadlineA - deadlineB;
            })
            .slice(0, 5);
    }, [safetyInspections]);

    const myRecentTasks = useMemo(() => {
        if (!user) return { checklists: [], inspections: [] };
        const myChecklists = (assignedChecklists || [])
            .filter((c: AssignedSafetyTask) => c.supervisorId === user.id && c.status === 'assigned')
            .sort((a: AssignedSafetyTask, b: AssignedSafetyTask) => {
                const dateA = toDate(a.createdAt)?.getTime() || 0;
                const dateB = toDate(b.createdAt)?.getTime() || 0;
                return dateB - dateA;
            })
            .slice(0, 3);
        
        const myInspections = (safetyInspections || [])
            .filter((i: SafetyInspection) => i.assignedTo === user.id && i.status === 'open')
            .sort((a: SafetyInspection,b: SafetyInspection) => {
                const deadlineA = a.deadline ? a.deadline.getTime() : Infinity;
                const deadlineB = b.deadline ? b.deadline.getTime() : Infinity;
                return deadlineA - deadlineB;
            })
            .slice(0, 3);
            
        return { checklists: myChecklists, inspections: myInspections };
    }, [assignedChecklists, safetyInspections, user]);

    const userMap = useMemo(() => new Map<string, string>((users || []).map((u: User) => [u.id, u.name])), [users]);

    const canReview = can('safety_checklists:review') || can('safety_inspections:review');
    const canBeAssigned = can('safety_checklists:complete') || can('safety_inspections:complete');

    return (
        <div className="flex flex-col gap-8 pb-10">
            <PageHeader
                title="Resumen de Prevención de Riesgos"
                description="Vista general del estado de los checklists e inspecciones de seguridad en la obra."
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatTile label="Inspecciones Abiertas" value={stats.inspectionsOpen} icon={ShieldAlert} sub="Tareas de seguridad activas." />
                <StatTile label="Inspecciones Vencidas" value={stats.inspectionsOverdue} icon={ShieldAlert} tone="danger" sub="Tareas fuera de plazo." />
                <StatTile label="Checklists Pendientes" value={stats.assigned} icon={ListChecks} tone="warning" sub="Formularios por completar." />
                <StatTile label="Checklists para Revisión" value={stats.forReview} icon={CheckCircle} tone="info" sub="Listos para tu aprobación." />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                 {/* Charla Diaria */}
                <PanelCard
                    className="lg:col-span-2 border-primary/40"
                    title="Charla Diaria de 5 Minutos"
                    description="Registra la charla de seguridad diaria para mantener un historial de los temas tratados y los asistentes."
                    icon={MessageSquare}
                    actions={
                        <Link href="/dashboard/safety/daily-talk">
                            <Button>Registrar Charla</Button>
                        </Link>
                    }
                >
                    <></>
                </PanelCard>

                {canReview && (
                     <PanelCard
                        title="Inspecciones Urgentes por Resolver"
                        description="Las tareas de seguridad abiertas más críticas o próximas a vencer."
                        icon={ShieldAlert}
                        tone="danger"
                     >
                            {openInspections.length > 0 ? (
                                <div className="space-y-3">
                                    {openInspections.map((i: SafetyInspection) => (
                                        <Link key={i.id} href={`/dashboard/safety/assigned-inspections/${i.id}`} className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-4 transition-colors hover:bg-muted">
                                            <div>
                                                <p className="font-semibold">{i.description}</p>
                                                <p className="text-sm text-muted-foreground">Asignado a: {userMap.get(i.assignedTo) || 'Desconocido'}</p>
                                                {i.deadline && <p className={`text-xs ${isPast(i.deadline) ? 'text-danger font-bold' : 'text-warning'}`}>
                                                    Vence {isPast(i.deadline) ? 'hace' : 'en'} {formatDistanceToNow(i.deadline, { locale: es, addSuffix: true })}
                                                </p>}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <InspectionRiskBadge level={i.riskLevel} />
                                                <ArrowRight className="h-5 w-5 text-muted-foreground" />
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center text-muted-foreground p-8">
                                    <Inbox className="mx-auto mb-2 h-12 w-12 opacity-50"/>
                                    <p>¡Todo en orden! No hay inspecciones de seguridad abiertas.</p>
                                </div>
                            )}
                    </PanelCard>
                )}

                {canReview && (
                    <PanelCard
                        title="Checklists Pendientes de Revisión"
                        description="Los últimos checklists completados por supervisores."
                        icon={CheckCircle}
                        tone="info"
                    >
                            {checklistsForReview.length > 0 ? (
                                <div className="space-y-3">
                                    {checklistsForReview.map((c: AssignedSafetyTask) => (
                                        <Link key={c.id} href={`/dashboard/safety/review-checklists/${c.id}`} className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-4 transition-colors hover:bg-muted">
                                            <div>
                                                <p className="font-semibold">{c.templateTitle}</p>
                                                <p className="text-sm text-muted-foreground">Completado por: {userMap.get(c.supervisorId) || 'Desconocido'}</p>
                                                <p className="text-xs text-muted-foreground">Fecha: {formatDate(c.completedAt)}</p>
                                            </div>
                                            <ArrowRight className="h-5 w-5 text-muted-foreground" />
                                        </Link>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center text-muted-foreground p-8">
                                    <Inbox className="mx-auto mb-2 h-12 w-12 opacity-50"/>
                                    <p>No hay checklists esperando revisión.</p>
                                </div>
                            )}
                    </PanelCard>
                )}
            </div>

            {canBeAssigned && (myRecentTasks.checklists.length > 0 || myRecentTasks.inspections.length > 0) && (
                <PanelCard
                    title="Mis Tareas de Seguridad Pendientes"
                    description="Un resumen de tus checklists e inspecciones asignadas."
                    icon={ListChecks}
                >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h4 className="font-semibold mb-2">Checklists por Completar</h4>
                                {myRecentTasks.checklists.length > 0 ? (
                                    <div className="space-y-2">
                                        {myRecentTasks.checklists.map((c: AssignedSafetyTask) => (
                                            <Link key={c.id} href={`/dashboard/safety/assigned-checklists/${c.id}`} className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-3 text-sm transition-colors hover:bg-muted">
                                                <span>{c.templateTitle}</span>
                                                <ArrowRight className="h-4 w-4"/>
                                            </Link>
                                        ))}
                                    </div>
                                ) : <p className="text-sm text-muted-foreground italic">No tienes checklists pendientes.</p>}
                            </div>
                             <div>
                                <h4 className="font-semibold mb-2">Inspecciones por Resolver</h4>
                                {myRecentTasks.inspections.length > 0 ? (
                                    <div className="space-y-2">
                                         {myRecentTasks.inspections.map((i: SafetyInspection) => (
                                            <Link key={i.id} href={`/dashboard/safety/assigned-inspections/${i.id}`} className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-3 text-sm transition-colors hover:bg-muted">
                                                <span className="truncate">{i.description}</span>
                                                <ArrowRight className="h-4 w-4"/>
                                            </Link>
                                        ))}
                                    </div>
                                ) : <p className="text-sm text-muted-foreground italic">No tienes inspecciones pendientes.</p>}
                            </div>
                        </div>
                </PanelCard>
            )}
        </div>
    );
}
