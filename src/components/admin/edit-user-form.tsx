

'use client';
import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useForm, SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAppState, useAuth } from '@/modules/core/contexts/app-provider';
import { useToast } from '@/modules/core/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Save, KeyRound, Phone, CalendarIcon } from 'lucide-react';
import { User, UserRole } from '@/modules/core/lib/data';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toDate } from '@/lib/date-utils';
import { AdminChangePasswordDialog } from './admin-change-password-dialog';
import { ROLES } from '@/modules/core/lib/permissions';

const Calendar = dynamic(() => import('@/components/ui/calendar').then(mod => mod.Calendar), { ssr: false });


const FormSchema = z.object({
    name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres.'),
    role: z.enum(['admin', 'bodega-admin', 'supervisor', 'worker', 'operations', 'apr', 'guardia', 'finance', 'super-admin', 'cphs', 'jefe-terreno', 'quality', 'jefe-oficina-tecnica', 'soporte', 'subcontratista'], { required_error: 'Debes seleccionar un rol.' }),
    rut: z.string().optional(),
    phone: z.string().optional(),
    cargo: z.string().optional(),
    fechaIngreso: z.date().optional().nullable(),
    baseSalary: z.coerce.number().optional(),
    afp: z.string().optional(),
    tipoSalud: z.enum(['Fonasa', 'Isapre']).optional(),
    cargasFamiliares: z.coerce.number().optional(),
    assignedProjectIds: z.array(z.string()).optional(),
});

type FormData = z.infer<typeof FormSchema>;

interface EditUserFormProps {
    user: User;
    isOpen: boolean;
    onClose: () => void;
}

export function EditUserForm({ user, isOpen, onClose }: EditUserFormProps) {
    const { updateUser, projects, can } = useAppState();
    const { user: authUser } = useAuth();
    const { toast } = useToast();
    const [isPasswordDialogOpen, setPasswordDialogOpen] = useState(false);

    const canEditRole = React.useMemo(() => {
        if (!authUser) return false;
        if (authUser.role === 'super-admin') return true;
        // Solo el super-admin puede tocar el rol de un super-admin o de un soporte.
        return can('users:edit') && user.role !== 'super-admin' && user.role !== 'soporte';
    }, [authUser, user, can]);

    const canChangePassword = React.useMemo(() => {
        if (!authUser) return false;
        if (authUser.role === 'super-admin') return true;
        return can('users:change_password') && user.role !== 'super-admin' && user.role !== 'soporte';
    }, [authUser, user, can]);

    const canAssignProjects = React.useMemo(() => {
        if (!authUser) return false;
        // Roles allowed according to user request: 
        // Super Admin, Admin (Aplicación), Operations (Administrador de Obra)
        return ['super-admin', 'admin', 'operations'].includes(authUser.role);
    }, [authUser]);


    const {
        register,
        handleSubmit,
        control,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<FormData>({
        resolver: zodResolver(FormSchema),
    });

    useEffect(() => {
        if (user) {
            reset({
                name: user.name,
                role: user.role,
                rut: user.rut || '',
                phone: user.phone || '',
                cargo: user.cargo || '',
                fechaIngreso: toDate(user.fechaIngreso),
                baseSalary: user.baseSalary || 0,
                afp: user.afp || '',
                tipoSalud: user.tipoSalud,
                cargasFamiliares: user.cargasFamiliares || 0,
                assignedProjectIds: user.assignedProjectIds || [],
            });
        }
    }, [user, reset]);

    const onSubmit: SubmitHandler<FormData> = async (data) => {
        try {
            const { fechaIngreso, ...restOfData } = data;

            // Filter out undefined values — Supabase rejects them
            const updatePayload: { [key: string]: any } = {};

            Object.entries(restOfData).forEach(([key, value]) => {
                if (value !== undefined) {
                    updatePayload[key] = value;
                }
            });

            if (!canEditRole) {
                delete updatePayload.role;
            }

            // Only explicitly keep assignedProjectIds if user has permission
            if (!canAssignProjects) {
                delete updatePayload.assignedProjectIds;
            }

            if (fechaIngreso) {
                updatePayload.fechaIngreso = fechaIngreso.toISOString();
            } else {
                updatePayload.fechaIngreso = null;
            }

            await updateUser(user.id, updatePayload);
            toast({
                title: 'Usuario Actualizado',
                description: `Los datos de ${data.name} han sido guardados.`,
            });
            onClose();
        } catch (error: any) {
            console.error("Error updating user:", error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error?.message || 'No se pudo actualizar el usuario.',
            });
        }
    };

    return (
        <>
            {canChangePassword && <AdminChangePasswordDialog isOpen={isPasswordDialogOpen} onClose={() => setPasswordDialogOpen(false)} userToEdit={user} />}
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Editar Perfil de Usuario</DialogTitle>
                        <DialogDescription>
                            Modifica los datos personales y previsionales del usuario.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto px-6">
                        <h4 className="font-semibold text-lg border-b pb-2">Información General</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="user-name">Nombre Completo</Label>
                                <Input id="user-name" placeholder="Ej: Juan Pérez" {...register('name')} />
                                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="role">Rol del Usuario</Label>
                                <Controller
                                    name="role"
                                    control={control}
                                    render={({ field }) => (
                                        <Select onValueChange={field.onChange} value={field.value} disabled={!canEditRole}>
                                            <SelectTrigger id="role">
                                                <SelectValue placeholder="Selecciona un rol" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Object.entries(ROLES).map(([key, value]) => (
                                                    (authUser?.role === 'super-admin' || (key !== 'super-admin' && key !== 'soporte')) && (
                                                        <SelectItem key={key} value={key}>
                                                            {value.label}
                                                        </SelectItem>
                                                    )
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                />
                                {!canEditRole && <p className="text-xs text-muted-foreground">No tienes permiso para cambiar el rol.</p>}
                                {errors.role && <p className="text-xs text-destructive">{errors.role.message}</p>}
                            </div>
                        </div>

                        {canAssignProjects && (
                            <div className="space-y-2 border-t pt-4">
                                <Label className="text-primary font-semibold">Obras Asignadas (Permisos de Acceso)</Label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border rounded-md p-3 bg-muted/30">
                                    {projects.map((project) => (
                                        <Controller
                                            key={project.id}
                                            name="assignedProjectIds"
                                            control={control}
                                            render={({ field }) => {
                                                const isChecked = field.value?.includes(project.id);
                                                return (
                                                    <div className="flex items-center space-x-2">
                                                        <input
                                                            type="checkbox"
                                                            id={`project-${project.id}`}
                                                            checked={isChecked}
                                                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                            onChange={(e) => {
                                                                const newValue = e.target.checked
                                                                    ? [...(field.value || []), project.id]
                                                                    : (field.value || []).filter((id: string) => id !== project.id);
                                                                field.onChange(newValue);
                                                            }}
                                                        />
                                                        <label htmlFor={`project-${project.id}`} className="text-sm font-medium leading-none cursor-pointer">
                                                            {project.name}
                                                        </label>
                                                    </div>
                                                );
                                            }}
                                        />
                                    ))}
                                </div>
                                <p className="text-[10px] text-muted-foreground">
                                    El usuario solo podrá visualizar datos (materiales, herramientas, etc.) de las obras seleccionadas.
                                </p>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="user-email">Correo Electrónico</Label>
                                <Input id="user-email" type="email" value={user.email} disabled />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="phone">Teléfono (con código de país)</Label>
                                <Input id="phone" placeholder="Ej: 56912345678" {...register('phone')} />
                                {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
                            </div>
                        </div>

                        <h4 className="font-semibold text-lg border-b pb-2 pt-6">Información para Planilla</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="rut">RUT</Label>
                                <Input id="rut" placeholder="12.345.678-9" {...register('rut')} />
                                {errors.rut && <p className="text-xs text-destructive">{errors.rut.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="cargo">Cargo</Label>
                                <Input id="cargo" placeholder="Ej: Maestro Carpintero" {...register('cargo')} />
                                {errors.cargo && <p className="text-xs text-destructive">{errors.cargo.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="fechaIngreso">Fecha de Ingreso</Label>
                                <Controller
                                    name="fechaIngreso"
                                    control={control}
                                    render={({ field }) => (
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant={"outline"}
                                                    className={cn(
                                                        "w-full justify-start text-left font-normal",
                                                        !field.value && "text-muted-foreground"
                                                    )}
                                                >
                                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                                    {field.value ? format(field.value, "PPP", { locale: es }) : <span>Selecciona una fecha</span>}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0">
                                                <Calendar
                                                    mode="single"
                                                    selected={field.value || undefined}
                                                    onSelect={field.onChange}
                                                    initialFocus
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    )}
                                />
                                {errors.fechaIngreso && <p className="text-xs text-destructive">{errors.fechaIngreso.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="baseSalary">Sueldo Base</Label>
                                <Input id="baseSalary" type="number" {...register('baseSalary')} />
                                {errors.baseSalary && <p className="text-xs text-destructive">{errors.baseSalary.message}</p>}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="afp">AFP</Label>
                                <Input id="afp" placeholder="Ej: Modelo" {...register('afp')} />
                                {errors.afp && <p className="text-xs text-destructive">{errors.afp.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="tipoSalud">Sistema de Salud</Label>
                                <Controller
                                    name="tipoSalud"
                                    control={control}
                                    render={({ field }) => (
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <SelectTrigger id="tipoSalud">
                                                <SelectValue placeholder="Selecciona..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Fonasa">Fonasa</SelectItem>
                                                <SelectItem value="Isapre">Isapre</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    )}
                                />
                                {errors.tipoSalud && <p className="text-xs text-destructive">{errors.tipoSalud.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="cargasFamiliares">Cargas Familiares</Label>
                                <Input id="cargasFamiliares" type="number" {...register('cargasFamiliares')} />
                                {errors.cargasFamiliares && <p className="text-xs text-destructive">{errors.cargasFamiliares.message}</p>}
                            </div>
                        </div>

                        <DialogFooter className="pt-6 justify-between">
                            {canChangePassword && (
                                <Button type="button" variant="secondary" onClick={() => setPasswordDialogOpen(true)}>
                                    <KeyRound className="mr-2 h-4 w-4" />
                                    Restablecer Contraseña
                                </Button>
                            )}
                            <div className="flex gap-2 mt-4 sm:mt-0">
                                <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Save className="mr-2 h-4 w-4" />
                                    )}
                                    Guardar Cambios
                                </Button>
                            </div>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
