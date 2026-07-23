
"use client";

import React, { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useAppState } from "@/modules/core/contexts/app-provider";
import { PanelCard } from "@/components/ui/panel-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Loader2, ThumbsUp, ThumbsDown, CheckCircle, XCircle, Clock, HandCoins, History } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { toDate } from "@/lib/date-utils";
import { useToast } from "@/modules/core/hooks/use-toast";
import type { SalaryAdvance } from "@/modules/core/lib/data";
import { formatCLP } from "@/lib/format";

const getStatusBadge = (status: SalaryAdvance['status']) => {
    switch (status) {
        case 'pending':
            return <StatusBadge tone="warning" icon={Clock}>Pendiente</StatusBadge>;
        case 'approved':
            return <StatusBadge tone="success" icon={CheckCircle}>Aprobada</StatusBadge>;
        case 'rejected':
            return <StatusBadge tone="danger" icon={XCircle}>Rechazada</StatusBadge>;
        default:
            return <StatusBadge tone="neutral">{status}</StatusBadge>;
    }
};

export default function SalaryAdvancesPage() {
    const { salaryAdvances, approveSalaryAdvance, rejectSalaryAdvance } = useAppState();
    const { toast } = useToast();
    const [processingId, setProcessingId] = useState<string | null>(null);

    const { pending, processed } = useMemo(() => {
        const pendingRequests: SalaryAdvance[] = [];
        const processedRequests: SalaryAdvance[] = [];

        (salaryAdvances || []).forEach(req => {
            if (req.status === 'pending') {
                pendingRequests.push(req);
            } else {
                processedRequests.push(req);
            }
        });

        // Ordenar: pendientes por fecha más antigua, procesados por fecha más reciente
        pendingRequests.sort((a, b) => (a.requestedAt as any) - (b.requestedAt as any));
        processedRequests.sort((a, b) => (b.processedAt as any) - (a.processedAt as any));

        return { pending: pendingRequests, processed: processedRequests };
    }, [salaryAdvances]);

    const handleAction = async (id: string, action: 'approve' | 'reject') => {
        setProcessingId(id);
        try {
            if (action === 'approve') {
                await approveSalaryAdvance(id);
                toast({ title: 'Adelanto Aprobado', description: 'La solicitud ha sido marcada como aprobada.' });
            } else {
                await rejectSalaryAdvance(id);
                toast({ title: 'Adelanto Rechazado', description: 'La solicitud ha sido rechazada.', variant: 'destructive' });
            }
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        } finally {
            setProcessingId(null);
        }
    };
    
    return (
        <div className="flex flex-col gap-8 pb-10">
            <PageHeader title="Gestión de Adelantos de Sueldo" description="Aprueba o rechaza las solicitudes de adelanto de los trabajadores." />

            <PanelCard
                title="Solicitudes Pendientes de Aprobación"
                description="Revisa y procesa las solicitudes de adelanto de sueldo."
                icon={HandCoins}
                tone={pending.length > 0 ? 'warning' : 'neutral'}
                contentClassName="px-0 pb-0"
                actions={
                    pending.length > 0 ? (
                        <StatusBadge tone="warning">{pending.length} pendiente{pending.length > 1 ? 's' : ''}</StatusBadge>
                    ) : undefined
                }
            >
                    <Table>
                        <TableHeader className="border-t border-border bg-muted">
                            <TableRow>
                                <TableHead>Trabajador</TableHead>
                                <TableHead>Monto Solicitado</TableHead>
                                <TableHead>Fecha Solicitud</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {pending.length > 0 ? (
                                pending.map(req => (
                                    <TableRow key={req.id}>
                                        <TableCell className="font-medium">{req.workerName}</TableCell>
                                        <TableCell className="font-mono text-lg font-bold">{formatCLP(req.amount)}</TableCell>
                                        <TableCell>
                                            {formatDistanceToNow(toDate(req.requestedAt) || new Date(req.requestedAt), { addSuffix: true, locale: es })}
                                        </TableCell>
                                        <TableCell className="text-right space-x-2">
                                            {processingId === req.id ? <Loader2 className="animate-spin h-5 w-5 ml-auto" /> : (
                                                <>
                                                    <Button size="sm" variant="destructive" onClick={() => handleAction(req.id, 'reject')}>
                                                        <ThumbsDown className="mr-2 h-4 w-4"/> Rechazar
                                                    </Button>
                                                    <Button size="sm" className="bg-success text-background hover:bg-success/90" onClick={() => handleAction(req.id, 'approve')}>
                                                        <ThumbsUp className="mr-2 h-4 w-4"/> Aprobar
                                                    </Button>
                                                </>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center h-24">No hay solicitudes pendientes.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
            </PanelCard>

             <PanelCard
                title="Historial de Solicitudes Procesadas"
                description="Adelantos ya aprobados o rechazados."
                icon={History}
                contentClassName="px-0 pb-0"
             >
                     <Table>
                        <TableHeader className="border-t border-border bg-muted">
                            <TableRow>
                                <TableHead>Trabajador</TableHead>
                                <TableHead>Monto</TableHead>
                                <TableHead>Fecha Procesado</TableHead>
                                <TableHead>Estado</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                             {processed.length > 0 ? (
                                processed.map(req => (
                                    <TableRow key={req.id} className="text-muted-foreground">
                                        <TableCell>{req.workerName}</TableCell>
                                        <TableCell className="font-mono">{formatCLP(req.amount)}</TableCell>
                                        <TableCell>
                                            {req.processedAt ? formatDistanceToNow(toDate(req.processedAt) || new Date(req.processedAt), { addSuffix: true, locale: es }) : 'N/A'}
                                        </TableCell>
                                        <TableCell>{getStatusBadge(req.status)}</TableCell>
                                    </TableRow>
                                ))
                             ) : (
                                 <TableRow>
                                    <TableCell colSpan={4} className="text-center h-24">No hay solicitudes procesadas.</TableCell>
                                </TableRow>
                             )}
                        </TableBody>
                    </Table>
             </PanelCard>
        </div>
    );
}
