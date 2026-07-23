"use client";

import React, { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useAppState, useAuth } from "@/modules/core/contexts/app-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Shield, AlertCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { UserRole } from "@/modules/core/lib/data";
import { PERMISSIONS, Permission, ROLES, ROLES_ORDER } from "@/modules/core/lib/permissions";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/modules/core/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

type GroupedPermissions = { [group: string]: { key: string; label: string }[] };

// Non-editable roles: these users always have full access regardless of DB
const ALWAYS_FULL_ACCESS: UserRole[] = ['super-admin', 'soporte', 'admin', 'operations'];

const RoleCard = ({
    role,
    label,
    description,
    capabilities,
    isEditable,
    isSuperAdmin,
    savingKey,
    onPermissionChange,
}: {
    role: UserRole;
    label: string;
    description: string;
    capabilities: string[];
    isEditable: boolean;
    isSuperAdmin: boolean;
    savingKey: string | null;
    onPermissionChange: (role: UserRole, permission: Permission, checked: boolean) => void;
}) => {
    const groupedPermissions = React.useMemo(() => {
        return (Object.keys(PERMISSIONS) as Permission[]).reduce((acc, key) => {
            const perm = PERMISSIONS[key];
            const group = perm.group || 'General';
            if (!isSuperAdmin && group === 'Plataforma') return acc;
            if (!acc[group]) acc[group] = [];
            acc[group].push({ key, label: perm.label });
            return acc;
        }, {} as GroupedPermissions);
    }, [isSuperAdmin]);

    const totalVisible = Object.values(groupedPermissions).flat().length;
    const activeCount = capabilities.filter(p => Object.keys(PERMISSIONS).includes(p)).length;
    const isFullAccess = ALWAYS_FULL_ACCESS.includes(role);

    return (
        <AccordionItem value={role}>
            <AccordionTrigger className="hover:no-underline px-1">
                <div className="flex items-center justify-between w-full pr-4 gap-4">
                    <div className="flex flex-col text-left">
                        <span className="font-semibold text-base">{label}</span>
                        <span className="text-sm text-muted-foreground font-normal">{description}</span>
                    </div>
                    <div className="shrink-0">
                        {isFullAccess ? (
                            <Badge variant="default" className="bg-amber-500 text-white">Acceso Total</Badge>
                        ) : (
                            <Badge variant="outline" className="font-mono">
                                {activeCount}/{totalVisible}
                            </Badge>
                        )}
                    </div>
                </div>
            </AccordionTrigger>
            <AccordionContent>
                {isFullAccess ? (
                    <div className="p-4 bg-amber-900/20 border border-amber-700/40 rounded-md text-sm text-amber-400">
                        Este rol tiene acceso completo a todas las funciones del sistema. Sus permisos no son editables.
                    </div>
                ) : (
                    <div className="p-4 bg-muted/50 rounded-md space-y-6">
                        {Object.keys(groupedPermissions).sort().map(groupName => (
                            <div key={groupName}>
                                <h4 className="font-medium mb-3 text-sm text-primary uppercase tracking-wide">
                                    {groupName}
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {groupedPermissions[groupName].map(({ key, label }) => {
                                        const hasCapability = capabilities.includes(key);
                                        const currentSavingKey = `${role}-${key}`;
                                        const isSaving = savingKey === currentSavingKey;
                                        return (
                                            <div
                                                key={key}
                                                className={cn(
                                                    "flex items-center gap-2 p-2 rounded-md transition-colors",
                                                    hasCapability && !isSaving ? "bg-green-900/25" : "",
                                                    isSaving ? "opacity-60" : ""
                                                )}
                                            >
                                                {isSaving ? (
                                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                                                ) : (
                                                    <Switch
                                                        id={currentSavingKey}
                                                        checked={hasCapability}
                                                        onCheckedChange={(checked) => onPermissionChange(role, key as Permission, checked)}
                                                        disabled={!isEditable || isSaving}
                                                    />
                                                )}
                                                <Label
                                                    htmlFor={currentSavingKey}
                                                    className={cn(
                                                        "text-sm leading-tight cursor-pointer text-foreground",
                                                        !isEditable && "cursor-default text-muted-foreground"
                                                    )}
                                                >
                                                    {label}
                                                </Label>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </AccordionContent>
        </AccordionItem>
    );
};

export default function PermissionsPage() {
    const { roles, updateRolePermissions, can } = useAppState();
    const { user } = useAuth();
    const { toast } = useToast();
    const [savingKey, setSavingKey] = useState<string | null>(null);

    const handlePermissionChange = async (role: UserRole, permission: Permission, checked: boolean) => {
        const key = `${role}-${permission}`;
        setSavingKey(key);
        try {
            await updateRolePermissions(role, permission, checked);
            toast({
                title: checked ? "Permiso activado" : "Permiso desactivado",
                description: `${PERMISSIONS[permission]?.label || permission} → ${ROLES[role]?.label || role}`,
            });
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Error al guardar',
                description: error.message || "No se pudo actualizar el permiso.",
            });
        } finally {
            setSavingKey(null);
        }
    };

    const visibleRoles = React.useMemo(() => {
        if (!user) return [];
        const canManage = can('permissions:manage');

        return ROLES_ORDER
            .map(roleKey => {
                const defaultRole = ROLES[roleKey];
                if (!defaultRole) return null;

                const dbRole = (roles as any)?.[roleKey];
                const isAlwaysFull = ALWAYS_FULL_ACCESS.includes(roleKey as UserRole);

                // Non-super-admin cannot edit super-admin or admin roles
                const canEdit = user.role === 'super-admin'
                    ? true
                    : canManage && !(['super-admin', 'soporte', 'admin'] as UserRole[]).includes(roleKey as UserRole);

                return {
                    key: roleKey,
                    label: defaultRole.label,
                    description: defaultRole.description,
                    permissions: isAlwaysFull
                        ? Object.keys(PERMISSIONS)
                        : (dbRole?.permissions ?? defaultRole.permissions),
                    isEditable: canEdit,
                };
            })
            .filter(Boolean)
            .filter(r => user.role === 'super-admin' || (r!.key !== 'super-admin' && r!.key !== 'soporte'));
    }, [user, roles, can]);

    if (!can('module_permissions:view')) {
        return (
            <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Acceso Denegado</AlertTitle>
                <AlertDescription>No tienes permiso para acceder a esta sección.</AlertDescription>
            </Alert>
        );
    }

    const readOnly = !can('permissions:manage') && user?.role !== 'super-admin';

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="Gestión de Permisos y Roles"
                description="Configura qué puede hacer cada rol en TU empresa. Los cambios se aplican en tiempo real y no afectan a otras empresas."
            />

            {readOnly && (
                <Alert>
                    <Shield className="h-4 w-4" />
                    <AlertTitle>Solo Lectura</AlertTitle>
                    <AlertDescription>
                        Puedes ver los permisos pero no modificarlos. Contacta a un administrador para realizar cambios.
                    </AlertDescription>
                </Alert>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Roles del Sistema
                    </CardTitle>
                    <CardDescription>
                        Expande un rol para ver y editar sus permisos. El número indica permisos activos sobre el total disponible.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Accordion type="multiple" className="w-full divide-y">
                        {visibleRoles.map((roleData) => (
                            <RoleCard
                                key={roleData!.key}
                                role={roleData!.key as UserRole}
                                label={roleData!.label}
                                description={roleData!.description}
                                capabilities={roleData!.permissions}
                                isEditable={roleData!.isEditable}
                                isSuperAdmin={user?.role === 'super-admin'}
                                savingKey={savingKey}
                                onPermissionChange={handlePermissionChange}
                            />
                        ))}
                    </Accordion>
                </CardContent>
            </Card>
        </div>
    );
}
