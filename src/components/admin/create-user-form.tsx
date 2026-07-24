

'use client';
import React from 'react';
import { useForm, SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/modules/core/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, UserPlus } from 'lucide-react';
import type { UserRole, Tenant } from '@/modules/core/lib/data';
import { useAppState, useAuth } from '@/modules/core/contexts/app-provider';
import { ROLES, PLANS } from '@/modules/core/lib/permissions';

const FormSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres.'),
  email: z.string().email('El correo electrónico no es válido.'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.'),
  role: z.enum(['admin', 'bodega-admin', 'supervisor', 'worker', 'operations', 'apr', 'guardia', 'finance', 'super-admin', 'cphs', 'jefe-terreno', 'quality', 'jefe-oficina-tecnica', 'soporte'], { required_error: 'Debes seleccionar un rol.' }),
  phone: z.string().optional(),
});

type FormData = z.infer<typeof FormSchema>;

export function CreateUserForm() {
  const { toast } = useToast();
  const { user: authUser, tenants, currentTenantId } = useAuth();
  const { currentProjectId } = useAppState();

  const currentTenant = React.useMemo(() => {
    if (!currentTenantId) return null;
    return (tenants || []).find((t: Tenant) => t.id === currentTenantId || t.tenantId === currentTenantId);
  }, [currentTenantId, tenants]);

  const plan = (currentTenant as any)?.plan || PLANS.professional;

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: 'worker',
      phone: '',
    }
  });

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    let tenantIdToAssign = currentTenantId;

    if (authUser?.role === 'super-admin' && !tenantIdToAssign) {
      toast({
        variant: 'destructive',
        title: 'Error de Suscriptor',
        description: 'Como Super-Admin, debes seleccionar un suscriptor antes de crear un usuario.',
      });
      return;
    }

    if (authUser?.role !== 'super-admin') {
      tenantIdToAssign = authUser?.tenantId || null;
    }

    if (!tenantIdToAssign) {
      toast({
        variant: 'destructive',
        title: 'Error de Suscriptor',
        description: 'No se pudo determinar el suscriptor para este usuario.',
      });
      return;
    }


    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          password: data.password,
          role: data.role,
          phone: data.phone || null,
          tenantId: tenantIdToAssign,
          assignedProjectIds: currentProjectId ? [currentProjectId] : [],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No se pudo crear el usuario.');

      toast({
        title: 'Usuario Creado Exitosamente',
        description: `${data.name} ha sido añadido. Comunícale su contraseña para que pueda ingresar.`,
      });
      reset();

    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al crear usuario',
        description: error.message || 'No se pudo crear el usuario.',
      });
    }
  };

  const allowedRoles = React.useMemo(() => {
    let roles = plan.allowedRoles;
    // `super-admin` y `soporte` (soporte de la app) solo los asigna el super-admin.
    if (authUser?.role !== 'super-admin') {
      roles = (roles || []).filter((r: UserRole) => r !== 'super-admin' && r !== 'soporte');
    }
    return roles;
  }, [plan, authUser]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nombre Completo</Label>
        <Input id="name" placeholder="Ej: Maria Rodriguez" {...register('name')} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Correo Electrónico</Label>
        <Input id="email" type="email" placeholder="ej: nombre@empresa.cl" {...register('email')} />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input id="password" type="password" placeholder="Mínimo 6 caracteres" {...register('password')} />
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Teléfono (con código de país)</Label>
        <Input id="phone" type="tel" placeholder="Ej: 56912345678" {...register('phone')} />
        {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="role">Rol del Usuario</Label>
        <Controller
          name="role"
          control={control}
          render={({ field }) => (
            <Select onValueChange={field.onChange} value={field.value}>
              <SelectTrigger id="role">
                <SelectValue placeholder="Selecciona un rol" />
              </SelectTrigger>
              <SelectContent>
                {(allowedRoles || []).map((roleKey: UserRole) => (
                  <SelectItem key={roleKey} value={roleKey}>
                    {ROLES[roleKey]?.label || roleKey}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.role && <p className="text-xs text-destructive">{errors.role.message}</p>}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <UserPlus className="mr-2 h-4 w-4" />
        )}
        Crear Usuario
      </Button>
    </form>
  );
}
