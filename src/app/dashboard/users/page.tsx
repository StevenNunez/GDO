"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { useAppState, useAuth } from "@/modules/core/contexts/app-provider";
import { PanelCard } from "@/components/ui/panel-card";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { User, UserRole } from "@/modules/core/lib/data";
import { MoreHorizontal, Trash2, Edit, QrCode, Search, X, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EditUserForm } from "@/components/admin/edit-user-form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/modules/core/hooks/use-toast";
import QRCode from "react-qr-code";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLES } from "@/modules/core/lib/permissions";


export default function AdminUsersPage() {
    const { users, deleteUser, can, currentProjectId } = useAppState();
    const { user: authUser } = useAuth();
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [roleFilter, setRoleFilter] = useState<string>("all");
    const { toast } = useToast();

    const getInitials = (name: string) => {
        if (!name) return '??';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    const getRoleDisplayName = (role: UserRole) => ROLES[role]?.label || role;

    const getRoleTone = (role: UserRole): StatusTone => {
        switch (role) {
            case 'super-admin':
            case 'soporte':
            case 'admin': return 'danger';
            case 'operations': return 'info';
            default: return 'neutral';
        }
    };

    const handleDeleteUser = async (userId: string, userName: string) => {
        try {
            await deleteUser(userId);
            toast({
                title: "Usuario Eliminado",
                description: `${userName} ha sido eliminado del sistema.`,
            });
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error al eliminar",
                description: error?.message || "No se pudo eliminar el usuario.",
            });
        }
    };

    const filteredUsers = useMemo(() => {
        if (!users) return [];

        let result = users;

        if (currentProjectId) {
            result = result.filter((u: User) =>
                u.assignedProjectIds?.includes(currentProjectId) ||
                u.role === 'admin' ||
                u.role === 'soporte' ||
                u.role === 'super-admin'
            );
        }

        if (roleFilter !== "all") {
            result = result.filter((u: User) => u.role === roleFilter);
        }

        if (searchTerm.trim()) {
            const lower = searchTerm.toLowerCase();
            result = result.filter((u: User) =>
                u.name.toLowerCase().includes(lower) ||
                u.email.toLowerCase().includes(lower) ||
                (u.rut && u.rut.includes(searchTerm)) ||
                (u.cargo && u.cargo.toLowerCase().includes(lower))
            );
        }

        return result;
    }, [users, searchTerm, roleFilter, currentProjectId]);

    const rolesInUse = useMemo(() => {
        if (!users) return [];
        const set = new Set(users.map((u: User) => u.role));
        return Array.from(set).sort();
    }, [users]);

    return (
        <div className="flex flex-col gap-8 pb-10">
            <PageHeader
                title="Gestión de Usuarios"
                description="Crea, visualiza y gestiona todos los perfiles registrados en el sistema."
            />

            {editingUser && can('users:edit') && (
                <EditUserForm
                    user={editingUser}
                    isOpen={!!editingUser}
                    onClose={() => setEditingUser(null)}
                />
            )}

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                {can('users:create') && (
                    <div className="lg:col-span-1">
                        <PanelCard
                            title="Crear Nuevo Usuario"
                            description="Añade nuevos miembros al sistema y asígnales un rol."
                            icon={UserPlus}
                        >
                            <CreateUserForm />
                        </PanelCard>
                    </div>
                )}
                <div className={can('users:create') ? "lg:col-span-2" : "lg:col-span-3"}>
                    <PanelCard
                        title="Lista de Usuarios"
                        description={`${filteredUsers.length} usuario${filteredUsers.length !== 1 ? 's' : ''} encontrado${filteredUsers.length !== 1 ? 's' : ''}`}
                        icon={Users}
                        actions={
                            can('users:print_qr') ? (
                                <Button asChild>
                                    <Link href="/dashboard/users/print-qrs">
                                        <QrCode className="mr-2 h-4 w-4" />
                                        Imprimir Credenciales
                                    </Link>
                                </Button>
                            ) : undefined
                        }
                    >
                            <div className="mb-4 flex flex-col sm:flex-row gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Buscar por nombre, correo, RUT o cargo..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-8"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                                        <SelectTrigger className="w-[180px]">
                                            <SelectValue placeholder="Filtrar por rol" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos los roles</SelectItem>
                                            {rolesInUse.map((role) => (
                                                <SelectItem key={role} value={role}>
                                                    {getRoleDisplayName(role as UserRole)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {(searchTerm || roleFilter !== "all") && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => { setSearchTerm(""); setRoleFilter("all"); }}
                                            className="h-9 w-9 shrink-0"
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <ScrollArea className="h-[calc(70vh)] rounded-md border border-border">
                                <div className="space-y-2 p-3">
                                    {filteredUsers.map((user: User) => (
                                        <div key={user.id} className="flex flex-col gap-4 rounded-xl border border-border bg-muted/40 p-3 transition-colors hover:bg-muted sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex items-center gap-3 flex-grow min-w-0">
                                                <Avatar className="bg-secondary text-secondary-foreground h-10 w-10 shrink-0">
                                                    <AvatarFallback className="text-sm font-semibold">{getInitials(user.name)}</AvatarFallback>
                                                </Avatar>
                                                <div className="flex flex-col gap-0.5 min-w-0">
                                                    <p className="font-semibold truncate">{user.name}</p>
                                                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                                                    {user.cargo && (
                                                        <p className="text-xs text-muted-foreground">{user.cargo}</p>
                                                    )}
                                                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                                        <StatusBadge tone={getRoleTone(user.role)} className="h-4 px-1.5 py-0 text-[10px]">
                                                            {getRoleDisplayName(user.role)}
                                                        </StatusBadge>
                                                        {user.rut && (
                                                            <StatusBadge tone="neutral" className="h-4 px-1.5 py-0 font-mono text-[10px]">
                                                                {user.rut}
                                                            </StatusBadge>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                                {user.qrCode && (
                                                    // Fondo blanco fijo: el QR necesita blanco para escanear.
                                                    <div className="rounded-md bg-white p-1">
                                                        <QRCode value={user.qrCode} size={44} />
                                                    </div>
                                                )}
                                                {can('users:edit') && (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                                <span className="sr-only">Abrir menu</span>
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem onClick={() => setEditingUser(user)}>
                                                                <Edit className="mr-2 h-4 w-4" />
                                                                Editar Perfil
                                                            </DropdownMenuItem>
                                                            {can('users:delete') && (
                                                                <AlertDialog>
                                                                    <AlertDialogTrigger asChild>
                                                                        <DropdownMenuItem
                                                                            onSelect={(e) => e.preventDefault()}
                                                                            disabled={authUser?.id === user.id}
                                                                        >
                                                                            <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                                                                            <span className="text-destructive">Eliminar</span>
                                                                        </DropdownMenuItem>
                                                                    </AlertDialogTrigger>
                                                                    <AlertDialogContent>
                                                                        <AlertDialogHeader>
                                                                            <AlertDialogTitle>¿Eliminar a {user.name}?</AlertDialogTitle>
                                                                            <AlertDialogDescription>
                                                                                Esta acción es permanente e irreversible. Se eliminará el perfil y la cuenta de acceso de <strong>{user.name}</strong> del sistema.
                                                                            </AlertDialogDescription>
                                                                        </AlertDialogHeader>
                                                                        <AlertDialogFooter>
                                                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                            <AlertDialogAction
                                                                                className="bg-destructive hover:bg-destructive/90"
                                                                                onClick={() => handleDeleteUser(user.id, user.name)}
                                                                            >
                                                                                Sí, eliminar
                                                                            </AlertDialogAction>
                                                                        </AlertDialogFooter>
                                                                    </AlertDialogContent>
                                                                </AlertDialog>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {filteredUsers.length === 0 && (
                                        <div className="py-12 text-center text-muted-foreground">
                                            <p className="font-medium">No se encontraron usuarios</p>
                                            <p className="mt-1 text-sm">Prueba con otros filtros de búsqueda.</p>
                                        </div>
                                    )}
                                </div>
                                <ScrollBar orientation="vertical" />
                            </ScrollArea>
                    </PanelCard>
                </div>
            </div>
        </div>
    );
}
