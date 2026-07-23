"use client";

import React, { useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import { formatCLP } from '@/lib/format';
import { useAppState, useAuth } from '@/modules/core/contexts/app-provider';
import { PanelCard } from '@/components/ui/panel-card';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { FileText, Download, Clock, CheckCircle, CircleDollarSign } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PaymentState } from '@/modules/core/lib/data';
import { generateEstadoDePagoPDF } from '@/lib/ep-pdf-generator';
import { toDate } from '@/lib/date-utils';

const formatDate = (date: Date | string | undefined | null) => {
    const jsDate = toDate(date);
    if (!jsDate) return 'N/A';
    return jsDate.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
};

const STATUS: Record<string, { label: string; tone: StatusTone; icon: React.ElementType }> = {
    pending: { label: 'Pendiente', tone: 'warning', icon: Clock },
    approved: { label: 'Aprobado', tone: 'success', icon: CheckCircle },
    paid: { label: 'Pagado', tone: 'info', icon: CircleDollarSign },
};

const getStatusBadge = (status: PaymentState['status']) => {
    const cfg = STATUS[status];
    if (!cfg) return <StatusBadge tone="neutral">{status}</StatusBadge>;
    return <StatusBadge tone={cfg.tone} icon={cfg.icon}>{cfg.label}</StatusBadge>;
};

export default function PaymentHistoryPage() {
    const { paymentStates, users } = useAppState();
    const { user } = useAuth();

    const myPaymentStates = useMemo(() => {
        if (!user || !paymentStates) return [];
        return paymentStates
            .filter(ps => ps.contractorId === user.id)
            .sort((a, b) => {
                const dateA = toDate(a.createdAt)?.getTime() || 0;
                const dateB = toDate(b.createdAt)?.getTime() || 0;
                return dateB - dateA;
            });
    }, [paymentStates, user]);
    
    const handleDownload = async (ep: PaymentState) => {
        if (!user) return;
        await generateEstadoDePagoPDF(ep.id, user.name, ep.totalValue, ep.earnedValue, ep.items);
    }

    return (
        <div className="flex flex-col gap-8 pb-10">
            <PageHeader
                title="Historial de Estados de Pago"
                description="Aquí puedes ver y descargar todos los estados de pago que has generado."
            />

            <PanelCard
                title="Mis Estados de Pago"
                description="Todos los estados de pago que has generado."
                icon={FileText}
                contentClassName="px-0 pb-0"
            >
                    <ScrollArea className="h-[60vh] border-t border-border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Valor Total Contrato</TableHead>
                                    <TableHead>Valor Ganado</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {myPaymentStates.length > 0 ? myPaymentStates.map(ep => (
                                    <TableRow key={ep.id}>
                                        <TableCell>{formatDate(ep.createdAt)}</TableCell>
                                        <TableCell>{formatCLP(ep.totalValue)}</TableCell>
                                        <TableCell className="font-semibold text-primary">{formatCLP(ep.earnedValue)}</TableCell>
                                        <TableCell>{getStatusBadge(ep.status)}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="outline" size="sm" onClick={() => handleDownload(ep)}>
                                                <Download className="mr-2 h-4 w-4"/> PDF
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center h-24">
                                            No has generado ningún estado de pago.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
            </PanelCard>
        </div>
    );
}
