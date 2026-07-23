
'use client';

import React from 'react';
import { useForm, Controller, SubmitHandler } from 'react-hook-form';
import dynamic from 'next/dynamic';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/modules/core/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Calendar as CalendarIcon, Send, CheckCircle2, Clock, AlertCircle, TrendingUp } from 'lucide-react';
import { WorkItem } from '@/modules/core/lib/data';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Textarea } from '../ui/textarea';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Progress } from '../ui/progress';

const Calendar = dynamic(() => import('@/components/ui/calendar').then(mod => mod.Calendar), { ssr: false });

const FormSchema = z.object({
  date: z.date({ required_error: 'La fecha es requerida.' }),
  quantity: z.coerce.number().min(0.01, 'La cantidad debe ser mayor a cero.'),
  observations: z.string().optional(),
});

type FormData = z.infer<typeof FormSchema>;

interface RegisterProgressFormProps {
  workItem: WorkItem;
  onSuccess?: () => void;
}

export function RegisterProgressForm({ workItem, onSuccess }: RegisterProgressFormProps) {
  const { toast } = useToast();
  const { addWorkItemProgress, can, submitForQualityReview } = useAppState();
  const [isSubmittingProtocol, setIsSubmittingProtocol] = React.useState(false);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      date: new Date(),
      quantity: 0,
      observations: '',
    },
  });

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    try {
      await addWorkItemProgress(workItem.id, data.quantity, data.date, data.observations);
      toast({
        title: 'Avance Registrado',
        description: `Se guardó el avance para "${workItem.name}".`,
      });
      reset({ date: new Date(), quantity: 0, observations: '' });
      if (onSuccess) onSuccess();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al Registrar',
        description: error.message || 'No se pudo guardar el avance.'
      });
    }
  };

  const canRegister = can('construction_control:register_progress');
  const isCompleted = workItem.progress >= 100;
  const isInReview = workItem.status === 'pending-quality-review';
  const isRejected = workItem.status === 'rejected';

  const handleSendToProtocol = async () => {
    setIsSubmittingProtocol(true);
    try {
      await submitForQualityReview(workItem.id);
      toast({
        title: 'Enviado a Protocolo',
        description: `La partida "${workItem.name}" ha sido enviada para revisión de calidad.`
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al Enviar',
        description: error.message || 'No se pudo enviar la partida a revisión.'
      });
    } finally {
      setIsSubmittingProtocol(false);
    }
  };

  // --- Status: In Review ---
  if (isInReview) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-sky-500/15 p-2 shrink-0">
              <Clock className="h-5 w-5 text-sky-400" />
            </div>
            <div>
              <h4 className="font-semibold text-sky-300 mb-1">Pendiente de Revisión</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Esta partida fue enviada a control de calidad y está esperando aprobación del equipo ITO.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Status: Completed (can send to protocol) ---
  if (isCompleted) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-emerald-500/15 p-2 shrink-0">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h4 className="font-semibold text-emerald-300 mb-1">Partida Completada al 100%</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Esta partida ha alcanzado su meta de avance físico.
              </p>
            </div>
          </div>
        </div>
        {can('construction_control:register_progress') && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 text-center">
            <Send className="h-6 w-6 text-primary/60 mx-auto mb-2" />
            <h4 className="text-sm font-semibold mb-1">¿Enviar a Protocolo de Calidad?</h4>
            <p className="text-xs text-muted-foreground mb-4 max-w-sm mx-auto">
              Al enviar, el equipo de calidad revisará la partida para su aprobación final.
            </p>
            <Button
              onClick={handleSendToProtocol}
              disabled={isSubmittingProtocol}
              className="gap-2"
            >
              {isSubmittingProtocol ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Enviar a Revisión de Calidad
            </Button>
          </div>
        )}
      </div>
    );
  }

  // --- Status: Rejected ---
  if (isRejected) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-red-500/15 p-2 shrink-0">
              <AlertCircle className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <h4 className="font-semibold text-red-300 mb-1">Partida Rechazada</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {workItem.rejectionReason || 'Esta partida fue rechazada en la revisión de calidad. Corrige las observaciones y vuelve a enviar.'}
              </p>
            </div>
          </div>
        </div>

        {/* Still allow progress registration if rejected */}
        {canRegister && (
          <RegisterProgressFormInner
            control={control}
            register={register}
            errors={errors}
            isSubmitting={isSubmitting}
            handleSubmit={handleSubmit}
            onSubmit={onSubmit}
            canRegister={canRegister}
            workItem={workItem}
          />
        )}
      </div>
    );
  }

  // --- Default: Register Progress Form ---
  return (
    <div className="space-y-4">
      {/* Remaining quantity hint */}
      <div className="flex items-center gap-2 rounded-lg bg-muted/30 border px-3 py-2">
        <TrendingUp className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-grow min-w-0">
          <p className="text-xs text-muted-foreground">
            Avanzado: <span className="font-mono font-semibold text-foreground">{((workItem.quantity * workItem.progress) / 100).toLocaleString('es-CL')}</span> de{' '}
            <span className="font-mono font-semibold text-foreground">{workItem.quantity.toLocaleString('es-CL')}</span>{' '}
            <span className="text-muted-foreground/80">{workItem.unit}</span>
          </p>
        </div>
        <span className="text-xs font-mono font-bold text-primary tabular-nums">{workItem.progress.toFixed(1)}%</span>
      </div>

      <RegisterProgressFormInner
        control={control}
        register={register}
        errors={errors}
        isSubmitting={isSubmitting}
        handleSubmit={handleSubmit}
        onSubmit={onSubmit}
        canRegister={canRegister}
        workItem={workItem}
      />
    </div>
  );
}

// --- Inner Form Component (reusable) ---
function RegisterProgressFormInner({
  control, register, errors, isSubmitting, handleSubmit, onSubmit, canRegister, workItem
}: any) {
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="date" className="text-xs">Fecha del Avance</Label>
          <Controller
            name="date"
            control={control}
            render={({ field }) => (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal h-9 text-sm',
                      !field.value && 'text-muted-foreground'
                    )}
                    disabled={!canRegister}
                  >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {field.value ? format(field.value, 'PPP', { locale: es }) : 'Seleccionar fecha'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={!canRegister} />
                </PopoverContent>
              </Popover>
            )}
          />
          {errors.date && <p className="text-[11px] text-destructive">{errors.date.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="quantity" className="text-xs">
            Cantidad Avanzada <span className="text-muted-foreground">({workItem.unit})</span>
          </Label>
          <Input
            id="quantity"
            type="number"
            step="any"
            className="h-9 text-sm"
            {...register('quantity')}
            disabled={!canRegister}
          />
          {errors.quantity && <p className="text-[11px] text-destructive">{errors.quantity.message}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="observations" className="text-xs">Observaciones <span className="text-muted-foreground">(Opcional)</span></Label>
        <Textarea
          id="observations"
          placeholder="Ej: Avance del sector norte, losa nivel 3..."
          className="text-sm min-h-[60px] resize-none"
          {...register('observations')}
          disabled={!canRegister}
        />
      </div>

      <Button type="submit" className="w-full gap-2 h-9" disabled={isSubmitting || !canRegister}>
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        Guardar Avance
      </Button>

      {!canRegister && (
        <p className="text-[11px] text-center text-muted-foreground">No tienes permiso para registrar avances.</p>
      )}
    </form>
  );
}
