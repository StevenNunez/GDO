
'use client';
import React from 'react';
import { useForm, SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAppState, useAuth } from '@/modules/core/contexts/app-provider';
import { useToast } from '@/modules/core/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';
import { Tenant } from '@/modules/core/lib/data';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { PLANS } from '@/modules/core/lib/permissions';

const FormSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres.'),
  plan: z.enum(['basic', 'pro', 'enterprise']),
});

type FormData = z.infer<typeof FormSchema>;

interface EditTenantFormProps {
    tenant: Tenant;
}

export function EditTenantForm({ tenant }: EditTenantFormProps) {
  const { updateTenant } = useAppState();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: tenant.name,
      plan: tenant.plan || 'pro',
    },
  });

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    try {
      await updateTenant(tenant.id, data);
      toast({
        title: 'Suscriptor Actualizado',
        description: `Los datos de ${data.name} han sido guardados.`,
      });
    } catch (error: any) {
       toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'No se pudo actualizar el suscriptor.',
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Nombre de la Empresa</Label>
        <Input id="name" {...register('name')} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="tenantId">ID (RUT)</Label>
        <Input id="tenantId" value={tenant.tenantId} disabled />
      </div>

      <div className="space-y-2">
        <Label htmlFor="plan">Plan de Suscripción</Label>
        <Controller
            name="plan"
            control={control}
            render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger id="plan">
                        <SelectValue placeholder="Selecciona un plan" />
                    </SelectTrigger>
                    <SelectContent>
                        {Object.keys(PLANS).map((planKey) => (
                            <SelectItem key={planKey} value={planKey}>
                                {PLANS[planKey as keyof typeof PLANS].plan.charAt(0).toUpperCase() + PLANS[planKey as keyof typeof PLANS].plan.slice(1)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
        />
        {errors.plan && <p className="text-xs text-destructive">{errors.plan.message}</p>}
      </div>
      
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Save className="mr-2 h-4 w-4" />
        )}
        Guardar Cambios
      </Button>
    </form>
  );
}

