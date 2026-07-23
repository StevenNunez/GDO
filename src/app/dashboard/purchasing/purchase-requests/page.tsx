'use client';

import React, { useState, useMemo } from 'react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { PanelCard } from '@/components/ui/panel-card';
import { StatTile } from '@/components/ui/stat-tile';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Clock,
    Check,
    X,
    PackageCheck,
    Box,
    FileText,
    Edit,
    Loader2,
    AlertCircle,
    Package,
    Trash2,
    Search,
    ShoppingCart,
    Filter
} from 'lucide-react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { EditPurchaseRequestForm } from '@/components/operations/edit-purchase-request-form';
import type { PurchaseRequest, PurchaseRequestStatus } from '@/modules/core/lib/data';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { toDate } from '@/lib/date-utils';

// --- CONFIGURACIÓN DE ESTADOS ---
const STATUS_CONFIG: Record<PurchaseRequestStatus, { label: string; icon: React.ElementType; tone: StatusTone }> = {
    pending: { label: 'Pendiente', icon: Clock, tone: 'warning' },
    approved: { label: 'Aprobado', icon: Check, tone: 'success' },
    rejected: { label: 'Rechazado', icon: X, tone: 'danger' },
    ordered: { label: 'Ordenada', icon: FileText, tone: 'info' },
    batched: { label: 'En Lote', icon: Box, tone: 'neutral' },
    received: { label: 'Recibido', icon: PackageCheck, tone: 'success' },
};


// --- PÁGINA PRINCIPAL ---
export default function PurchaseRequestsManagementPage() {
    const { purchaseRequests, users, deletePurchaseRequest, isLoading, currentProjectId, projects, can } = useAppState();
    const { toast } = useToast();

    // Estados Locales
    const [editingRequest, setEditingRequest] = useState<PurchaseRequest | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('pending'); // Por defecto ver pendientes
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const itemsPerPage = 8;

    // Permisos
    const canDelete = can('purchase_requests:delete');
    const canApprove = can('purchase_requests:approve');

    // Optimizaciones O(1)
    const supervisorMap = useMemo(() => {
        const map = new Map<string, string>();
        (users || []).forEach(u => map.set(u.id, u.name));
        return map;
    }, [users]);

    // Helpers de Fecha
    const getDate = (date: Date | string | null | undefined): Date | null => toDate(date);

    const formatDate = (date: any) => {
        const d = getDate(date);
        return d ? d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';
    };

    const getRelativeTime = (date: any) => {
        const d = getDate(date);
        return d ? formatDistanceToNow(d, { addSuffix: true, locale: es }) : '';
    };

    // Acciones
    const handleDeleteRequest = async (requestId: string) => {
        try {
            await deletePurchaseRequest(requestId);
            toast({ title: "Solicitud Eliminada", description: "Registro eliminado correctamente." });
        } catch (error) {
            toast({ title: "Error", description: "No se pudo eliminar.", variant: "destructive" });
        }
    };

    // Filtrado y Ordenamiento
    const filteredRequests = useMemo(() => {
        let filtered = [...(purchaseRequests || [])];

        // Filtro de Estado (Tabs)
        if (statusFilter !== 'all') {
            // Agrupación lógica para tabs simplificados
            if (statusFilter === 'active') {
                filtered = filtered.filter(r => ['approved', 'batched', 'ordered'].includes(r.status));
            } else {
                filtered = filtered.filter(r => r.status === statusFilter);
            }
        }

        // Búsqueda de Texto
        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            filtered = filtered.filter(req =>
                req.materialName.toLowerCase().includes(lowerTerm) ||
                (supervisorMap.get(req.supervisorId) || '').toLowerCase().includes(lowerTerm) ||
                (req.area || '').toLowerCase().includes(lowerTerm)
            );
        }

        // Ordenar: Pendientes primero, luego por fecha más reciente
        return filtered.sort((a, b) => {
            const timeA = getDate(a.createdAt)?.getTime() || 0;
            const timeB = getDate(b.createdAt)?.getTime() || 0;
            return timeB - timeA;
        });
    }, [purchaseRequests, statusFilter, searchTerm, supervisorMap]);

    const paginatedRequests = useMemo(() => {
        return filteredRequests.slice((page - 1) * itemsPerPage, page * itemsPerPage);
    }, [filteredRequests, page]);

    const totalPages = Math.ceil(filteredRequests.length / itemsPerPage);

    // Estadísticas Rápidas
    const stats = useMemo(() => {
        const all = purchaseRequests || [];
        return {
            pending: all.filter(r => r.status === 'pending').length,
            active: all.filter(r => ['approved', 'batched', 'ordered'].includes(r.status)).length,
            total: all.length
        };
    }, [purchaseRequests]);

    // Render Helpers
    const renderStatusBadge = (status: PurchaseRequestStatus) => {
        const config = STATUS_CONFIG[status] || { label: status, icon: Package, tone: 'neutral' as StatusTone };
        return (
            <StatusBadge tone={config.tone} icon={config.icon} className="w-fit">
                {config.label}
            </StatusBadge>
        );
    };

    return (
        <div className="flex flex-col gap-8 pb-12 fade-in">
            <PageHeader
                title="Gestión de Compras"
                description={
                    <div className="flex flex-wrap items-center gap-2">
                        <span>Administra el flujo de adquisiciones, aprobaciones y recepciones.</span>
                        <StatusBadge tone={currentProjectId ? 'info' : 'warning'}>
                            {currentProjectId ? `Obra: ${projects.find(p => p.id === currentProjectId)?.name}` : "Vista Global (Sin filtro)"}
                        </StatusBadge>
                    </div>
                }
            />

            {/* --- DASHBOARD METRICAS --- */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <StatTile label="Pendientes de Revisión" value={stats.pending} icon={Clock} tone="warning" />
                <StatTile label="En Proceso de Compra" value={stats.active} icon={ShoppingCart} tone="info" />
                <StatTile label="Total Histórico" value={stats.total} icon={FileText} />
            </div>

            {/* --- CONTENIDO PRINCIPAL --- */}
            <Tabs defaultValue="pending" value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }} className="w-full">

                    <div className="mb-6 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
                        <TabsList className="h-auto p-1">
                            <TabsTrigger value="pending" className="px-4 py-2">
                                Pendientes
                                {stats.pending > 0 && (
                                    <span className="ml-2 rounded-full bg-warning-subtle px-1.5 py-0.5 text-[10px] font-bold text-warning">
                                        {stats.pending}
                                    </span>
                                )}
                            </TabsTrigger>
                            <TabsTrigger value="active" className="px-4 py-2">En Proceso</TabsTrigger>
                            <TabsTrigger value="received" className="px-4 py-2">Recibidos</TabsTrigger>
                            <TabsTrigger value="all" className="px-4 py-2">Todos</TabsTrigger>
                        </TabsList>

                        <div className="relative w-full md:w-[300px]">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar material, área o solicitante..."
                                className="pl-9"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <PanelCard
                        title="Solicitudes"
                        description={`${filteredRequests.length} resultado${filteredRequests.length === 1 ? '' : 's'} con los filtros actuales`}
                        icon={ShoppingCart}
                        contentClassName="px-0 pb-0"
                        footer={
                            totalPages > 1 ? (
                                <div className="flex items-center justify-between">
                                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Anterior</Button>
                                    <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
                                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Siguiente</Button>
                                </div>
                            ) : undefined
                        }
                    >
                            <Table>
                                    <TableHeader className="sticky top-0 z-10 bg-muted">
                                        <TableRow>
                                            <TableHead className="w-[25%]">Material</TableHead>
                                            <TableHead className="w-[15%]">Cantidad</TableHead>
                                            <TableHead className="w-[20%]">Solicitante / Área</TableHead>
                                            <TableHead className="w-[15%]">Fecha</TableHead>
                                            <TableHead className="w-[10%]">Estado</TableHead>
                                            <TableHead className="w-[15%] text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoading ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-32 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></TableCell>
                                            </TableRow>
                                        ) : paginatedRequests.length > 0 ? (
                                            paginatedRequests.map((req) => (
                                                <TableRow key={req.id} className="group hover:bg-muted/30 transition-colors">
                                                    <TableCell>
                                                        <div className="flex flex-col gap-1">
                                                            <span className="font-medium text-sm">{req.materialName}</span>
                                                            {req.justification && (
                                                                <span className="text-[11px] text-muted-foreground truncate max-w-[200px]" title={req.justification}>
                                                                    "{req.justification}"
                                                                </span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <StatusBadge tone="neutral" className="font-mono font-normal">
                                                            {req.quantity} {req.unit}
                                                        </StatusBadge>
                                                        {/* Tooltip de cambios si existen */}
                                                        {(req.originalQuantity && req.originalQuantity !== req.quantity) && (
                                                            <TooltipProvider>
                                                                <Tooltip>
                                                                    <TooltipTrigger><AlertCircle className="ml-2 inline h-3 w-3 text-warning" /></TooltipTrigger>
                                                                    <TooltipContent>Cantidad original: {req.originalQuantity}</TooltipContent>
                                                                </Tooltip>
                                                            </TooltipProvider>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-medium">{supervisorMap.get(req.supervisorId) || 'Desconocido'}</span>
                                                            <span className="text-xs text-muted-foreground">{req.area}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm">{formatDate(req.createdAt)}</span>
                                                            <span className="text-[10px] text-muted-foreground">{getRelativeTime(req.createdAt)}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        {renderStatusBadge(req.status)}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                            {canApprove && ['pending', 'approved', 'batched', 'ordered'].includes(req.status) && (
                                                                <Button variant="ghost" size="icon" onClick={() => setEditingRequest(req)} title="Gestionar / Editar">
                                                                    <Edit className="h-4 w-4 text-info" />
                                                                </Button>
                                                            )}
                                                            {canDelete && (
                                                                <AlertDialog>
                                                                    <AlertDialogTrigger asChild>
                                                                        <Button variant="ghost" size="icon" className="hover:bg-destructive/10">
                                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                                        </Button>
                                                                    </AlertDialogTrigger>
                                                                    <AlertDialogContent>
                                                                        <AlertDialogHeader>
                                                                            <AlertDialogTitle>¿Anular Solicitud?</AlertDialogTitle>
                                                                            <AlertDialogDescription>
                                                                                Esta acción anulará la solicitud de <b>{req.materialName}</b>. Esto es útil para ítems que ya no se comprarán. Esta acción es irreversible.
                                                                            </AlertDialogDescription>
                                                                        </AlertDialogHeader>
                                                                        <AlertDialogFooter>
                                                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                            <AlertDialogAction onClick={() => handleDeleteRequest(req.id)} className="bg-destructive hover:bg-destructive/90">Anular Solicitud</AlertDialogAction>
                                                                        </AlertDialogFooter>
                                                                    </AlertDialogContent>
                                                                </AlertDialog>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-48 text-center text-muted-foreground">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <Filter className="h-10 w-10 opacity-30" />
                                                        <p>No se encontraron solicitudes con los filtros actuales.</p>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                    </PanelCard>
            </Tabs>

            {/* --- DIÁLOGOS MODALES --- */}
            {editingRequest && (
                <EditPurchaseRequestForm
                    request={editingRequest}
                    isOpen={!!editingRequest}
                    onClose={() => setEditingRequest(null)}
                />
            )}
        </div>
    );
}
