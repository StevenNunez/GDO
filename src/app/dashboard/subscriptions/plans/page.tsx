"use client";

import React, { useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { useAuth, useAppState } from "@/modules/core/contexts/app-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Crown, AlertCircle } from "lucide-react";
import { EditPlanForm } from "@/components/admin/edit-plan-form";
import { SubscriptionPlan } from "@/modules/core/lib/data";
import { PLANS } from "@/modules/core/lib/permissions";

export default function SubscriptionPlansPage() {
    const { subscriptionPlans, can } = useAppState();

    const plans = useMemo(() => {
        const plansSource = subscriptionPlans || PLANS;
        // Explicitly type the keys and the resulting array to satisfy TypeScript
        const planKeys = Object.keys(plansSource) as Array<keyof typeof plansSource>;
        return planKeys.map(key => {
            const planData = plansSource[key];
            return {
                id: key,
                ...planData
            } as SubscriptionPlan & { id: string };
        });
    }, [subscriptionPlans]);

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
    
    return (
        <div className="flex flex-col gap-8">
            <PageHeader
                title="Gestión de Planes y Permisos"
                description="Define qué puede hacer cada tipo de plan de suscripción."
            />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {plans.map(plan => (
                    <Card key={plan.id}>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Crown className="h-5 w-5 text-primary"/>
                                <span className="capitalize">{plan.plan}</span>
                            </CardTitle>
                            <CardDescription>
                                Gestiona los permisos disponibles para el plan {plan.plan}.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <EditPlanForm plan={plan} />
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
