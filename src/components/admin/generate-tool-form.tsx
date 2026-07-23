'use client';
import React from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { useToast } from '@/modules/core/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Wrench, AlertTriangle, FolderOpen } from 'lucide-react';
import Link from 'next/link';

const FormSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres.'),
  brand: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  invoiceNumber: z.string().optional(),
  purchaseDate: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof FormSchema>;

export function GenerateToolForm() {
  const { addTool, currentProjectId, projects } = useAppState();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: { name: '', brand: '', model: '', serialNumber: '', invoiceNumber: '', purchaseDate: '', notes: '' },
  });

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    try {
      await addTool(data);
      toast({
        title: 'Herramienta añadida',
        description: `"${data.name}" ha sido agregada al inventario.`,
      });
      reset();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'No se pudo agregar la herramienta.',
      });
    }
  };

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="rounded-full bg-amber-100 dark:bg-amber-900/30 p-3">
          <FolderOpen className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <p className="font-medium text-sm">Sin obras creadas</p>
          <p className="text-xs text-muted-foreground mt-1">
            Necesitas crear una obra antes de agregar herramientas.
          </p>
        </div>
        <Button asChild size="sm" variant="outline" className="mt-1">
          <Link href="/dashboard/projects">Crear primera obra</Link>
        </Button>
      </div>
    );
  }

  if (!currentProjectId) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="rounded-full bg-amber-100 dark:bg-amber-900/30 p-3">
          <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <p className="font-medium text-sm">Selecciona una obra</p>
          <p className="text-xs text-muted-foreground mt-1">
            Usa el selector en la barra superior para elegir la obra activa.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Nombre — obligatorio */}
      <div className="space-y-1.5">
        <Label htmlFor="tool-name">Nombre <span className="text-destructive">*</span></Label>
        <Input
          id="tool-name"
          placeholder="Ej: Martillo de bola"
          {...register('name')}
          className={errors.name ? 'border-destructive' : ''}
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      {/* Marca + Modelo */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="tool-brand">Marca</Label>
          <Input id="tool-brand" placeholder="Ej: Bosch" {...register('brand')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tool-model">Modelo</Label>
          <Input id="tool-model" placeholder="Ej: GSB 18V" {...register('model')} />
        </div>
      </div>

      {/* N° Serie */}
      <div className="space-y-1.5">
        <Label htmlFor="tool-serial">N° de Serie</Label>
        <Input id="tool-serial" placeholder="Ej: SN-2024-001" {...register('serialNumber')} />
      </div>

      {/* Factura + Fecha de compra */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="tool-invoice">N° Factura</Label>
          <Input id="tool-invoice" placeholder="Ej: 00145" {...register('invoiceNumber')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tool-date">Fecha Compra</Label>
          <Input id="tool-date" type="date" {...register('purchaseDate')} />
        </div>
      </div>

      {/* Observaciones */}
      <div className="space-y-1.5">
        <Label htmlFor="tool-notes">Observaciones</Label>
        <Textarea
          id="tool-notes"
          placeholder="Estado inicial, condiciones especiales..."
          rows={2}
          {...register('notes')}
        />
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Wrench className="mr-2 h-4 w-4" />
        )}
        Añadir al Inventario
      </Button>
    </form>
  );
}
