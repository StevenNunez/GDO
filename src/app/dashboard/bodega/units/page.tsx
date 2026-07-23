
"use client";

import React from "react";
import { PageHeader } from "@/components/page-header";
import { useAppState } from "@/modules/core/contexts/app-provider";
import { PanelCard } from "@/components/ui/panel-card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Trash2, PlusCircle, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Unit } from "@/modules/core/lib/data";
import { CreateUnitForm } from "@/components/admin/create-unit-form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/modules/core/hooks/use-toast";


export default function AdminUnitsPage() {
    const { units, deleteUnit, can } = useAppState();
    const { toast } = useToast();

    const handleDeleteUnit = async (unitId: string, unitName: string) => {
        try {
            await deleteUnit(unitId);
            toast({
                title: "Unidad Eliminada",
                description: `La unidad ${unitName} ha sido eliminada correctamente.`
            });
        } catch (error: any) {
             toast({
                variant: "destructive",
                title: "Error al eliminar",
                description: error?.message || "No se pudo eliminar la unidad."
            });
        }
    }
    
    const canCreate = can('units:create');
    const canDelete = can('units:delete');


    return (
        <div className="flex flex-col gap-8">
            <PageHeader
                title="Gestión de Unidades de Medida"
                description="Crea y gestiona las unidades (ej: kg, m2, unidad) que se usarán en los materiales."
            />

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                {canCreate && (
                    <div className="lg:col-span-1">
                        <PanelCard
                            title="Añadir Nueva Unidad"
                            icon={PlusCircle}
                            description="Añade nuevas unidades de medida al sistema."
                        >
                            <CreateUnitForm />
                        </PanelCard>
                    </div>
                )}
                <div className={canCreate ? "lg:col-span-2" : "lg:col-span-3"}>
                     <PanelCard
                        title="Lista de Unidades"
                        icon={Ruler}
                        description="Todas las unidades de medida registradas en el sistema."
                     >
                            <ScrollArea className="h-[calc(80vh-10rem)] rounded-xl border border-border">
                                <div className="space-y-3 p-4">
                                    {(units || []).map((unit: Unit) => (
                                        <div key={unit.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/40 p-4">
                                            <p className="font-semibold">{unit.name}</p>
                                            {canDelete && (
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10">
                                                            <Trash2 className="h-4 w-4"/>
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>¿Eliminar unidad "{unit.name}"?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                Esta acción no se puede deshacer. La acción fallará si algún material está usando esta unidad.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                            <AlertDialogAction 
                                                                className="bg-destructive hover:bg-destructive/90"
                                                                onClick={() => handleDeleteUnit(unit.id, unit.name)}>
                                                                Sí, eliminar
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <ScrollBar orientation="vertical" />
                            </ScrollArea>
                    </PanelCard>
                </div>
            </div>
        </div>
    );
}
