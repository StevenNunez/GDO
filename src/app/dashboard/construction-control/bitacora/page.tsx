'use client';

import React, { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { useToast } from '@/modules/core/hooks/use-toast';
import { BitacoraEntry, BitacoraWeather } from '@/modules/core/lib/data';
import { SurfaceCard } from '@/components/ui/surface-card';
import { PanelCard } from '@/components/ui/panel-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  BookOpen, Plus, Users, Cloud, Sun, CloudRain, Wind, Snowflake,
  Loader2, Trash2, Calendar, ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toDate } from '@/lib/date-utils';
import { cn } from '@/lib/utils';

// El clima no es un estado semántico (no hay "bueno/malo"), así que va con
// colores propios en pares claro/oscuro en vez de los tokens success/warning.
const WEATHER_OPTIONS: { value: BitacoraWeather; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'soleado', label: 'Soleado', icon: Sun, color: 'text-amber-600 dark:text-amber-400' },
  { value: 'nublado', label: 'Nublado', icon: Cloud, color: 'text-zinc-500 dark:text-zinc-400' },
  { value: 'lluvia', label: 'Lluvia', icon: CloudRain, color: 'text-blue-600 dark:text-blue-400' },
  { value: 'viento', label: 'Viento', icon: Wind, color: 'text-teal-600 dark:text-teal-400' },
  { value: 'heladas', label: 'Heladas', icon: Snowflake, color: 'text-sky-600 dark:text-sky-300' },
];

const weatherInfo = (w: BitacoraWeather) => WEATHER_OPTIONS.find(o => o.value === w) ?? WEATHER_OPTIONS[0];

function EntryCard({ entry, onDelete, canDelete }: {
  entry: BitacoraEntry;
  onDelete: (id: string) => void;
  canDelete: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const w = weatherInfo(entry.weather);
  const WeatherIcon = w.icon;
  const dateObj = toDate(entry.date) ?? new Date();

  return (
    <SurfaceCard interactive={false}>
      <div
        className="cursor-pointer p-5 transition-colors hover:bg-muted/40"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-1.5 shrink-0">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="font-bold text-sm">{format(dateObj, "EEEE d 'de' MMMM", { locale: es })}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className={cn('flex items-center gap-1', w.color)}>
                <WeatherIcon className="h-4 w-4" /> {w.label}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> {entry.workerCount} trabajadores
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground hidden sm:block">{entry.authorName}</span>
            {canDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={e => e.stopPropagation()}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar entrada?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Se eliminará la entrada del {format(dateObj, "d 'de' MMMM yyyy", { locale: es })}. Esta acción no se puede deshacer.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onDelete(entry.id)}
                      className="bg-destructive hover:bg-destructive/90"
                    >
                      Eliminar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-border p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Trabajos realizados</p>
            <p className="text-sm whitespace-pre-wrap">{entry.workPerformed}</p>
          </div>
          {entry.equipment && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Equipos y maquinaria</p>
              <p className="text-sm">{entry.equipment}</p>
            </div>
          )}
          {entry.incidents && (
            <div>
              <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-danger">
                <AlertTriangle className="h-3 w-3" /> Incidentes / No conformidades
              </p>
              <p className="rounded-lg border border-danger/25 bg-danger-subtle p-2 text-sm text-danger">{entry.incidents}</p>
            </div>
          )}
          {entry.observations && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Observaciones generales</p>
              <p className="text-sm">{entry.observations}</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Registrado por {entry.authorName} · {entry.createdAt && format(toDate(entry.createdAt) ?? new Date(), "HH:mm 'del' d/MM/yyyy")}
          </p>
        </div>
      )}
    </SurfaceCard>
  );
}

const defaultForm = () => ({
  date: format(new Date(), 'yyyy-MM-dd'),
  weather: 'soleado' as BitacoraWeather,
  workerCount: '' as unknown as number,
  workPerformed: '',
  equipment: '',
  incidents: '',
  observations: '',
});

export default function BitacoraPage() {
  const { bitacoraEntries, addBitacoraEntry, deleteBitacoraEntry, can } = useAppState();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState(defaultForm);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.workPerformed.trim()) {
      toast({ variant: 'destructive', title: 'Campo requerido', description: 'Debes describir los trabajos realizados.' });
      return;
    }
    setIsSubmitting(true);
    try {
      await addBitacoraEntry({
        date: new Date(form.date + 'T12:00:00'),
        weather: form.weather,
        workerCount: Number(form.workerCount) || 0,
        workPerformed: form.workPerformed.trim(),
        equipment: form.equipment.trim() || undefined,
        incidents: form.incidents.trim() || undefined,
        observations: form.observations.trim() || undefined,
      });
      toast({ title: 'Entrada registrada', description: 'La entrada de bitácora fue guardada.' });
      setForm(defaultForm());
      setShowForm(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteBitacoraEntry(id);
      toast({ title: 'Entrada eliminada', variant: 'default' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
  };

  const canEdit = can('construction_control:register_progress') || can('construction_control:edit_structure');

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Bitácora de Obra"
          description="Registro diario de actividades, clima, personal presente y observaciones de terreno."
        />
        {canEdit && (
          <Button
            onClick={() => setShowForm(s => !s)}
            className="shrink-0"
          >
            <Plus className="mr-2 h-4 w-4" />
            Nueva entrada
          </Button>
        )}
      </div>

      {/* Formulario nueva entrada */}
      {showForm && (
        <PanelCard
          title="Nueva entrada de bitácora"
          description="Registra las actividades realizadas hoy en terreno."
          icon={BookOpen}
          className="border-primary/30"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="date">Fecha</Label>
                  <Input
                    id="date"
                    type="date"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Condición climática</Label>
                  <Select value={form.weather} onValueChange={v => setForm(f => ({ ...f, weather: v as BitacoraWeather }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEATHER_OPTIONS.map(o => {
                        const Icon = o.icon;
                        return (
                          <SelectItem key={o.value} value={o.value}>
                            <span className={cn('flex items-center gap-2', o.color)}>
                              <Icon className="h-4 w-4" /> {o.label}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="workerCount">Personal presente</Label>
                  <Input
                    id="workerCount"
                    type="number"
                    min={0}
                    placeholder="Nº de trabajadores"
                    value={form.workerCount}
                    onChange={e => setForm(f => ({ ...f, workerCount: e.target.valueAsNumber }))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="workPerformed">Trabajos realizados <span className="text-destructive">*</span></Label>
                <Textarea
                  id="workPerformed"
                  placeholder="Describe detalladamente los trabajos ejecutados, áreas, avances específicos..."
                  rows={4}
                  value={form.workPerformed}
                  onChange={e => setForm(f => ({ ...f, workPerformed: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="equipment">Equipos y maquinaria utilizada <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                <Textarea
                  id="equipment"
                  placeholder="Grúa, retroexcavadora, mixer, andamios, herramientas especiales..."
                  rows={2}
                  value={form.equipment}
                  onChange={e => setForm(f => ({ ...f, equipment: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="incidents" className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                  Incidentes / No conformidades <span className="text-muted-foreground text-xs">(opcional)</span>
                </Label>
                <Textarea
                  id="incidents"
                  placeholder="Accidentes, cuasi-accidentes, no conformidades de calidad, paralizaciones..."
                  rows={2}
                  value={form.incidents}
                  onChange={e => setForm(f => ({ ...f, incidents: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="observations">Observaciones generales <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                <Textarea
                  id="observations"
                  placeholder="Instrucciones del Inspector Técnico, observaciones de materiales, visitas, etc."
                  rows={2}
                  value={form.observations}
                  onChange={e => setForm(f => ({ ...f, observations: e.target.value }))}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)} disabled={isSubmitting}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting} className="flex-1 sm:flex-none">
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Guardar entrada
                </Button>
              </div>
            </form>
        </PanelCard>
      )}

      {/* Lista de entradas */}
      <div className="space-y-3">
        {(bitacoraEntries || []).length > 0 ? (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {bitacoraEntries.length} {bitacoraEntries.length === 1 ? 'entrada' : 'entradas'} registradas
              </p>
            </div>
            {bitacoraEntries.map(entry => (
              <EntryCard
                key={entry.id}
                entry={entry}
                onDelete={handleDelete}
                canDelete={canEdit}
              />
            ))}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border bg-card p-16 text-center text-muted-foreground">
            <BookOpen className="mb-4 h-12 w-12 opacity-40" />
            <h3 className="text-lg font-bold tracking-tight">Bitácora vacía</h3>
            <p className="mt-1 max-w-sm text-sm">
              No hay entradas registradas. Usa el botón "Nueva entrada" para comenzar a documentar las actividades diarias de la obra.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
