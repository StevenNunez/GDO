'use client';
import React from 'react';
import { useForm, SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { useToast } from '@/modules/core/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, UserPlus } from 'lucide-react';
import { Separator } from '../ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

const FormSchema = z.object({
  tenantName: z.string().min(3, 'El nombre de la empresa es requerido.'),
  tenantRut: z.string().min(5, 'El RUT es requerido y debe ser único.'),
  adminName: z.string().min(3, 'El nombre del administrador es requerido.'),
  adminEmail: z.string().email('El correo del administrador no es válido.'),
  adminPassword: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
  plan: z.enum(['basic', 'professional', 'enterprise']),
});

type FormData = z.infer<typeof FormSchema>;

export function CreateTenantForm() {
  const { addTenant } = useAppState();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: { plan: 'basic' },
  });

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    try {
      await addTenant(data);
      toast({
        title: 'Suscriptor Creado',
        description: `La empresa "${data.tenantName}" y su administrador han sido creados. El admin puede iniciar sesión de inmediato.`,
      });
      reset();
    } catch (error: any) {
       toast({
        variant: 'destructive',
        title: 'Error al crear suscriptor',
        description: error.message || 'No se pudo completar la operación.',
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <h4 className="text-sm font-medium text-muted-foreground">Datos de la Empresa</h4>
      <div className="space-y-2">
        <Label htmlFor="tenant-name">Nombre del Cliente / Empresa</Label>
        <Input id="tenant-name" placeholder="Ej: Constructora ACME" {...register('tenantName')} />
        {errors.tenantName && <p className="text-xs text-destructive">{errors.tenantName.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="tenant-rut">RUT de la Empresa</Label>
        <Input id="tenant-rut" placeholder="Ej: 77.777.777-7" {...register('tenantRut')} />
        {errors.tenantRut && <p className="text-xs text-destructive">{errors.tenantRut.message}</p>}
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
                <SelectItem value="basic">Básico — 4 roles</SelectItem>
                <SelectItem value="professional">Profesional — 12 roles</SelectItem>
                <SelectItem value="enterprise">Empresarial — 13 roles</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        {errors.plan && <p className="text-xs text-destructive">{errors.plan.message}</p>}
      </div>

      <Separator className="my-6" />

      <h4 className="text-sm font-medium text-muted-foreground">Primer Administrador de la Empresa</h4>
      <p className="text-xs text-muted-foreground -mt-2">Este usuario tendrá acceso total y podrá crear otros usuarios.</p>

      <div className="space-y-2">
        <Label htmlFor="adminName">Nombre Completo</Label>
        <Input id="adminName" placeholder="Ej: Juan Pérez" {...register('adminName')} />
        {errors.adminName && <p className="text-xs text-destructive">{errors.adminName.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="adminEmail">Correo Electrónico</Label>
        <Input id="adminEmail" type="email" placeholder="juan.perez@acme.cl" {...register('adminEmail')} />
        {errors.adminEmail && <p className="text-xs text-destructive">{errors.adminEmail.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="adminPassword">Contraseña Inicial</Label>
        <Input id="adminPassword" type="password" placeholder="Mínimo 8 caracteres" {...register('adminPassword')} />
        {errors.adminPassword && <p className="text-xs text-destructive">{errors.adminPassword.message}</p>}
      </div>

      <Button type="submit" className="w-full mt-2" disabled={isSubmitting}>
        {isSubmitting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <UserPlus className="mr-2 h-4 w-4" />
        )}
        Crear Empresa y Administrador
      </Button>
    </form>
  );
}
