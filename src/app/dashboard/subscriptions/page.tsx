
"use client";

import React, { useMemo } from "react";
import { useRouter } from 'next/navigation';
import { PageHeader } from "@/components/page-header";
import { useAuth, useAppState } from "@/modules/core/contexts/app-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Edit, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { CreateTenantForm } from "@/components/admin/create-tenant-form";
import type { Tenant } from "@/modules/core/lib/data";
import { toDate } from "@/lib/date-utils";
import {
    PLAN_LABEL, normalizePlanTier, overrideSummary, parseModuleOverrides,
} from "@/lib/plan-features";

export default function SubscriptionsPage() {
    const { tenants } = useAuth();
    const { can } = useAppState();
    const router = useRouter();

    const sortedTenants = useMemo(() => {
        if (!tenants) return [];
        return [...tenants].sort((a, b) => a.name.localeCompare(b.name));
    }, [tenants]);

    if (!can('module_subscriptions:view')) {
      return (
        <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Acceso Denegado</AlertTitle>
            <AlertDescription>
                No tienes los permisos necesarios para acceder a esta sección.
            </AlertDescription>
        </Alert>
      );
    }
    
    const formatDate = (date: Date | string | undefined | null) => {
        const jsDate = toDate(date);
        if (!jsDate) return 'N/A';
        return jsDate.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    return (
        <div className="flex flex-col gap-8">
            <PageHeader
                title="Gestión de Suscriptores"
                description="Administra los clientes (tenants) de la plataforma. Crea nuevas suscripciones e invita a sus administradores."
            />

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 items-start">
                <div className="lg:col-span-1">
                     <Card>
                        <CardHeader>
                            <CardTitle>Añadir Nuevo Suscriptor</CardTitle>
                            <CardDescription>Crea un nuevo cliente e invita a su administrador inicial.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <CreateTenantForm />
                        </CardContent>
                    </Card>
                </div>
                <div className="lg:col-span-2">
                     <Card>
                        <CardHeader>
                            <CardTitle>Lista de Suscriptores Activos</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ScrollArea className="h-[calc(80vh-10rem)] border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Nombre de Empresa</TableHead>
                                            <TableHead>ID (RUT)</TableHead>
                                                                <TableHead>Plan y módulos</TableHead>
                                            <TableHead>Fecha Creación</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sortedTenants.map((tenant: Tenant) => (
                                            <TableRow key={tenant.id}>
                                                <TableCell className="font-semibold">{tenant.name}</TableCell>
                                                <TableCell>{tenant.tenantId}</TableCell>
                                                <TableCell><PlanCell tenant={tenant} /></TableCell>
                                                <TableCell>{formatDate(tenant.createdAt)}</TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/subscriptions/${tenant.id}`)}>
                                                        <Edit className="h-4 w-4"/>
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                {sortedTenants.length === 0 && (
                                    <div className="text-center p-10 text-muted-foreground">
                                        No hay suscriptores creados.
                                    </div>
                                )}
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

/**
 * Plan efectivo de la empresa y cuántos módulos se le tocaron a mano. Un tenant
 * sin plan cargado se trata como Básico, y acá se dice: si no, el super-admin ve
 * una celda vacía y no se entera de que ese cliente está viendo de menos.
 */
function PlanCell({ tenant }: { tenant: Tenant }) {
    const tier = normalizePlanTier(tenant.plan);
    const { agregados, quitados } = overrideSummary(tier, parseModuleOverrides(tenant.moduleOverrides));

    return (
        <div className="space-y-1">
            <Badge variant={tier === 'basic' ? 'secondary' : 'default'}>{PLAN_LABEL[tier]}</Badge>
            {!tenant.plan && (
                <div className="text-xs text-warning">Sin plan cargado · se trata como Básico</div>
            )}
            {(agregados.length > 0 || quitados.length > 0) && (
                <div className="text-xs text-muted-foreground">
                    {agregados.length > 0 && `+${agregados.length} módulo(s) extra`}
                    {agregados.length > 0 && quitados.length > 0 && ' · '}
                    {quitados.length > 0 && `−${quitados.length} quitado(s)`}
                </div>
            )}
        </div>
    );
}
