'use client';

import React, { useState, useMemo } from 'react';
import { useAppState } from '@/modules/data/useData';
import { PanelCard } from '@/components/ui/panel-card';
import { StatTile } from '@/components/ui/stat-tile';
import { StatusBadge } from '@/components/ui/status-badge';
import { PageHeader } from '@/components/page-header';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import {
    BarChart3,
    Package,
    ArrowUpRight,
    ArrowDownLeft,
    Filter,
    Layers,
    Activity as ActivityIcon,
    Search
} from 'lucide-react';
import { Input } from '@/components/ui/input';

export default function MaterialControlPage() {
    const { materials, stockMovements, projects, currentProjectId, setCurrentProjectId, workItems } = useAppState();
    const [searchQuery, setSearchQuery] = useState('');
    const [filterPhase, setFilterPhase] = useState('all');
    const [filterActivity, setFilterActivity] = useState('all');

    const currentProject = projects.find(p => p.id === currentProjectId);

    // Filter movements for the current project
    const projectMovements = useMemo(() => {
        return stockMovements.filter(m => m.projectId === currentProjectId);
    }, [stockMovements, currentProjectId]);

    // Aggregate consumption (negative quantityChange where type is 'request-delivery')
    const materialConsumption = useMemo(() => {
        const consumption: Record<string, {
            id: string,
            name: string,
            unit: string,
            totalConsumed: number,
            movements: any[]
        }> = {};

        projectMovements.forEach(m => {
            if (m.type === 'request-delivery') {
                if (!consumption[m.materialId]) {
                    const material = materials.find(mat => mat.id === m.materialId);
                    consumption[m.materialId] = {
                        id: m.materialId,
                        name: m.materialName,
                        unit: material?.unit || 'und',
                        totalConsumed: 0,
                        movements: []
                    };
                }
                consumption[m.materialId].totalConsumed += Math.abs(m.quantityChange);
                consumption[m.materialId].movements.push(m);
            }
        });

        return Object.values(consumption).filter(c =>
            c.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [projectMovements, materials, searchQuery]);

    // Get unique phases and activities from movements or workItems
    const phases = useMemo(() => {
        const p = new Set<string>();
        projectMovements.forEach(m => { if (m.phase) p.add(m.phase); });
        // Also add from workItems if roots are considered phases
        workItems.filter(wi => wi.projectId === currentProjectId && !wi.parentId).forEach(wi => p.add(wi.name));
        return Array.from(p);
    }, [projectMovements, workItems, currentProjectId]);

    const activities = useMemo(() => {
        const a = new Set<string>();
        projectMovements.forEach(m => { if (m.activity) a.add(m.activity); });
        return Array.from(a);
    }, [projectMovements]);

    const stats = useMemo(() => {
        const totalExits = projectMovements.filter(m => m.quantityChange < 0).length;
        const totalEntries = projectMovements.filter(m => m.quantityChange > 0).length;
        const totalMaterialsUsed = materialConsumption.length;

        return { totalExits, totalEntries, totalMaterialsUsed };
    }, [projectMovements, materialConsumption]);

    return (
        <div className="flex flex-col gap-6 p-6">
            <PageHeader
                title="Control de Materiales por Obra"
                description={`Monitoreo de consumo, fases y actividades para ${currentProject?.name || 'la obra seleccionada'}.`}
                actions={
                    <Select value={currentProjectId || ''} onValueChange={setCurrentProjectId}>
                        <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Seleccionar Obra" />
                        </SelectTrigger>
                        <SelectContent>
                            {projects.map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                }
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatTile
                    label="Materiales Utilizados"
                    value={stats.totalMaterialsUsed}
                    icon={Package}
                    tone="info"
                    sub="Diferentes SKUs consumidos"
                />
                <StatTile
                    label="Salidas de Bodega"
                    value={stats.totalExits}
                    icon={ArrowUpRight}
                    tone="danger"
                    sub="Solicitudes despachadas"
                />
                <StatTile
                    label="Ingresos / Compras"
                    value={stats.totalEntries}
                    icon={ArrowDownLeft}
                    tone="success"
                    sub="Recepciones registradas"
                />
            </div>

            <div className="flex flex-col md:flex-row gap-4 items-center bg-card p-4 rounded-lg border shadow-sm">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar material..."
                        className="pl-9"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Select value={filterPhase} onValueChange={setFilterPhase}>
                        <SelectTrigger className="w-full md:w-[180px]">
                            <Layers className="h-3 w-3 mr-2 text-muted-foreground" />
                            <SelectValue placeholder="Todas las Fases" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todas las Fases</SelectItem>
                            {phases.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={filterActivity} onValueChange={setFilterActivity}>
                        <SelectTrigger className="w-full md:w-[180px]">
                            <ActivityIcon className="h-3 w-3 mr-2 text-muted-foreground" />
                            <SelectValue placeholder="Todas las Actividades" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todas las Actividades</SelectItem>
                            {activities.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <PanelCard
                title="Consumo Acumulado"
                description="Detalle de materiales entregados a terreno en esta obra."
                icon={Package}
                contentClassName="px-0 pb-0"
            >
                    <Table>
                        <TableHeader className="border-t border-border bg-muted">
                            <TableRow>
                                <TableHead>Material</TableHead>
                                <TableHead>Unidad</TableHead>
                                <TableHead className="text-right">Consumo Total</TableHead>
                                <TableHead className="text-right">Stock Actual</TableHead>
                                <TableHead>Último Uso</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {materialConsumption.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                        No se han registrado consumos para los criterios seleccionados.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                materialConsumption.map((item) => {
                                    const material = materials.find(m => m.id === item.id);
                                    const lastMovement = item.movements[item.movements.length - 1];

                                    return (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">{item.name}</TableCell>
                                            <TableCell>{item.unit}</TableCell>
                                            <TableCell className="text-right font-bold text-danger">
                                                {item.totalConsumed}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <StatusBadge tone={material && material.stock > 0 ? 'neutral' : 'danger'}>
                                                    {material?.stock || 0}
                                                </StatusBadge>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {lastMovement?.date ? new Date(lastMovement.date.seconds * 1000).toLocaleDateString() : 'N/A'}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
            </PanelCard>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <PanelCard title="Consumo por Fase" icon={Layers}>
                        <div className="space-y-4">
                            {phases.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-8">Sin datos de fases.</p>
                            ) : (
                                phases.map(phase => {
                                    const phaseMovements = projectMovements.filter(m => m.phase === phase && m.type === 'request-delivery');
                                    const total = phaseMovements.reduce((sum, m) => sum + Math.abs(m.quantityChange), 0);
                                    return (
                                        <div key={phase} className="flex flex-col gap-1">
                                            <div className="flex justify-between text-sm">
                                                <span className="font-medium">{phase}</span>
                                                <span className="text-muted-foreground">{total} unidades</span>
                                            </div>
                                            <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                                                <div
                                                    className="bg-primary h-full transition-all"
                                                    style={{ width: `${Math.min(100, (total / 1000) * 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                </PanelCard>

                <PanelCard title="Actividades Recientes" icon={BarChart3}>
                        <div className="space-y-4 text-sm">
                            {projectMovements.slice(0, 5).map((m, i) => (
                                <div key={i} className="flex items-center justify-between border-b pb-2 last:border-0">
                                    <div className="flex flex-col">
                                        <span className="font-medium">{m.materialName}</span>
                                        <span className="text-xs text-muted-foreground">{m.activity || 'Sin actividad especificada'}</span>
                                    </div>
                                    <div className={`font-bold ${m.quantityChange < 0 ? 'text-danger' : 'text-success'}`}>
                                        {m.quantityChange > 0 ? '+' : ''}{m.quantityChange}
                                    </div>
                                </div>
                            ))}
                            {projectMovements.length === 0 && (
                                <p className="text-sm text-muted-foreground text-center py-8">No hay movimientos registrados.</p>
                            )}
                        </div>
                </PanelCard>
            </div>
        </div>
    );
}
