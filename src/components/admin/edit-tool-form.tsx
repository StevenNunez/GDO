'use client';

import React, { useEffect } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { useToast } from '@/modules/core/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Save, QrCode } from 'lucide-react';
import { Tool } from '@/modules/core/lib/data';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

const FormSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres.').max(100),
  brand: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  invoiceNumber: z.string().optional(),
  purchaseDate: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof FormSchema>;

interface EditToolFormProps {
  tool: Tool | null;
  isOpen: boolean;
  onClose: () => void;
}

export function EditToolForm({ tool, isOpen, onClose }: EditToolFormProps) {
  const { updateTool } = useAppState();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(FormSchema),
  });

  useEffect(() => {
    if (tool) {
      reset({
        name: tool.name,
        brand: tool.brand ?? '',
        model: tool.model ?? '',
        serialNumber: tool.serialNumber ?? '',
        invoiceNumber: tool.invoiceNumber ?? '',
        purchaseDate: tool.purchaseDate ?? '',
        notes: tool.notes ?? '',
      });
    }
  }, [tool, reset]);

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    if (!tool) return;
    const payload: Partial<Tool> = { name: data.name };
    if (data.brand !== undefined) payload.brand = data.brand || undefined;
    if (data.model !== undefined) payload.model = data.model || undefined;
    if (data.serialNumber !== undefined) payload.serialNumber = data.serialNumber || undefined;
    if (data.invoiceNumber !== undefined) payload.invoiceNumber = data.invoiceNumber || undefined;
    if (data.purchaseDate !== undefined) payload.purchaseDate = data.purchaseDate || undefined;
    if (data.notes !== undefined) payload.notes = data.notes || undefined;

    try {
      await updateTool(tool.id, payload);
      toast({
        title: 'Herramienta actualizada',
        description: `"${data.name}" ha sido actualizada correctamente.`,
      });
      onClose();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'No se pudo actualizar la herramienta.',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar Herramienta</DialogTitle>
          <DialogDescription>
            Actualiza los datos de la herramienta. El código QR no se modifica.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <form id="edit-tool-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-1">
            {/* Nombre */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Nombre <span className="text-destructive">*</span></Label>
              <Input
                id="edit-name"
                placeholder="Ej: Taladro percutor 18V"
                {...register('name')}
                autoFocus
                className={errors.name ? 'border-destructive' : ''}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            {/* Marca + Modelo */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-brand">Marca</Label>
                <Input id="edit-brand" placeholder="Ej: Bosch" {...register('brand')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-model">Modelo</Label>
                <Input id="edit-model" placeholder="Ej: GSB 18V" {...register('model')} />
              </div>
            </div>

            {/* N° Serie */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-serial">N° de Serie</Label>
              <Input id="edit-serial" placeholder="Ej: SN-2024-001" {...register('serialNumber')} />
            </div>

            {/* Factura + Fecha */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-invoice">N° Factura</Label>
                <Input id="edit-invoice" placeholder="Ej: 00145" {...register('invoiceNumber')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-date">Fecha Compra</Label>
                <Input id="edit-date" type="date" {...register('purchaseDate')} />
              </div>
            </div>

            {/* Observaciones */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-notes">Observaciones</Label>
              <Textarea
                id="edit-notes"
                placeholder="Estado, condiciones especiales..."
                rows={2}
                {...register('notes')}
              />
            </div>

            {/* QR (solo lectura) */}
            <div className="space-y-1.5">
              <Label>Código QR (no editable)</Label>
              <div className="flex items-center gap-3 p-3 bg-muted rounded-md">
                <QrCode className="h-5 w-5 text-muted-foreground shrink-0" />
                <code className="text-sm font-mono break-all">{tool?.qrCode}</code>
              </div>
            </div>
          </form>
        </ScrollArea>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="edit-tool-form" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Guardar cambios
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
