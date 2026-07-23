
"use client";
import * as React from 'react';
import Link from 'next/link';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
    Package,
    Wrench,
    ArrowRight,
    PackagePlus,
    PackageOpen,
    PackageCheck,
    ClipboardList,
    Undo2,
    Inbox,
    TrendingDown,
    User as UserIcon,
    ArrowUpRight,
    ArrowDownLeft
} from 'lucide-react';
import { StatTile } from '@/components/ui/stat-tile';
import { PanelCard } from '@/components/ui/panel-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { toDate } from '@/lib/date-utils';
import { es } from 'date-fns/locale';
import type { Material, User } from '@/modules/core/lib/data';

// --- Tipos Auxiliares para la Vista ---
type ActivityItem = {
    id: string;
    date: Date;
    title: string;
    subtitle: string;
    user: string;
    type: 'entry' | 'exit' | 'warning';
    quantity?: number;
};

// Las dos columnas de actividad (salidas / ingresos) renderizan exactamente la
// misma fila; solo cambian el ícono y el tono.
const ACTIVITY_TONE = {
    warning: 'bg-warning-subtle text-warning',
    success: 'bg-success-subtle text-success',
} as const;

function ActivityList({
    items,
    icon: Icon,
    tone,
    getRelativeTime,
}: {
    items: ActivityItem[];
    icon: React.ElementType;
    tone: keyof typeof ACTIVITY_TONE;
    getRelativeTime: (date: Date | null) => string;
}) {
    return (
        <ul className="space-y-4">
            {items.map((item) => (
                <li key={item.id} className="flex items-start gap-3">
                    <div className={`mt-1 shrink-0 rounded-full p-1.5 ${ACTIVITY_TONE[tone]}`}>
                        <Icon className="h-4 w-4" />
                    </div>
                    <div className="w-full space-y-0.5">
                        <p className="text-sm font-medium leading-none">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                        <div className="mt-1.5 flex items-center justify-between border-t border-dashed border-border pt-1.5">
                            <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                <UserIcon className="h-3 w-3" /> {item.user.split(' ')[0]}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                                {getRelativeTime(item.date)}
                            </span>
                        </div>
                    </div>
                </li>
            ))}
        </ul>
    );
}

function EmptyActivity({ text }: { text: string }) {
    return (
        <div className="flex h-full items-center justify-center text-sm italic text-muted-foreground">
            {text}
        </div>
    );
}

export default function WarehouseHubPage() {
    const {
        materials = [],
        tools = [],
        requests = [],
        toolLogs = [],
        returnRequests = [],
        stockMovements = [],
        users = [],
        can,
    } = useAppState();

    // --- Helpers & Memos ---

    // Optimización: Mapa de usuarios para búsqueda O(1)
    const userMap = React.useMemo(() => {
        const map = new Map<string, User>();
        users.forEach((u) => map.set(u.id, u));
        return map;
    }, [users]);

    // Optimización: Mapa de materiales
    const materialMap = React.useMemo(() => {
        const map = new Map<string, Material>();
        materials.forEach((m) => map.set(m.id, m));
        return map;
    }, [materials]);

    const getRelativeTime = (date: Date | null) => {
        if (!date) return '';
        try {
            return formatDistanceToNow(date, { addSuffix: true, locale: es });
        } catch {
            return 'Fecha inválida';
        }
    };

    // --- Estadísticas Principales ---
    const stats = React.useMemo(() => {
        const checkedOutToolsCount = new Set(
            toolLogs
                .filter((log) => log.returnDate === null)
                .map((log) => log.toolId)
        ).size;

        return {
            totalMaterials: materials.length,
            totalTools: tools.length,
            toolsInUse: checkedOutToolsCount,
            toolsAvailable: Math.max(0, tools.length - checkedOutToolsCount),
        };
    }, [materials, tools, toolLogs]);

    // --- Pendientes de aprobación (la tarea principal del bodeguero) ---
    const pendingRequests = React.useMemo(
        () => requests.filter((r) => r.status === 'pending'),
        [requests]
    );
    const pendingReturns = React.useMemo(
        () => returnRequests.filter((r) => r.status === 'pending'),
        [returnRequests]
    );
    const canApproveRequests = can('material_requests:approve');
    const canApproveReturns = can('return_requests:approve');
    const showPending =
        (canApproveRequests && pendingRequests.length > 0) ||
        (canApproveReturns && pendingReturns.length > 0);

    // --- Stock Bajo (Top 10 críticos) ---
    const lowStockMaterials = React.useMemo(() => {
        return materials
            .filter((m) => !m.archived && m.stock <= 10) // Ajusté a <= para incluir el 10
            .sort((a, b) => a.stock - b.stock) // Menor stock primero
            .slice(0, 5); // Top 5 para no saturar la UI inicial
    }, [materials]);

    // --- Actividad Reciente (Salidas) ---
    const recentExits: ActivityItem[] = React.useMemo(() => {
        return requests
            .filter((r) => r.status === 'approved' && (r.approvalDate || r.createdAt))
            .sort((a, b) => {
                const dateA = toDate(a.approvalDate || a.createdAt)?.getTime() || 0;
                const dateB = toDate(b.approvalDate || b.createdAt)?.getTime() || 0;
                return dateB - dateA;
            })
            .slice(0, 10)
            .map((r: any) => {
                const date = toDate(r.approvalDate || r.createdAt) || new Date();
                const supervisorName = userMap.get(r.supervisorId)?.name || 'Desconocido';
                // Lógica para obtener nombre del material (soporte legacy y array)
                let title = 'Solicitud de Material';
                const items = r.items || (r.materialId ? [{ materialId: r.materialId, quantity: r.quantity || 0 }] : []);

                if (items.length === 1) {
                    const matName = materialMap.get(items[0].materialId)?.name || 'Material';
                    title = `${items[0].quantity} x ${matName}`;
                } else if (items.length > 1) {
                    title = `${items.length} materiales varios`;
                } else if (r.materialName) {
                    title = `${r.quantity} x ${r.materialName}`;
                }

                return {
                    id: r.id,
                    date,
                    title,
                    subtitle: `Destino: ${r.area}`,
                    user: supervisorName,
                    type: 'exit',
                };
            });
    }, [requests, userMap, materialMap]);

    // --- Actividad Reciente (Entradas) ---
    const recentEntries: ActivityItem[] = React.useMemo(() => {
        const returns = returnRequests
            .filter((r) => r.status === 'completed' && r.completionDate)
            .map((r) => ({
                id: r.id,
                date: toDate(r.completionDate) ?? new Date(0),
                title: `${r.quantity} x ${r.materialName}`,
                subtitle: 'Devolución de obra',
                user: r.supervisorName || 'Desconocido',
                type: 'entry' as const,
            }));

        const manuals = stockMovements
            .filter((m) => m.type === 'manual-entry' && m.quantityChange > 0)
            .map((m) => ({
                id: m.id,
                date: toDate(m.date) ?? new Date(0),
                title: `${m.quantityChange} x ${m.materialName}`,
                subtitle: 'Ingreso Manual / Compra',
                user: m.userName || 'Admin',
                type: 'entry' as const,
            }));

        return [...returns, ...manuals]
            .sort((a, b) => b.date.getTime() - a.date.getTime())
            .slice(0, 10);
    }, [returnRequests, stockMovements]);


    return (
        <div className="flex flex-col gap-8 pb-10 fade-in">
            <PageHeader
                title="Centro de Control de Bodega"
                description="Vista general del inventario, alertas y movimientos recientes."
                actions={
                    can('stock:add_manual') ? (
                        <Button asChild variant="cta">
                            <Link href="/dashboard/bodega/manual-stock-entry">
                                <PackagePlus className="mr-2 h-4 w-4" />
                                Ingresar Stock
                            </Link>
                        </Button>
                    ) : undefined
                }
            />

            {/* Pendientes de aprobación — accionable */}
            {showPending && (
                <PanelCard
                    title="Pendientes de Aprobación"
                    description="Solicitudes y devoluciones esperando tu revisión"
                    icon={Inbox}
                    tone="warning"
                >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {canApproveRequests && (
                            <Link
                                href="/dashboard/bodega/requests"
                                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="rounded-lg bg-warning-subtle p-2 text-warning">
                                        <ClipboardList className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold">Solicitudes de material</p>
                                        <p className="text-xs text-muted-foreground">Entregas por aprobar</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl font-bold tabular-nums">{pendingRequests.length}</span>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                </div>
                            </Link>
                        )}
                        {canApproveReturns && (
                            <Link
                                href="/dashboard/bodega/return-requests"
                                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="rounded-lg bg-warning-subtle p-2 text-warning">
                                        <Undo2 className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold">Devoluciones</p>
                                        <p className="text-xs text-muted-foreground">Reingresos por aprobar</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl font-bold tabular-nums">{pendingReturns.length}</span>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                </div>
                            </Link>
                        )}
                    </div>
                </PanelCard>
            )}

            {/* 2. STATS CARDS */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatTile label="Materiales Únicos" value={stats.totalMaterials} icon={Package} />
                <StatTile label="Total Herramientas" value={stats.totalTools} icon={Wrench} />
                <StatTile label="En Uso (Obra)" value={stats.toolsInUse} icon={ArrowRight} tone="warning" />
                <StatTile label="Disponibles" value={stats.toolsAvailable} icon={PackageCheck} tone="success" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* 3. COLUMNA IZQUIERDA: ALERTAS DE STOCK (VISUAL MEJORADO) */}
                <div className="lg:col-span-1 space-y-6">
                    <PanelCard
                        title="Stock Crítico"
                        description="Materiales con 10 o menos unidades."
                        icon={TrendingDown}
                        tone="danger"
                        footer={
                            lowStockMaterials.length > 0 ? (
                                <Link href="/dashboard/bodega/materials">
                                    <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground">
                                        Ver inventario completo <ArrowRight className="ml-1 h-3 w-3" />
                                    </Button>
                                </Link>
                            ) : undefined
                        }
                    >
                        {lowStockMaterials.length > 0 ? (
                            <div className="space-y-4">
                                {lowStockMaterials.map((material) => {
                                    // Calculamos porcentaje visual (asumiendo 20 como base "sana" visualmente)
                                    const percentage = Math.min((material.stock / 20) * 100, 100);
                                    return (
                                        <div key={material.id} className="space-y-1.5">
                                            <div className="flex items-end justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium text-foreground">{material.name}</p>
                                                    <p className="truncate text-xs text-muted-foreground">{material.category}</p>
                                                </div>
                                                <StatusBadge tone="danger" className="font-mono">
                                                    {material.stock} {material.unit}
                                                </StatusBadge>
                                            </div>
                                            <Progress value={percentage} className="h-2 bg-danger-subtle" indicatorClassName="bg-danger" />
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                                <PackageCheck className="mb-2 h-10 w-10 text-success opacity-60" />
                                <p className="text-sm">Todo el stock está saludable.</p>
                            </div>
                        )}
                    </PanelCard>
                </div>

                {/* 4. COLUMNA DERECHA: ACTIVIDAD RECIENTE (TABLERO UNIFICADO VISUALMENTE) */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
                        {/* SALIDAS RECIENTES */}
                        <PanelCard
                            title="Salidas Recientes"
                            description="Entregas de material a obra"
                            icon={ArrowUpRight}
                            tone="warning"
                            className="h-full"
                        >
                            <ScrollArea className="h-[400px] pr-4">
                                {recentExits.length > 0 ? (
                                    <ActivityList items={recentExits} icon={PackageOpen} tone="warning" getRelativeTime={getRelativeTime} />
                                ) : (
                                    <EmptyActivity text="No hay salidas registradas recientemente." />
                                )}
                            </ScrollArea>
                        </PanelCard>

                        {/* INGRESOS RECIENTES */}
                        <PanelCard
                            title="Ingresos Recientes"
                            description="Devoluciones y compras"
                            icon={ArrowDownLeft}
                            tone="success"
                            className="h-full"
                        >
                            <ScrollArea className="h-[400px] pr-4">
                                {recentEntries.length > 0 ? (
                                    <ActivityList items={recentEntries} icon={PackageCheck} tone="success" getRelativeTime={getRelativeTime} />
                                ) : (
                                    <EmptyActivity text="No hay ingresos registrados recientemente." />
                                )}
                            </ScrollArea>
                        </PanelCard>
                    </div>
                </div>
            </div>
        </div>
    );
}

