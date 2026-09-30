"use client";

import { useMemo, useState } from 'react';
import { BookOpen, Loader2, NotebookPen } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatDate, toCalendarDay } from '@/lib/date-utils';
import { CAUSAS_CNC } from '@/lib/last-planner';
import { borradorDelDia, asientoDeAvance } from '@/lib/train-links';
import type { BitacoraWeather, TrainActivity, WorkUnit, DailyProgress } from '@/modules/core/lib/data';

const CLIMAS: { value: BitacoraWeather; label: string }[] = [
  { value: 'soleado', label: 'Soleado' },
  { value: 'nublado', label: 'Nublado' },
  { value: 'lluvia', label: 'Lluvia' },
  { value: 'viento', label: 'Viento' },
  { value: 'heladas', label: 'Heladas' },
];

/**
 * Pasa el parte diario a la bitácora de obra y al libro de obra.
 *
 * Es el mismo día contado tres veces —el parte, la bitácora y el asiento— y
 * hoy se escribe tres veces a mano. Acá se escribe una y se propone el resto,
 * pero SIEMPRE editable y con un botón de por medio: la bitácora se firma y el
 * libro de obra se lee en un arbitraje. Un texto que aparece solo, sin que
 * nadie lo revise, es exactamente lo que deja a los dos sin valor.
 *
 * El clima es lo único que no sale del parte: nadie lo reporta desde el
 * teléfono, así que se elige acá.
 */
export function TraspasoDelDia({ fecha, actividades, unidades, progresos, onCerrar }: {
  fecha: Date;
  actividades: TrainActivity[];
  unidades: WorkUnit[];
  progresos: DailyProgress[];
  onCerrar: () => void;
}) {
  const {
    addBitacoraEntry, addAsiento, libroObra, can, notify,
  } = useAppState();

  const borrador = useMemo(
    () => borradorDelDia(fecha, actividades, unidades, progresos, CAUSAS_CNC),
    [fecha, actividades, unidades, progresos],
  );

  const [clima, setClima] = useState<BitacoraWeather>('soleado');
  const [trabajadores, setTrabajadores] = useState<number | ''>(
    borrador.jornadas > 0 ? borrador.jornadas : '',
  );
  const [trabajos, setTrabajos] = useState(borrador.trabajos);
  const [incidencias, setIncidencias] = useState(borrador.incidencias);
  const [asiento, setAsiento] = useState(() => asientoDeAvance(fecha, borrador));
  const [rol, setRol] = useState('constructor');

  const [guardando, setGuardando] = useState<'bitacora' | 'libro' | null>(null);
  const [hechoBitacora, setHechoBitacora] = useState(false);
  const [hechoLibro, setHechoLibro] = useState(false);

  const puedeEscribir = can('construction_control:register_progress')
    || can('construction_control:edit_structure');

  const guardarBitacora = async () => {
    if (!trabajos.trim()) {
      notify('La bitácora necesita al menos la descripción de los trabajos.', 'destructive');
      return;
    }
    setGuardando('bitacora');
    try {
      await addBitacoraEntry({
        date: toCalendarDay(fecha) ?? new Date(),
        weather: clima,
        workerCount: Number(trabajadores) || 0,
        workPerformed: trabajos.trim(),
        incidents: incidencias.trim() || undefined,
        observations: 'Generado desde el parte diario del tren de actividades.',
      });
      notify('Entrada de bitácora registrada.', 'success');
      setHechoBitacora(true);
    } catch (e: any) {
      notify(e.message ?? 'No se pudo guardar la bitácora.', 'destructive');
    } finally {
      setGuardando(null);
    }
  };

  const guardarAsiento = async () => {
    if (!libroObra) return;
    if (!asiento.trim()) {
      notify('El asiento no puede ir vacío.', 'destructive');
      return;
    }
    setGuardando('libro');
    try {
      await addAsiento({
        libroId: libroObra.id,
        fecha: toCalendarDay(fecha) ?? new Date(),
        tipo: 'avance',
        contenido: asiento.trim(),
        autorRol: rol,
      });
      notify('Asiento agregado al libro de obra.', 'success');
      setHechoLibro(true);
    } catch (e: any) {
      notify(e.message ?? 'No se pudo agregar el asiento.', 'destructive');
    } finally {
      setGuardando(null);
    }
  };

  return (
    <Dialog open onOpenChange={(abierto) => { if (!abierto) onCerrar(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Traspasar el día del {formatDate(fecha)}</DialogTitle>
          <DialogDescription>
            El parte diario ya tiene lo que pasó. Acá se propone el mismo día escrito
            como corresponde a la bitácora y al libro de obra — revísalo y ajústalo
            antes de guardar.
          </DialogDescription>
        </DialogHeader>

        {!borrador.hayDatos ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Este día no tiene ningún parte cargado, así que no hay nada que traspasar.
          </p>
        ) : (
          <div className="space-y-6">
            {/* Bitácora */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <NotebookPen className="h-4 w-4" />
                Entrada de bitácora
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Condición climática</Label>
                  <Select value={clima} onValueChange={(v) => setClima(v as BitacoraWeather)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CLIMAS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Personal en terreno
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    className="h-9"
                    value={trabajadores}
                    onChange={(e) => setTrabajadores(
                      e.target.value === '' ? '' : Number(e.target.value),
                    )}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Viene de las jornadas cargadas en el parte. Corrígelo si faltó gente
                    por anotar.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Trabajos realizados</Label>
                <Textarea
                  rows={5}
                  value={trabajos}
                  onChange={(e) => setTrabajos(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Incidentes / lo que no avanzó
                </Label>
                <Textarea
                  rows={3}
                  value={incidencias}
                  onChange={(e) => setIncidencias(e.target.value)}
                />
              </div>

              <Button
                size="sm"
                disabled={!puedeEscribir || guardando !== null || hechoBitacora}
                onClick={guardarBitacora}
              >
                {guardando === 'bitacora'
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : null}
                {hechoBitacora ? 'Guardada en la bitácora' : 'Guardar en la bitácora'}
              </Button>
            </section>

            {/* Libro de obra */}
            <section className="space-y-3 border-t border-border pt-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <BookOpen className="h-4 w-4" />
                Asiento del libro de obra
              </div>

              {!libroObra ? (
                <p className="text-sm text-muted-foreground">
                  La empresa todavía no tiene libro de obra abierto. Se crea en Control de
                  Obra → Libro de Obra, y desde ahí este día se puede anotar como asiento
                  de avance.
                </p>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Firma como</Label>
                    <Select value={rol} onValueChange={setRol}>
                      <SelectTrigger className="h-9 sm:w-64"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="constructor">Constructor</SelectItem>
                        <SelectItem value="ito">Inspector Técnico (ITO)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Contenido del asiento (tipo «avance»)
                    </Label>
                    <Textarea
                      rows={7}
                      value={asiento}
                      onChange={(e) => setAsiento(e.target.value)}
                    />
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!puedeEscribir || guardando !== null || hechoLibro}
                    onClick={guardarAsiento}
                  >
                    {guardando === 'libro'
                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      : null}
                    {hechoLibro ? 'Anotado en el libro' : 'Anotar en el libro de obra'}
                  </Button>
                </>
              )}
            </section>

            {!puedeEscribir && (
              <p className="text-xs text-muted-foreground">
                No tienes permiso para escribir en la bitácora ni en el libro de obra.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
