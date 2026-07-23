"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useForm, SubmitHandler, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty, CommandGroup } from "@/components/ui/command";
import { ChevronsUpDown, Check, Loader2, Save } from "lucide-react";
import { useToast } from "@/modules/core/hooks/use-toast";
import { useAppState, useAuth } from "@/modules/core/contexts/app-provider";
import { cn } from "@/lib/utils";
import { Material, Unit, MaterialCategory, Supplier } from "@/modules/core/lib/data";

const formSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  stock: z.coerce.number().min(0, "El stock no puede ser negativo"),
  unit: z.string().min(1, "Selecciona una unidad"),
  categoryId: z.string().optional(),
  supplierId: z.string().nullable(),
});

type FormData = z.infer<typeof formSchema>;

interface EditMaterialFormProps {
  isOpen: boolean;
  onClose: () => void;
  material: Material;
}

export function EditMaterialForm({
  isOpen,
  onClose,
  material,
}: EditMaterialFormProps) {
  const { toast } = useToast();
  const { updateMaterial, units, materialCategories, suppliers } = useAppState();
  const { user } = useAuth();
  const [unitPopoverOpen, setUnitPopoverOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canEditStock = user?.role === 'super-admin' || user?.role === 'admin' || user?.role === 'soporte';

  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  });

  useEffect(() => {
    if (material) {
        const category = (materialCategories || []).find((c: MaterialCategory) => c.name === material.category);
        reset({
            name: material.name || "",
            stock: material.stock || 0,
            unit: material.unit || "",
            categoryId: category?.id,
            supplierId: material.supplierId || null,
        });
    }
  }, [material, materialCategories, reset]);

  const onSubmit: SubmitHandler<FormData> = useCallback(
    async (data) => {
      setIsSubmitting(true);
      try {
        const updateData: Partial<Omit<Material, "id" | 'category'> & { categoryId?: string }> = {
          name: data.name,
          unit: data.unit,
          categoryId: data.categoryId,
          supplierId: data.supplierId === 'ninguno' ? null : data.supplierId,
        };
        
        if (canEditStock) {
          updateData.stock = data.stock;
        }

        // Firestore does not accept `undefined` values.
        if (updateData.categoryId === undefined) {
          delete updateData.categoryId;
        }

        await updateMaterial(material.id, updateData);
        toast({
          title: "Material actualizado",
          description: "Los cambios fueron guardados correctamente.",
        });
        onClose();
      } catch (error) {
        console.error(error);
        toast({
          title: "Error",
          description: "No se pudo actualizar el material.",
          variant: "destructive",
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [material.id, toast, onClose, updateMaterial, canEditStock]
  );
  
  const handleClose = () => {
      reset();
      onClose();
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => {
          if (isSubmitting) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Editar Material</DialogTitle>
          <DialogDescription>
            Modifica los detalles del material. Solo los roles autorizados pueden cambiar el stock aquí.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2 max-h-[70vh] overflow-y-auto px-6">
            <div className="space-y-2">
                <Label htmlFor="name">Nombre</Label>
                <Input id="name" {...register("name")} />
                {errors.name && (
                <p className="text-destructive text-sm mt-1">{errors.name.message}</p>
                )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="stock">Stock Actual</Label>
                    <Input id="stock" type="number" {...register('stock')} disabled={!canEditStock} />
                    {!canEditStock && <p className="text-xs text-muted-foreground">No tienes permiso para editar el stock.</p>}
                    {errors.stock && <p className="text-xs text-destructive">{errors.stock.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label>Unidad</Label>
                    <Controller
                        name="unit"
                        control={control}
                        render={({ field }) => (
                        <Popover open={unitPopoverOpen} onOpenChange={setUnitPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                type="button"
                                variant="outline"
                                className="w-full justify-between"
                                >
                                {field.value || "Seleccionar..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                <Command>
                                <CommandInput 
                                    placeholder="Buscar o crear unidad..."
                                    value={field.value || ''}
                                    onValueChange={(currentValue) => {
                                        setValue('unit', currentValue, { shouldValidate: true });
                                    }}
                                />
                                <CommandList>
                                    <CommandEmpty>
                                    <Button className="w-full" variant="outline"
                                        onClick={() => {
                                        setUnitPopoverOpen(false);
                                        }}>
                                        Usar "{field.value}" como nueva unidad
                                    </Button>
                                    </CommandEmpty>
                                    <CommandGroup>
                                        {(units || []).map((unit: Unit) => (
                                        <CommandItem
                                            key={unit.id}
                                            value={unit.name}
                                            onSelect={() => {
                                                setValue("unit", unit.name);
                                                setUnitPopoverOpen(false);
                                            }}
                                        >
                                            <Check className={cn("mr-2 h-4 w-4", field.value === unit.name ? "opacity-100" : "opacity-0")} />
                                            {unit.name}
                                        </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                        )}
                    />
                    {errors.unit && (
                        <p className="text-destructive text-sm mt-1">{errors.unit.message}</p>
                    )}
                </div>
            </div>
            
             <div className="space-y-2">
                <Label htmlFor="categoryId">Categoría</Label>
                 <Controller
                    name="categoryId"
                    control={control}
                    render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value || ''}>
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccionar..." />
                            </SelectTrigger>
                            <SelectContent>
                                {(materialCategories || []).map((cat: MaterialCategory) => (
                                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="supplierId">Proveedor Preferido</Label>
                <Controller
                    name="supplierId"
                    control={control}
                    render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value || 'ninguno'}>
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccionar..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ninguno">Ninguno</SelectItem>
                                {(suppliers || []).map((sup: Supplier) => (
                                    <SelectItem key={sup.id} value={sup.id}>{sup.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                />
            </div>
            
            <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={handleClose}>
                    Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4" />}
                    Guardar Cambios
                </Button>
            </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
