"use client";

import React, { useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { formatCLP } from '@/lib/format';
import { useAppState, useAuth } from '@/modules/core/contexts/app-provider';
import Link from 'next/link';
import { PanelCard } from '@/components/ui/panel-card';
import { StatTile } from '@/components/ui/stat-tile';
import { Button } from '@/components/ui/button';
import { Briefcase, DollarSign, TrendingUp, FileText, Loader2, ArrowRight } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/modules/core/hooks/use-toast';
import { generateEstadoDePagoPDF } from '@/lib/ep-pdf-generator';

export default function PaymentStatusDashboard() {
    const { workItems, addPaymentState } = useAppState();
    const { user } = useAuth();
    const { toast } = useToast();
    const [isGenerating, setIsGenerating] = useState(false);

    const contractorStats = useMemo(() => {
        if (!user || !workItems) return { totalValue: 0, earnedValue: 0, itemCount: 0, overallProgress: 0, myItems: [] };

        const myItems = workItems.filter(item => item.assignedTo === user.id);
        
        const totalValue = myItems.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
        const earnedValue = myItems.reduce((acc, item) => acc + (item.quantity * item.unitPrice * ((item.progress || 0) / 100)), 0);
        const itemCount = myItems.length;
        
        const overallProgress = totalValue > 0 ? (earnedValue / totalValue) * 100 : 0;

        return { totalValue, earnedValue, itemCount, overallProgress, myItems };
    }, [workItems, user]);


    const handleGeneratePaymentState = async () => {
        if (!user || contractorStats.myItems.length === 0) {
            toast({ variant: 'destructive', title: 'Error', description: 'No hay partidas para generar un estado de pago.' });
            return;
        }
        setIsGenerating(true);
        try {
            const { totalValue, earnedValue, myItems } = contractorStats;
            const newEpId = await addPaymentState({ totalValue, earnedValue, items: myItems });
            toast({ title: 'Estado de Pago Generado', description: 'Tu estado de pago ha sido enviado para aprobación.' });

            // Generar PDF
            if (user && myItems.length > 0) {
                await generateEstadoDePagoPDF(newEpId, user.name, totalValue, earnedValue, myItems);
            }

        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message || 'No se pudo generar el estado de pago.' });
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="flex flex-col gap-8 pb-10">
            <PageHeader
                title="Estado de Pago"
                description="Vista general del valor de tus contratos, el avance y las ganancias."
                actions={
                    <Button asChild variant="outline">
                        <Link href="/dashboard/estado-pago/contratos">
                            <Briefcase className="mr-2 h-4 w-4" />
                            Gestionar Partidas
                        </Link>
                    </Button>
                }
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <StatTile label="Total Partidas" value={contractorStats.itemCount} icon={Briefcase} />
                <StatTile label="Valor Total Contratado" value={formatCLP(contractorStats.totalValue)} icon={DollarSign} tone="info" />
                <StatTile label="Total Ganado (a la fecha)" value={formatCLP(contractorStats.earnedValue)} icon={TrendingUp} tone="success" />
            </div>

            <PanelCard
                title="Progreso General"
                description="Porcentaje de avance general ponderado por el valor de cada partida."
                icon={TrendingUp}
            >
                <Progress value={contractorStats.overallProgress} className="h-4" />
                <p className="mt-2 text-right text-xl font-bold tracking-tighter text-primary">{contractorStats.overallProgress.toFixed(2)}%</p>
            </PanelCard>

            <PanelCard
                title="Generar Nuevo Estado de Pago"
                description="Se creará un registro con el avance actual para su aprobación y posterior facturación."
                icon={FileText}
                className="border-primary/40"
            >
                {contractorStats.itemCount === 0 ? (
                    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-4">
                        <p className="text-sm text-muted-foreground">
                            Aún no tienes partidas asignadas. Agrégalas para poder generar tu estado de pago.
                        </p>
                        <Button asChild variant="cta" size="sm">
                            <Link href="/dashboard/estado-pago/contratos">
                                Agregar partidas <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                    </div>
                ) : (
                    <Button onClick={handleGeneratePaymentState} disabled={isGenerating}>
                        {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <FileText className="mr-2 h-4 w-4"/>}
                        Generar y Descargar Estado de Pago Actual
                    </Button>
                )}
            </PanelCard>
        </div>
    );
}
