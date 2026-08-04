
'use client';

import React, { useState, useMemo } from 'react';
import { useForm, Controller, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAppState, useAuth } from '@/modules/core/contexts/app-provider';
import { useToast } from '@/modules/core/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, PlusCircle, FolderTree } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { WorkItem } from '@/modules/core/lib/data';
import { Separator } from '../ui/separator';

const FormSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres.'),
  unit: z.string().min(1, "La unidad es requerida."),
  quantity: z.coerce.number().min(0, "La cantidad no puede ser negativa."),
  unitPrice: z.coerce.number().min(0, "El precio no puede ser negativo."),
  type: z.enum(['project', 'task'], { required_error: 'Debes seleccionar un tipo.' }),
  parentId: z.string().optional().nullable(),
  // Solo aplica al crear un Contrato: define cómo se le cobra al mandante y,
  // por lo tanto, cómo se calculará su estado de pago.
  contractType: z.enum(['suma_alzada', 'precios_unitarios', 'administracion_delegada']).optional(),
});

type FormData = z.infer<typeof FormSchema>;

const UNITS = ["m", "m2", "m3", "kg", "ton", "und", "global"];

/** Cómo se le cobra al mandante en cada tipo de contrato. Determina el cálculo
 *  del estado de pago, por eso se elige al crear el presupuesto y no después. */
const CONTRACT_TYPE_HINT: Record<string, string> = {
  suma_alzada: 'Precio fijo: se cobra por % de avance de cada partida.',
  precios_unitarios: 'Se cobra la cantidad realmente ejecutada × precio unitario.',
  administracion_delegada: 'Se cobra el costo real más un honorario %.',
};

interface CreateWorkItemFormProps {
    workItems: WorkItem[]; 
}

export function CreateWorkItemForm({ workItems }: CreateWorkItemFormProps) {
  const { addWorkItem, addBudget } = useAppState();
  const { user } = useAuth();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: '',
      quantity: 0,
      unitPrice: 0,
      unit: 'und',
      type: 'task',
      parentId: null,
      contractType: 'suma_alzada',
    },
  });

  const selectedType = watch('type');
  
  const projects = useMemo(() => 
    (workItems || []).filter(item => item.type === 'project' && item.assignedTo === user?.id), 
  [workItems, user]);

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    if (!user) {
        toast({ variant: 'destructive', title: 'Error', description: 'Debes iniciar sesión.'});
        return;
    }
    if (data.type === 'task' && !data.parentId) {
        toast({ variant: 'destructive', title: 'Error', description: 'Debes seleccionar un Contrato para la partida.'});
        return;
    }

    try {
      // Un "Contrato" es la raíz de la EDT y equivale a un presupuesto: se crea
      // el budget primero y la partida raíz queda enlazada a él. Nace sin obra;
      // se asigna después desde el panel de presupuestos. Una partida hereda el
      // budgetId de su Contrato padre para que sume al presupuesto correcto.
      let budgetId: string | null = null;
      if (data.type === 'project') {
        budgetId = await addBudget({
          name: data.name,
          type: 'principal',
          status: 'approved',
          contractType: data.contractType ?? 'suma_alzada',
        });
      } else if (data.parentId) {
        budgetId = workItems.find(w => w.id === data.parentId)?.budgetId ?? null;
      }

      const fullData = {
        ...data,
        assignedTo: user.id, // Siempre se auto-asigna al contratista
        status: 'in-progress' as const,
        projectId: user.tenantId,
        budgetId,
        parentId: data.type === 'project' ? null : (data.parentId ?? null),
      };

      await addWorkItem(fullData);

      toast({
        title: `${data.type === 'project' ? 'Contrato' : 'Partida'} Creada`,
        description: data.type === 'project'
          ? `Se creó "${data.name}". Asígnale una obra en el panel de presupuestos.`
          : `Se ha añadido "${data.name}" correctamente.`,
      });
      reset();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al crear',
        description: error.message || 'No se pudo añadir el ítem.',
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
            <Label htmlFor="type" className="text-xs font-medium">Tipo de Ítem</Label>
            <Controller
                name="type"
                control={control}
                render={({ field }) => (
                     <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger id="type" className="h-9 text-sm"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="project">📁 Nuevo Contrato / Obra</SelectItem>
                            <SelectItem value="task">📌 Nueva Partida / Actividad</SelectItem>
                        </SelectContent>
                    </Select>
                )}
            />
        </div>

        {selectedType === 'project' && (
            <div className="space-y-1.5">
                <Label htmlFor="contractType" className="text-xs font-medium">Tipo de contrato</Label>
                <Controller
                    name="contractType"
                    control={control}
                    render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value || 'suma_alzada'}>
                            <SelectTrigger id="contractType" className="h-9 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="suma_alzada">Suma alzada</SelectItem>
                                <SelectItem value="precios_unitarios">Serie de precios unitarios</SelectItem>
                                <SelectItem value="administracion_delegada">Administración delegada</SelectItem>
                            </SelectContent>
                        </Select>
                    )}
                />
                <p className="text-[11px] text-muted-foreground">
                    {CONTRACT_TYPE_HINT[watch('contractType') ?? 'suma_alzada']}
                </p>
            </div>
        )}

        {selectedType === 'task' && (
            <div className="space-y-1.5">
                <Label htmlFor="parentId" className="text-xs font-medium">Asignar a Contrato</Label>
                <Controller
                    name="parentId"
                    control={control}
                    render={({ field }) => (
                         <Select onValueChange={field.onChange} value={field.value || ''}>
                            <SelectTrigger id="parentId" className="h-9 text-sm"><SelectValue placeholder="Seleccionar Contrato..." /></SelectTrigger>
                            <SelectContent>
                                {projects.length > 0 ? (
                                  projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)
                                ) : (
                                  <div className="px-3 py-4 text-center">
                                    <p className="text-xs text-muted-foreground">No hay contratos disponibles.</p>
                                    <p className="text-[11px] text-muted-foreground/60 mt-1">Crea un contrato primero.</p>
                                  </div>
                                )}
                            </SelectContent>
                        </Select>
                    )}
                />
                 {errors.parentId && <p className="text-[11px] text-destructive">{errors.parentId.message}</p>}
            </div>
        )}

        <Separator className="my-1" />

        <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs font-medium">
              Nombre del {selectedType === 'project' ? 'Contrato' : 'Partida'}
            </Label>
            <Input
              id="name"
              className="h-9 text-sm"
              placeholder={selectedType === 'project' ? 'Ej: Remodelación Oficinas Centrales' : 'Ej: Instalación de cerámicas'}
              {...register('name')}
            />
            {errors.name && <p className="text-[11px] text-destructive">{errors.name.message}</p>}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
                <Label htmlFor="quantity" className="text-xs font-medium">Cantidad</Label>
                <Input id="quantity" type="number" step="any" className="h-9 text-sm" {...register('quantity')} />
                {errors.quantity && <p className="text-[11px] text-destructive">{errors.quantity.message}</p>}
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="unit" className="text-xs font-medium">Unidad</Label>
                 <Controller
                    name="unit"
                    control={control}
                    render={({ field }) => (
                         <Select onValueChange={field.onChange} value={field.value}>
                            <SelectTrigger id="unit" className="h-9 text-sm"><SelectValue placeholder="..." /></SelectTrigger>
                            <SelectContent>
                                {UNITS.map(unit => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    )}
                />
                {errors.unit && <p className="text-[11px] text-destructive">{errors.unit.message}</p>}
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="unitPrice" className="text-xs font-medium">P. Unitario</Label>
                <Input id="unitPrice" type="number" step="any" className="h-9 text-sm" {...register('unitPrice')} />
                {errors.unitPrice && <p className="text-[11px] text-destructive">{errors.unitPrice.message}</p>}
            </div>
        </div>

        <Button type="submit" className="w-full gap-2 h-9" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
            Añadir {selectedType === 'project' ? 'Contrato' : 'Partida'}
        </Button>
    </form>
  );
}
