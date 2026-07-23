'use client';
import React from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/modules/core/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { User } from '@/modules/core/lib/data';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';

const FormSchema = z.object({
  newPassword: z.string().min(6, 'La nueva contraseña debe tener al menos 6 caracteres.'),
  confirmPassword: z.string()
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Las contraseñas no coinciden.",
  path: ["confirmPassword"],
});

type FormData = z.infer<typeof FormSchema>;

interface AdminChangePasswordDialogProps {
    isOpen: boolean;
    onClose: () => void;
    userToEdit: User;
}

export function AdminChangePasswordDialog({ isOpen, onClose, userToEdit }: AdminChangePasswordDialogProps) {
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(FormSchema),
  });

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    try {
      const sb = getSupabaseBrowserClient();
      const { data: { session } } = await sb.auth.getSession();

      const res = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ targetUserId: userToEdit.id, newPassword: data.newPassword }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No se pudo cambiar la contraseña.');

      toast({
        title: 'Contraseña actualizada',
        description: `La contraseña de ${userToEdit.name} ha sido cambiada exitosamente.`,
      });
      handleClose();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al cambiar contraseña',
        description: error.message || 'No se pudo completar la operación.',
      });
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Restablecer Contraseña — {userToEdit.name}</DialogTitle>
          <DialogDescription>
            Establece una nueva contraseña para este usuario. Deberás comunicársela manualmente.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="newPassword">Nueva Contraseña</Label>
            <Input id="newPassword" type="password" placeholder="Mínimo 6 caracteres" {...register('newPassword')} />
            {errors.newPassword && <p className="text-xs text-destructive">{errors.newPassword.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar Nueva Contraseña</Label>
            <Input id="confirmPassword" type="password" placeholder="Repite la contraseña" {...register('confirmPassword')} />
            {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={handleClose}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Guardar Contraseña
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
