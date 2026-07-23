'use client';
import React, { useState } from 'react';
import { useForm, SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { useToast } from '@/modules/core/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, PackagePlus, ChevronsUpDown, Check, AlertTriangle, FolderOpen } from 'lucide-react';
import { Supplier, MaterialCategory, Unit } from '@/modules/core/lib/data';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const FormSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres.'),
  stock: z.coerce.number().min(0, 'El stock no puede ser negativo.'),
  unit: z.string({ required_error: 'La unidad no puede estar vacía.' }).min(1, 'La unidad no puede estar vacía.'),
  category: z.string().min(1, 'Debes escribir o seleccionar una categoría.'),
  supplierId: z.string().nullable(),
  justification: z.string().optional(),
});

type FormData = z.infer<typeof FormSchema>;

export function CreateMaterialForm() {
  const { addMaterial, suppliers, materialCategories, units, can, currentProjectId, projects } = useAppState();
  const { toast } = useToast();
  const [unitPopoverOpen, setUnitPopoverOpen] = useState(false);
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);

  const canSetInitialStock = can('stock:add_manual');

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: '',
      stock: 0,
      supplierId: null,
      justification: '',
    },
  });

  const stockWatcher = watch('stock');

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    if (data.stock > 0 && !data.justification && canSetInitialStock) {
      toast({
        variant: 'destructive',
        title: 'Justificación Requerida',
        description: 'Debes añadir una justificación si el stock inicial es mayor a 0.',
      });
      return;
    }
    try {
      const matchedCategory = (materialCategories || []).find(c => c.name === data.category);
      await addMaterial({
        ...data,
        categoryId: matchedCategory?.id ?? null,
        category: data.category,
        stock: canSetInitialStock ? data.stock : 0,
        supplierId: data.supplierId === 'ninguno' ? null : data.supplierId,
      });
      toast({
        title: 'Material Creado',
        description: `${data.name} ha sido añadido y su ingreso ha sido registrado.`,
      });
      reset();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'No se pudo crear el material.',
      });
    }
  };

  const sortedCategories = React.useMemo(
    () => [...(materialCategories || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [materialCategories]
  );

  const sortedSuppliers = React.useMemo(
    () => [...(suppliers || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [suppliers]
  );

  const noProjects = projects.length === 0;
  const noProjectSelected = !currentProjectId;

  if (noProjects) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="rounded-full bg-amber-100 dark:bg-amber-900/30 p-3">
          <FolderOpen className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <p className="font-medium text-sm">Sin obras creadas</p>
          <p className="text-xs text-muted-foreground mt-1">
            Necesitas crear una obra antes de agregar materiales.
          </p>
        </div>
        <Button asChild size="sm" variant="outline" className="mt-1">
          <Link href="/dashboard/projects">Crear primera obra</Link>
        </Button>
      </div>
    );
  }

  if (noProjectSelected) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="rounded-full bg-amber-100 dark:bg-amber-900/30 p-3">
          <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <p className="font-medium text-sm">Selecciona una obra</p>
          <p className="text-xs text-muted-foreground mt-1">
            Usa el selector de obra en la barra superior para elegir en cuál obra trabajar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Nombre */}
      <div className="space-y-1.5">
        <Label htmlFor="material-name">Nombre del Material</Label>
        <Input
          id="material-name"
          placeholder="Ej: Tornillos de 1 pulgada"
          {...register('name')}
          className={errors.name ? 'border-destructive' : ''}
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      {/* Categoría */}
      <div className="space-y-1.5">
        <Label>Categoría</Label>
        <Controller
          name="category"
          control={control}
          render={({ field }) => (
            <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className={cn(
                    'w-full justify-between font-normal',
                    !field.value && 'text-muted-foreground',
                    errors.category && 'border-destructive'
                  )}
                >
                  <span className="truncate">{field.value || 'Buscar o escribir categoría...'}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Buscar o escribir..."
                    onValueChange={(val) => field.onChange(val)}
                    value={field.value || ''}
                  />
                  <CommandList>
                    <CommandEmpty>
                      <div className="p-1">
                        <Button
                          type="button"
                          variant="ghost"
                          className="w-full text-sm text-left justify-start"
                          onClick={() => setCategoryPopoverOpen(false)}
                        >
                          Usar &quot;{field.value}&quot; como categoría nueva
                        </Button>
                      </div>
                    </CommandEmpty>
                    <CommandGroup>
                      {sortedCategories.map((cat: MaterialCategory) => (
                        <CommandItem
                          key={cat.id}
                          value={cat.name}
                          onSelect={() => {
                            field.onChange(cat.name);
                            setCategoryPopoverOpen(false);
                          }}
                        >
                          <Check
                            className={cn('mr-2 h-4 w-4', field.value === cat.name ? 'opacity-100' : 'opacity-0')}
                          />
                          {cat.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
        />
        {errors.category && <p className="text-xs text-destructive">{errors.category.message}</p>}
      </div>

      {/* Stock + Unidad */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="stock">Stock Inicial</Label>
          <Input
            id="stock"
            type="number"
            placeholder="0"
            {...register('stock')}
            disabled={!canSetInitialStock}
            className={errors.stock ? 'border-destructive' : ''}
          />
          {!canSetInitialStock && (
            <p className="text-xs text-muted-foreground">Use &quot;Ingreso Manual&quot; para añadir stock.</p>
          )}
          {errors.stock && <p className="text-xs text-destructive">{errors.stock.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Unidad</Label>
          <Controller
            name="unit"
            control={control}
            render={({ field }) => (
              <Popover open={unitPopoverOpen} onOpenChange={setUnitPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn(
                      'w-full justify-between font-normal',
                      !field.value && 'text-muted-foreground',
                      errors.unit && 'border-destructive'
                    )}
                  >
                    <span className="truncate">{field.value || 'Unidad...'}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder="Buscar o escribir..."
                      onValueChange={(val) => setValue('unit', val, { shouldValidate: true })}
                      value={field.value || ''}
                    />
                    <CommandList>
                      <CommandEmpty>
                        <div className="p-1">
                          <Button
                            type="button"
                            variant="ghost"
                            className="w-full text-sm text-left justify-start"
                            onClick={() => setUnitPopoverOpen(false)}
                          >
                            Usar &quot;{field.value}&quot; como unidad nueva
                          </Button>
                        </div>
                      </CommandEmpty>
                      <CommandGroup>
                        {(units || []).map((unit: Unit) => (
                          <CommandItem
                            key={unit.id}
                            value={unit.name}
                            onSelect={() => {
                              setValue('unit', unit.name, { shouldValidate: true });
                              setUnitPopoverOpen(false);
                            }}
                          >
                            <Check
                              className={cn('mr-2 h-4 w-4', field.value === unit.name ? 'opacity-100' : 'opacity-0')}
                            />
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
          {errors.unit && <p className="text-xs text-destructive">{errors.unit.message}</p>}
        </div>
      </div>

      {/* Justificación de stock */}
      {stockWatcher > 0 && canSetInitialStock && (
        <div className="space-y-1.5">
          <Label htmlFor="justification">Justificación del Ingreso Inicial</Label>
          <Textarea
            id="justification"
            placeholder="Ej: Inventario inicial, sobrante de obra X..."
            rows={2}
            {...register('justification')}
          />
          {errors.justification && <p className="text-xs text-destructive">{errors.justification.message}</p>}
        </div>
      )}

      {/* Proveedor */}
      <div className="space-y-1.5">
        <Label htmlFor="supplierId">Proveedor Preferido <span className="text-muted-foreground font-normal">(Opcional)</span></Label>
        <Controller
          name="supplierId"
          control={control}
          render={({ field }) => (
            <Select onValueChange={field.onChange} value={field.value || ''}>
              <SelectTrigger id="supplierId" className={!field.value ? 'text-muted-foreground' : ''}>
                <SelectValue placeholder="Sin proveedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ninguno">Sin proveedor</SelectItem>
                {sortedSuppliers.map((s: Supplier) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.supplierId && <p className="text-xs text-destructive">{errors.supplierId.message}</p>}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackagePlus className="mr-2 h-4 w-4" />}
        Crear Material
      </Button>
    </form>
  );
}
