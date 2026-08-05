"use client";

import React, { useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { useAuth, useAppState } from "@/modules/core/contexts/app-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Crown, AlertCircle, Check, Lock } from "lucide-react";
import { EditPlanForm } from "@/components/admin/edit-plan-form";
import { SubscriptionPlan } from "@/modules/core/lib/data";
import { PLANS } from "@/modules/core/lib/permissions";
import {
    PLAN_FEATURES, PLAN_ORDER, PLAN_LABEL, planIncludesFeature, type PlanFeature,
} from "@/lib/plan-features";

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

            <ModulosPorPlan />

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

/**
 * Qué módulos abre cada plan. Es de solo lectura: el reparto vive en
 * `src/lib/plan-features.ts` y lo aplica `can()`, así que esta tabla es la
 * misma verdad que ve el cliente, no una lista aparte que se desincroniza.
 */
function ModulosPorPlan() {
    const features = Object.keys(PLAN_FEATURES) as PlanFeature[];

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Módulos que abre cada plan</CardTitle>
                <CardDescription>
                    Todo lo que no aparece acá (obra, bodega, compras, asistencia, contrato,
                    presupuesto, estados de pago y adicionales) va incluido en los tres planes.
                </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                    <thead>
                        <tr className="border-b border-border text-left">
                            <th className="pb-2 font-medium text-muted-foreground">Módulo</th>
                            {PLAN_ORDER.map((tier) => (
                                <th key={tier} className="pb-2 text-center font-medium text-muted-foreground">
                                    {PLAN_LABEL[tier]}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {features.map((feature) => (
                            <tr key={feature} className="border-b border-border/50 last:border-0">
                                <td className="py-2.5 pr-4">
                                    <div className="font-medium text-foreground">{PLAN_FEATURES[feature].label}</div>
                                    <div className="text-xs text-muted-foreground">{PLAN_FEATURES[feature].description}</div>
                                </td>
                                {PLAN_ORDER.map((tier) => (
                                    <td key={tier} className="py-2.5 text-center">
                                        {planIncludesFeature(tier, feature)
                                            ? <Check className="mx-auto h-4 w-4 text-success" />
                                            : <Lock className="mx-auto h-4 w-4 text-muted-foreground/40" />}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </CardContent>
        </Card>
    );
}
