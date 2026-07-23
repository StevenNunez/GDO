
'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { useAuth, useAppState } from '@/modules/core/contexts/app-provider';
import { PanelCard } from '@/components/ui/panel-card';
import { SurfaceCard } from '@/components/ui/surface-card';
import { formatCLP } from '@/lib/format';
import { CreateWorkItemForm } from '@/components/operations/create-work-item-form';
import { ArrowRight, Briefcase, DollarSign, FolderPlus, Percent } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';

export default function ContractorContractsListPage() {
  const { user } = useAuth();
  const { workItems, isLoading } = useAppState();
  const router = useRouter();

  const myContracts = useMemo(() => {
    if (!workItems || !user) return [];
    
    const allItems = workItems.filter(item => item.assignedTo === user.id || item.createdBy === user.id);
    const projects = allItems.filter(item => item.type === 'project');

    return projects.map(project => {
        const children = allItems.filter(item => item.parentId === project.id);
        const totalValue = children.reduce((acc, item) => acc + (item.quantity * item.unitPrice), project.unitPrice * project.quantity);
        const totalProgress = children.length > 0
            ? children.reduce((acc, item) => acc + (item.progress || 0), 0) / children.length
            : (project.progress || 0);

        return {
            ...project,
            totalValue,
            totalProgress,
            childCount: children.length
        }
    });

  }, [workItems, user]);

  return (
    <div className="flex flex-col gap-8 fade-in pb-12">
      <PageHeader
        title="Mis Contratos y Obras"
        description="Gestiona tus obras asignadas, registra avances y visualiza tu progreso."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Columna Izquierda: Crear nuevo */}
        <div className="lg:col-span-1">
            <PanelCard
                className="sticky top-8"
                title="Crear Contrato o Partida"
                description="Crea un nuevo contrato (obra) o añade una partida a un contrato existente."
                icon={FolderPlus}
            >
                <CreateWorkItemForm workItems={myContracts} />
            </PanelCard>
        </div>

        {/* Columna Derecha: Lista de Contratos */}
        <div className="lg:col-span-2 space-y-4">
            <h2 className="text-xl font-bold tracking-tight">Lista de Contratos Activos</h2>
            {myContracts.length > 0 ? (
                myContracts.map(contract => (
                    <SurfaceCard key={contract.id} interactive={false} className="p-6">
                        <div className="flex items-start justify-between">
                            <div>
                                <h3 className="flex items-center gap-2 text-base font-bold tracking-tight">
                                    <Briefcase className="h-5 w-5 text-muted-foreground"/>
                                    {contract.name}
                                </h3>
                                <p className="text-sm text-muted-foreground">{contract.childCount} partidas asociadas</p>
                            </div>
                            <Button size="sm" onClick={() => router.push(`/dashboard/estado-pago/contratos/${contract.id}`)}>
                                Gestionar <ArrowRight className="ml-2 h-4 w-4"/>
                            </Button>
                        </div>
                        <div className="mt-4">
                            <div className="mb-1 flex items-center justify-between text-sm text-muted-foreground">
                                <span className="flex items-center gap-1.5"><Percent className="h-3 w-3"/> Progreso</span>
                                <span className="flex items-center gap-1.5"><DollarSign className="h-3 w-3"/> Valor Total</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="text-lg font-bold tracking-tighter text-primary">{contract.totalProgress.toFixed(1)}%</div>
                                <div className="text-lg font-bold tracking-tight">{formatCLP(contract.totalValue)}</div>
                            </div>
                            <Progress value={contract.totalProgress} className="mt-2 h-2" />
                        </div>
                    </SurfaceCard>
                ))
            ) : (
                <div className="rounded-3xl border-2 border-dashed border-border bg-card py-16 text-center text-muted-foreground">
                    <p>No tienes contratos asignados.</p>
                    <p className="text-sm">Usa el formulario para crear tu primer contrato.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}
