
"use client";

import React, { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { useAuth, useAppState } from '@/modules/core/contexts/app-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { EditTenantForm } from '@/components/admin/edit-tenant-form';
import { TenantModulesForm } from '@/components/admin/tenant-modules-form';
import type { Tenant } from '@/modules/core/lib/data';

export default function TenantDetailPage() {
    const { tenants } = useAuth();
    const { can } = useAppState();
    const router = useRouter();
    const params = useParams();
    const tenantId = params.id as string;

    const tenant = useMemo(() => {
        if (!tenants || !tenantId) return null;
        return tenants.find((t: Tenant) => t.id === tenantId) || null;
    }, [tenants, tenantId]);

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
    
    if (!tenant) {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                 <Button variant="ghost" onClick={() => router.back()} className="self-start mb-4">
                    <ArrowLeft className="mr-2"/> Volver
                </Button>
                <Loader2 className="h-8 w-8 animate-spin my-4"/>
                <p>Cargando datos del suscriptor...</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-8">
            <div className="flex items-center gap-4">
                 <Button variant="outline" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <PageHeader
                    title={`Gestionar: ${tenant.name}`}
                    description={`ID: ${tenant.tenantId}`}
                    className="mb-0"
                />
            </div>

            <div className="grid w-full items-start gap-8 lg:grid-cols-3">
                 <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle>Detalles del Suscriptor</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <EditTenantForm tenant={tenant} />
                    </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Módulos habilitados</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {/* La key se reinicia solo cuando cambia lo guardado (o el
                            plan), no en cada refetch de la fila: así no se pierden
                            los cambios a medio hacer. */}
                        <TenantModulesForm
                            key={`${tenant.plan ?? 'sin-plan'}:${JSON.stringify(tenant.moduleOverrides ?? {})}`}
                            tenant={tenant}
                        />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
