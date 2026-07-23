
"use client";

import React, { useState, useMemo } from "react";
import dynamic from 'next/dynamic';
import { PageHeader } from "@/components/page-header";
import { useAppState, useAuth } from "@/modules/core/contexts/app-provider";
import { PanelCard } from "@/components/ui/panel-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/modules/core/hooks/use-toast";
import { Loader2, Undo2, PackageSearch, CalendarIcon, XCircle, AlertTriangle, FolderOpen } from "lucide-react";
import Link from "next/link";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Material, MaterialRequest } from "@/modules/core/lib/data";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from "@/lib/utils";
import { toDate } from "@/lib/date-utils";

const Calendar = dynamic(() => import('@/components/ui/calendar').then(mod => mod.Calendar), { ssr: false });


type CompatibleMaterialRequest = MaterialRequest & {
    materialId?: string;
    quantity?: number;
    items?: { materialId: string; quantity: number }[];
};

interface ReturnableItem {
  materialId: string;
  materialName: string;
  unit: string;
  maxQuantity: number; // The total quantity they have taken out
  returnQuantity: string;
}

export default function SupervisorReturnRequestPage() {
  const { materials, addReturnRequest, requests, currentProjectId, projects } = useAppState();
  const { user: authUser } = useAuth();
  const { toast } = useToast();
  
  const [returnableItems, setReturnableItems] = useState<ReturnableItem[]>([]);
  const [justification, setJustification] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  const materialMap = useMemo(() => new Map((materials || []).map((m: Material) => [m.id, m])), [materials]);

  const aggregatedTakenMaterials = useMemo(() => {
    if (!authUser) return [];
    
    const takenMap = new Map<string, { materialName: string; unit: string; totalQuantity: number }>();

    ((requests || []) as CompatibleMaterialRequest[])
      .filter(req => {
        if (req.supervisorId !== authUser.id || req.status !== 'approved') return false;
        if (selectedDate) {
          const approvedAt = toDate(req.createdAt) || new Date(req.createdAt as any);
          return isSameDay(approvedAt, selectedDate);
        }
        return true; // if no date is selected, show all
      })
      .forEach(req => {
        (req.items || []).forEach(item => {
          const material = materialMap.get(item.materialId) as Material | undefined;
          if (material) {
            if (takenMap.has(item.materialId)) {
              takenMap.get(item.materialId)!.totalQuantity += item.quantity;
            } else {
              takenMap.set(item.materialId, {
                materialName: material.name,
                unit: material.unit,
                totalQuantity: item.quantity,
              });
            }
          }
        });
      });

    return Array.from(takenMap.entries()).map(([materialId, data]) => ({
      materialId,
      materialName: data.materialName,
      unit: data.unit,
      maxQuantity: data.totalQuantity,
      returnQuantity: "",
    }));
  }, [requests, materialMap, authUser, selectedDate]);

  React.useEffect(() => {
    setReturnableItems(aggregatedTakenMaterials);
  }, [aggregatedTakenMaterials]);
  
  const handleQuantityChange = (materialId: string, value: string) => {
    setReturnableItems(prevItems =>
      prevItems.map(item =>
        item.materialId === materialId ? { ...item, returnQuantity: value } : item
      )
    );
  };
  
  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const itemsToReturn = returnableItems
      .map(item => ({
        materialId: item.materialId,
        quantity: Number(item.returnQuantity) || 0,
        materialName: item.materialName,
        unit: item.unit,
      }))
      .filter(item => item.quantity > 0);

    if (itemsToReturn.length === 0 || !justification || !authUser) {
        toast({ variant: 'destructive', title: 'Error', description: 'Añade la cantidad a devolver para al menos un material y una justificación.'});
        return;
    }
    
    for(const item of returnableItems) {
      const returnQty = Number(item.returnQuantity) || 0;
      if (returnQty > item.maxQuantity) {
        toast({
          variant: 'destructive',
          title: 'Cantidad Excedida',
          description: `No puedes devolver más de ${item.maxQuantity} de ${item.materialName}.`
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await addReturnRequest(itemsToReturn, justification);
      toast({ title: 'Éxito', description: 'Tu solicitud de devolución ha sido enviada para confirmación.'});
      setReturnableItems(aggregatedTakenMaterials); // Reset quantities
      setJustification('');
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error?.message || 'No se pudo enviar la solicitud de devolución.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Registrar Devolución de Materiales"
        description="Indica la cantidad sobrante de los materiales que retiraste para devolverlos a bodega."
      />

      {(projects || []).length === 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning-subtle p-4 text-warning">
          <FolderOpen className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Sin obras creadas</p>
            <p className="text-warning/80">Debes crear una obra antes de registrar devoluciones.{" "}
              <Link href="/dashboard/projects" className="font-medium underline underline-offset-2">Crear primera obra</Link>
            </p>
          </div>
        </div>
      )}
      {(projects || []).length > 0 && !currentProjectId && (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning-subtle p-4 text-warning">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">Selecciona una obra activa en el selector superior para registrar devoluciones.</p>
        </div>
      )}

      <PanelCard
        title="Lista de Devolución"
        description="Materiales que retiraste en la fecha seleccionada. Ingresa la cantidad a devolver."
        icon={Undo2}
      >
            <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                 <Popover>
                  <PopoverTrigger asChild>
                      <Button
                          variant={"outline"}
                          className={cn(
                          "w-full sm:w-[280px] justify-start text-left font-normal",
                          !selectedDate && "text-muted-foreground"
                          )}
                      >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {selectedDate ? format(selectedDate, "PPP", {locale: es}) : <span>Filtrar por fecha de retiro</span>}
                      </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                      <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={setSelectedDate}
                          initialFocus
                      />
                  </PopoverContent>
               </Popover>
               {selectedDate && (
                   <Button variant="ghost" onClick={() => setSelectedDate(undefined)}>
                       <XCircle className="mr-2 h-4 w-4"/>
                       Limpiar Filtro
                   </Button>
               )}
            </div>
            <form onSubmit={handleRequestSubmit} className="space-y-6">
              {returnableItems.length > 0 ? (
                <ScrollArea className="h-96 border rounded-md">
                   <Table>
                      <TableHeader>
                          <TableRow>
                              <TableHead>Material</TableHead>
                              <TableHead className="w-[150px] text-right">Cantidad a Devolver</TableHead>
                          </TableRow>
                      </TableHeader>
                      <TableBody>
                        {returnableItems.map(item => (
                          <TableRow key={item.materialId}>
                            <TableCell>
                              <p className="font-medium">{item.materialName}</p>
                              <p className="text-xs text-muted-foreground">Total retirado en esta fecha: {item.maxQuantity} {item.unit}</p>
                            </TableCell>
                            <TableCell className="text-right">
                               <Input
                                  type="number"
                                  placeholder="0"
                                  value={item.returnQuantity}
                                  onChange={(e) => handleQuantityChange(item.materialId, e.target.value)}
                                  max={item.maxQuantity}
                                  min="0"
                                  className="text-right"
                                  disabled={isSubmitting}
                                />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                   </Table>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center text-center text-muted-foreground p-12 border-2 border-dashed rounded-lg">
                    <PackageSearch className="h-16 w-16 mb-4"/>
                    <h3 className="text-xl font-semibold">Sin materiales para devolver</h3>
                    <p className="mt-2">No tienes solicitudes de material aprobadas para la fecha seleccionada.</p>
                </div>
              )}
                
              <div className="space-y-2">
                  <Label htmlFor="justification">Justificación General de la Devolución</Label>
                  <Input 
                    id="justification" 
                    placeholder="Ej: Material sobrante de faena en Torre Norte, Piso 5..." 
                    value={justification} 
                    onChange={e => setJustification(e.target.value)} 
                    disabled={isSubmitting}/>
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting || returnableItems.length === 0 || !currentProjectId}>
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Enviando...</> : "Enviar Solicitud de Devolución"}
              </Button>
            </form>
      </PanelCard>
    </div>
  );
}
