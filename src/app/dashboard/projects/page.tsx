'use client';

import React, { useState } from 'react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/page-header';
import { PanelCard } from '@/components/ui/panel-card';
import { StatTile } from '@/components/ui/stat-tile';
import { StatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/modules/core/hooks/use-toast';
import { Loader2, Plus, Trash2, Database, Construction, HardHat, Wrench, Users as UsersIcon, Package } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Project, Client } from '@/modules/core/lib/data';
import { toDate } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const formatDate = (date: any): string => {
    if (!date) return '—';
    try {
        const d = toDate(date) || new Date(date);
        return d.toLocaleDateString('es-CL', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return '—';
    }
};

/* Selector de cliente en línea — reutilizado por la tabla (desktop) y las tarjetas (móvil). */
function ClientAssignSelect({ project, clients, disabled, onAssign, triggerClassName }: {
    project: Project;
    clients: Client[];
    disabled: boolean;
    onAssign: (project: Project, value: string) => void;
    triggerClassName?: string;
}) {
    return (
        <Select
            value={project.clientId || 'none'}
            disabled={disabled}
            onValueChange={(v) => onAssign(project, v)}
        >
            <SelectTrigger className={cn('h-8 w-full', triggerClassName)}>
                <SelectValue placeholder="Sin asignar" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="none">Sin asignar</SelectItem>
                {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

/* Botones de migrar + eliminar — reutilizados por la tabla (desktop) y las tarjetas (móvil). */
function ProjectActions({ project, onMigrate, onDelete }: {
    project: Project;
    onMigrate: (project: Project) => void;
    onDelete: (project: Project) => void;
}) {
    return (
        <div className="flex items-center justify-end gap-1">
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-info hover:text-info"
                title="Migrar datos a esta obra"
                onClick={() => onMigrate(project)}
            >
                <Database className="h-4 w-4" />
            </Button>

            <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar "{project.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción no se puede deshacer. Los datos asociados a esta obra NO serán eliminados,
                            pero quedarán sin asignar.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive hover:bg-destructive/90"
                            onClick={() => onDelete(project)}
                        >
                            Sí, eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

export default function ProjectsPage() {
    const { projects, clients, tools, users, materials, addProject, updateProject, deleteProject, migrateLegacyDataToProject, can } = useAppState();
    const { toast } = useToast();

    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isMigrateOpen, setIsMigrateOpen] = useState(false);
    const [migrateTarget, setMigrateTarget] = useState<Project | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [newName, setNewName] = useState('');
    const [newAddress, setNewAddress] = useState('');
    const [newDescription, setNewDescription] = useState('');
    // 'none' = obra sin cliente. Radix Select no admite value="".
    const [newClientId, setNewClientId] = useState<string>('none');

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;
        setIsSubmitting(true);
        try {
            await addProject({
                name: newName.trim(),
                address: newAddress.trim() || undefined,
                description: newDescription.trim() || undefined,
                clientId: newClientId === 'none' ? null : newClientId,
            });
            toast({ title: 'Obra Creada', description: `La obra "${newName}" ha sido registrada.` });
            setNewName('');
            setNewAddress('');
            setNewDescription('');
            setNewClientId('none');
            setIsCreateOpen(false);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Error', description: err.message || 'No se pudo crear la obra.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleMigrate = async () => {
        if (!migrateTarget) return;
        setIsSubmitting(true);
        try {
            const count = await migrateLegacyDataToProject(migrateTarget.id);
            toast({
                title: 'Migración Completada',
                description: `Se asignaron ${count} documentos huérfanos a la obra "${migrateTarget.name}".`,
            });
            setIsMigrateOpen(false);
            setMigrateTarget(null);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Error de Migración', description: err.message || 'No se pudo completar la migración.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const canManageProjects = can('projects:manage');

    const handleAssignClient = async (project: Project, value: string) => {
        const clientId = value === 'none' ? null : value;
        if ((project.clientId || null) === clientId) return;
        try {
            await updateProject(project.id, { clientId });
            const clientName = clients.find(c => c.id === clientId)?.name;
            toast({
                title: 'Obra reasignada',
                description: clientName
                    ? `"${project.name}" ahora pertenece a ${clientName}.`
                    : `"${project.name}" quedó sin cliente asignado.`,
            });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Error', description: err.message || 'No se pudo asignar el cliente.' });
        }
    };

    const handleDelete = async (project: Project) => {
        try {
            await deleteProject(project.id);
            toast({ title: 'Obra Eliminada', description: `"${project.name}" ha sido eliminada.` });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Error', description: err.message || 'No se pudo eliminar la obra.' });
        }
    };

    return (
        <div className="flex flex-col gap-8 pb-10">
            <PageHeader
                title="Gestión de Obras"
                description="Crea, administra y migra datos entre tus proyectos de construcción."
            />

            <Tabs defaultValue="list" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-8">
                    <TabsTrigger value="list" className="flex items-center gap-2 text-xs sm:text-sm">
                        <Construction className="h-4 w-4 shrink-0" />
                        <span className="truncate">Lista de Obras</span>
                    </TabsTrigger>
                    <TabsTrigger value="global" className="flex items-center gap-2 text-xs sm:text-sm">
                        <Database className="h-4 w-4 shrink-0" />
                        <span className="truncate">
                            <span className="sm:hidden">Panel Global</span>
                            <span className="hidden sm:inline">Panel Global de la Empresa</span>
                        </span>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="list" className="space-y-6">
                    <PanelCard
                        title="Lista de Obras"
                        description={`${projects?.length || 0} obra(s) registrada(s) en el sistema.`}
                        icon={Construction}
                        contentClassName="px-0 pb-0"
                        actions={
                            can('projects:create') ? (
                                <Button onClick={() => setIsCreateOpen(true)}>
                                    <Plus className="mr-2 h-4 w-4" /> Nueva Obra
                                </Button>
                            ) : undefined
                        }
                    >
                            {/* Desktop: tabla completa */}
                            <div className="hidden md:block">
                                <Table>
                                    <TableHeader className="border-t border-border bg-muted">
                                        <TableRow>
                                            <TableHead>Nombre</TableHead>
                                            <TableHead className="min-w-[180px]">Cliente</TableHead>
                                            <TableHead>Dirección</TableHead>
                                            <TableHead>Estado</TableHead>
                                            <TableHead>Fecha de Creación</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(!projects || projects.length === 0) ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                                                    No hay obras registradas. Crea una nueva obra para comenzar.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            projects.map((project) => (
                                                <TableRow key={project.id}>
                                                    <TableCell className="font-medium">{project.name}</TableCell>
                                                    <TableCell>
                                                        <ClientAssignSelect
                                                            project={project}
                                                            clients={clients}
                                                            disabled={!canManageProjects}
                                                            onAssign={handleAssignClient}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground">
                                                        {project.address || '—'}
                                                    </TableCell>
                                                    <TableCell>
                                                        <StatusBadge tone={project.isActive ? 'success' : 'neutral'}>
                                                            {project.isActive ? 'Activa' : 'Inactiva'}
                                                        </StatusBadge>
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground">{formatDate(project.createdAt)}</TableCell>
                                                    <TableCell className="text-right">
                                                        <ProjectActions
                                                            project={project}
                                                            onMigrate={(p) => { setMigrateTarget(p); setIsMigrateOpen(true); }}
                                                            onDelete={handleDelete}
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* Móvil: tarjetas apiladas — se ve toda la obra sin scroll horizontal */}
                            <div className="space-y-3 px-4 pb-4 md:hidden">
                                {(!projects || projects.length === 0) ? (
                                    <p className="py-10 text-center text-sm text-muted-foreground">
                                        No hay obras registradas. Crea una nueva obra para comenzar.
                                    </p>
                                ) : (
                                    projects.map((project) => (
                                        <div key={project.id} className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="truncate font-semibold">{project.name}</p>
                                                    <p className="truncate text-xs text-muted-foreground">{project.address || 'Sin dirección'}</p>
                                                </div>
                                                <StatusBadge tone={project.isActive ? 'success' : 'neutral'}>
                                                    {project.isActive ? 'Activa' : 'Inactiva'}
                                                </StatusBadge>
                                            </div>

                                            <div className="space-y-1.5">
                                                <Label className="text-xs text-muted-foreground">Cliente</Label>
                                                <ClientAssignSelect
                                                    project={project}
                                                    clients={clients}
                                                    disabled={!canManageProjects}
                                                    onAssign={handleAssignClient}
                                                />
                                            </div>

                                            <div className="flex items-center justify-between border-t border-border pt-3">
                                                <span className="text-xs text-muted-foreground">Creada: {formatDate(project.createdAt)}</span>
                                                <ProjectActions
                                                    project={project}
                                                    onMigrate={(p) => { setMigrateTarget(p); setIsMigrateOpen(true); }}
                                                    onDelete={handleDelete}
                                                />
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                    </PanelCard>
                </TabsContent>

                <TabsContent value="global" className="space-y-6">
                    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
                        <StatTile label="Total Obras" value={projects.length} icon={Construction} />
                        <StatTile label="Herramientas Totales" value={tools.length} icon={Wrench} tone="info" />
                        <StatTile label="Personal de la Empresa" value={users.length} icon={UsersIcon} tone="warning" />
                        <StatTile label="Stock Unificado" value={materials.reduce((acc, m) => acc + m.stock, 0)} icon={Package} tone="success" />
                    </div>

                    <PanelCard
                        title="Resumen por Centro de Costo (Obra)"
                        description="Distribución de recursos y personal por cada proyecto activo."
                        icon={HardHat}
                        contentClassName="px-0 pb-0"
                    >
                            {/* Desktop: tabla */}
                            <div className="hidden md:block">
                                <Table>
                                    <TableHeader className="border-t border-border bg-muted">
                                        <TableRow>
                                            <TableHead>Obra</TableHead>
                                            <TableHead className="text-center">Personal</TableHead>
                                            <TableHead className="text-center">Herramientas</TableHead>
                                            <TableHead className="text-center">Materiales (Tipos)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {projects.map((project) => {
                                            const projectUsers = users.filter(u => u.assignedProjectIds?.includes(project.id));
                                            const projectTools = tools.filter(t => t.projectId === project.id);
                                            const projectMaterials = materials.filter(m => m.projectId === project.id);

                                            return (
                                                <TableRow key={project.id}>
                                                    <TableCell className="font-medium">{project.name}</TableCell>
                                                    <TableCell className="text-center">{projectUsers.length}</TableCell>
                                                    <TableCell className="text-center">{projectTools.length}</TableCell>
                                                    <TableCell className="text-center">{projectMaterials.length}</TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* Móvil: tarjetas con los 3 conteos */}
                            <div className="space-y-3 px-4 pb-4 md:hidden">
                                {projects.map((project) => {
                                    const projectUsers = users.filter(u => u.assignedProjectIds?.includes(project.id));
                                    const projectTools = tools.filter(t => t.projectId === project.id);
                                    const projectMaterials = materials.filter(m => m.projectId === project.id);

                                    return (
                                        <div key={project.id} className="rounded-xl border border-border bg-muted/40 p-4">
                                            <p className="mb-3 truncate font-semibold">{project.name}</p>
                                            <div className="grid grid-cols-3 gap-2 text-center">
                                                <div>
                                                    <div className="text-lg font-bold tabular-nums">{projectUsers.length}</div>
                                                    <div className="text-[11px] text-muted-foreground">Personal</div>
                                                </div>
                                                <div>
                                                    <div className="text-lg font-bold tabular-nums">{projectTools.length}</div>
                                                    <div className="text-[11px] text-muted-foreground">Herramientas</div>
                                                </div>
                                                <div>
                                                    <div className="text-lg font-bold tabular-nums">{projectMaterials.length}</div>
                                                    <div className="text-[11px] text-muted-foreground">Materiales</div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                    </PanelCard>

                    <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border bg-card py-12 text-center text-muted-foreground">
                        <p>Este panel permite a los administradores de la empresa supervisar la distribución global de activos.</p>
                        <p className="mt-2 text-sm">La transferencia de herramientas entre obras se realiza desde el módulo de Inventario.</p>
                    </div>
                </TabsContent>

                {/* Dialog: Crear Obra */}
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Nueva Obra de Construcción</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleCreate}>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="project-name">Nombre de la Obra *</Label>
                                    <Input
                                        id="project-name"
                                        placeholder="Ej: Edificio Torres del Sol"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="project-address">Dirección</Label>
                                    <Input
                                        id="project-address"
                                        placeholder="Ej: Av. Los Olivos 1234, Santiago"
                                        value={newAddress}
                                        onChange={(e) => setNewAddress(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="project-client">Cliente</Label>
                                    <Select value={newClientId} onValueChange={setNewClientId}>
                                        <SelectTrigger id="project-client">
                                            <SelectValue placeholder="Sin asignar" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Sin asignar</SelectItem>
                                            {clients.map(c => (
                                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {clients.length === 0 && (
                                        <p className="text-xs text-muted-foreground">
                                            Aún no tienes clientes. Puedes crear la obra sin asignar y vincularla después.
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="project-desc">Descripción (opcional)</Label>
                                    <Input
                                        id="project-desc"
                                        placeholder="Descripción breve del proyecto..."
                                        value={newDescription}
                                        onChange={(e) => setNewDescription(e.target.value)}
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
                                <Button type="submit" disabled={isSubmitting || !newName.trim()}>
                                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Crear Obra
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>

                {/* Dialog: Migrar Datos */}
                <Dialog open={isMigrateOpen} onOpenChange={(open) => { if (!isSubmitting) setIsMigrateOpen(open); }}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Database className="h-5 w-5 text-info" />
                                Migrar Datos a "{migrateTarget?.name}"
                            </DialogTitle>
                        </DialogHeader>
                        <div className="py-4 space-y-3">
                            <p className="text-sm text-muted-foreground">
                                Esta acción buscará todos los documentos (materiales, solicitudes, herramientas, etc.)
                                que pertenecen a tu empresa pero que <strong>no tienen una obra asignada</strong>, y les asignará
                                la obra seleccionada.
                            </p>
                            <p className="text-sm font-medium text-warning">
                                ⚠️ Esto es útil para migrar datos creados antes de implementar el sistema de obras múltiples.
                            </p>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsMigrateOpen(false)} disabled={isSubmitting}>
                                Cancelar
                            </Button>
                            <Button onClick={handleMigrate} disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Iniciar Migración
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </Tabs>
        </div>
    );
}
