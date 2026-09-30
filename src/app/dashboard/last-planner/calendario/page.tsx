"use client";

import { useMemo, useState } from 'react';
import { Plus, Trash2, Download, Building2, Globe } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { useToast } from '@/modules/core/hooks/use-toast';
import { PageHeader } from '@/components/page-header';
import { PlanLocked } from '@/components/plan-locked';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatDate } from '@/lib/date-utils';
import { feriadosDeChile } from '@/lib/chile-holidays';
import {
  NOMBRE_DIA, DIAS_HABILES_POR_DEFECTO, claveDia, indexarExcepciones, esDiaHabil,
} from '@/lib/work-calendar';
import type { WorkCalendarException } from '@/modules/core/lib/data';

const DIAS = [1, 2, 3, 4, 5, 6, 7];

/**
 * Calendario laboral de la obra.
 *
 * Dos cosas, y en este orden: qué días de la semana se trabaja, y qué fechas
 * sueltas se salen de esa regla. Con eso el tren de actividades puede calcular
 * las fechas de cada unidad en vez de que alguien las escriba a mano.
 *
 * Los feriados legales se cargan a nivel de EMPRESA (una vez, valen para todas
 * las obras) y las excepciones propias a nivel de OBRA. Es la diferencia entre
 * "el país no trabaja el 18" y "esta obra sí trabajó ese sábado para recuperar".
 */
export default function CalendarioLaboralPage() {
  const {
    projects, workCalendarExceptions, currentProjectId, updateProject,
    deleteCalendarException, can, lockedFeature,
  } = useAppState();
  const { toast } = useToast();

  const [cargandoFeriados, setCargandoFeriados] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [guardandoDias, setGuardandoDias] = useState(false);

  const obra = useMemo(
    () => projects.find((p) => p.id === currentProjectId) ?? null,
    [projects, currentProjectId],
  );

  const diasQueSeTrabaja = obra?.workDays?.length ? obra.workDays : DIAS_HABILES_POR_DEFECTO;

  /** Las de la empresa valen para todas las obras; las propias, solo para esta. */
  const deLaEmpresa = useMemo(
    () => ordenar(workCalendarExceptions.filter((e) => !e.projectId)),
    [workCalendarExceptions],
  );
  const deLaObra = useMemo(
    () => ordenar(workCalendarExceptions.filter((e) => e.projectId === currentProjectId)),
    [workCalendarExceptions, currentProjectId],
  );

  const excepcionesVigentes = useMemo(
    () => indexarExcepciones(workCalendarExceptions, currentProjectId),
    [workCalendarExceptions, currentProjectId],
  );

  const hoyEsHabil = esDiaHabil(new Date(), obra?.workDays, excepcionesVigentes);

  const editable = can('planning:manage');

  async function alternarDia(dia: number) {
    if (!obra || !editable) return;
    const actuales = diasQueSeTrabaja;
    const nuevos = actuales.includes(dia)
      ? actuales.filter((d) => d !== dia)
      : [...actuales, dia].sort((a, b) => a - b);

    // Una obra sin ningún día hábil dejaría cualquier cálculo de fechas sin
    // salida: no hay "próximo día" que encontrar nunca.
    if (nuevos.length === 0) {
      toast({
        variant: 'destructive',
        title: 'La obra necesita al menos un día',
        description: 'Sin días hábiles no se puede calcular ninguna fecha del programa.',
      });
      return;
    }

    setGuardandoDias(true);
    try {
      await updateProject(obra.id, { workDays: nuevos });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo guardar', description: e.message });
    } finally {
      setGuardandoDias(false);
    }
  }

  async function borrar(e: WorkCalendarException) {
    try {
      await deleteCalendarException(e.id);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'No se pudo borrar', description: err.message });
    }
  }

  const bloqueoDePlan = lockedFeature('planning:view');
  if (bloqueoDePlan) return <PlanLocked feature={bloqueoDePlan} title="Calendario laboral" />;

  if (!can('planning:view') && !editable) {
    return (
      <div className="space-y-6">
        <PageHeader title="Calendario laboral" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No tienes permiso para ver la programación de la obra.
        </CardContent></Card>
      </div>
    );
  }

  if (!currentProjectId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Calendario laboral" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Selecciona una obra para configurar su calendario.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Configurar"
        title="Calendario laboral"
        description="Con qué días cuenta el programa. Sin esto, una actividad que empieza un jueves y dura tres días termina un domingo."
        actions={editable ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAgregando(true)}>
              <Plus className="mr-2 h-4 w-4" />Agregar fecha
            </Button>
            <Button size="sm" onClick={() => setCargandoFeriados(true)}>
              <Download className="mr-2 h-4 w-4" />Cargar feriados
            </Button>
          </div>
        ) : undefined}
      />

      {/* Días de la semana */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-foreground">Días que se trabaja</div>
              <p className="text-xs text-muted-foreground">
                Toca un día para incluirlo o sacarlo. Aplica solo a esta obra.
              </p>
            </div>
            <StatusBadge tone={hoyEsHabil ? 'success' : 'neutral'}>
              {hoyEsHabil ? 'Hoy se trabaja' : 'Hoy no se trabaja'}
            </StatusBadge>
          </div>
          <div className="flex flex-wrap gap-2">
            {DIAS.map((d) => {
              const activo = diasQueSeTrabaja.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  disabled={!editable || guardandoDias}
                  onClick={() => alternarDia(d)}
                  aria-pressed={activo}
                  className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                    activo
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border bg-muted/40 text-muted-foreground'
                  } ${editable ? 'hover:border-primary/60' : 'cursor-default'}`}
                >
                  {NOMBRE_DIA[d]}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Excepciones */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ListaExcepciones
          titulo="Feriados de la empresa"
          descripcion="Valen para todas las obras. Acá se cargan los feriados legales."
          icono={Globe}
          excepciones={deLaEmpresa}
          editable={editable}
          onBorrar={borrar}
          vacio="Todavía no hay feriados cargados. Usa «Cargar feriados» para traer los del año."
        />
        <ListaExcepciones
          titulo="Excepciones de esta obra"
          descripcion="Solo para esta obra: un día que se trabajó, o un cierre propio."
          icono={Building2}
          excepciones={deLaObra}
          editable={editable}
          onBorrar={borrar}
          vacio="Esta obra sigue el calendario de la empresa, sin excepciones propias."
        />
      </div>

      {cargandoFeriados && <DialogoFeriados onCerrar={() => setCargandoFeriados(false)} existentes={deLaEmpresa} />}
      {agregando && <DialogoExcepcion onCerrar={() => setAgregando(false)} />}
    </div>
  );
}

function ordenar(lista: WorkCalendarException[]): WorkCalendarException[] {
  return [...lista].sort((a, b) => claveDia(a.date).localeCompare(claveDia(b.date)));
}

function ListaExcepciones({
  titulo, descripcion, icono: Icono, excepciones, editable, onBorrar, vacio,
}: {
  titulo: string;
  descripcion: string;
  icono: React.ElementType;
  excepciones: WorkCalendarException[];
  editable: boolean;
  onBorrar: (e: WorkCalendarException) => void;
  vacio: string;
}) {
  /* Lo que ya pasó no se puede cambiar y solo estorba: se muestran las fechas
     de hoy en adelante, y las pasadas quedan detrás de un botón. */
  const hoy = claveDia(new Date());
  const [verPasadas, setVerPasadas] = useState(false);

  const futuras = excepciones.filter((e) => claveDia(e.date) >= hoy);
  const pasadas = excepciones.filter((e) => claveDia(e.date) < hoy);
  const visibles = verPasadas ? excepciones : futuras;

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Icono className="h-4 w-4 text-primary" />
          <div className="text-sm font-semibold text-foreground">{titulo}</div>
          <StatusBadge tone="neutral">{excepciones.length}</StatusBadge>
        </div>
        <p className="text-xs text-muted-foreground">{descripcion}</p>

        {visibles.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{vacio}</p>
        ) : (
          <ul className="divide-y divide-border">
            {visibles.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{e.name}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(e.date)}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge tone={e.type === 'trabajado' ? 'success' : 'warning'}>
                    {e.type === 'trabajado' ? 'Se trabaja' : 'No se trabaja'}
                  </StatusBadge>
                  {editable && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-danger"
                      onClick={() => onBorrar(e)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {pasadas.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setVerPasadas((v) => !v)}>
            {verPasadas ? 'Ocultar las pasadas' : `Ver ${pasadas.length} fecha(s) ya pasadas`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Cargar los feriados de un año ────────────────────────────────────── */

function DialogoFeriados({ onCerrar, existentes }: {
  onCerrar: () => void;
  existentes: WorkCalendarException[];
}) {
  const { addCalendarExceptions } = useAppState();
  const { toast } = useToast();

  const [anio, setAnio] = useState(() => new Date().getFullYear());
  const [ocupado, setOcupado] = useState(false);

  const anios = useMemo(() => {
    const actual = new Date().getFullYear();
    return [actual, actual + 1, actual + 2, actual + 3];
  }, []);

  /* Solo los que faltan: cargar dos veces el mismo año lo rechazaría la base
     por el índice único, y perdería la tanda entera por una fecha repetida. */
  const yaCargadas = useMemo(
    () => new Set(existentes.map((e) => claveDia(e.date))),
    [existentes],
  );
  const faltantes = useMemo(
    () => feriadosDeChile(anio).filter((f) => !yaCargadas.has(f.date)),
    [anio, yaCargadas],
  );

  async function guardar() {
    setOcupado(true);
    try {
      const cuantos = await addCalendarExceptions(
        faltantes.map((f) => ({ date: f.date, name: f.name, type: 'feriado' as const })),
        null, // nivel empresa: valen para todas las obras
      );
      toast({ title: `${cuantos} feriados cargados` });
      onCerrar();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudieron cargar', description: e.message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cargar feriados de Chile</DialogTitle>
          <DialogDescription>
            Quedan a nivel de empresa: valen para todas tus obras.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Año</Label>
            <Select value={String(anio)} onValueChange={(v) => setAnio(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {anios.map((a) => (
                  <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            {faltantes.length === 0 ? (
              <span className="text-muted-foreground">
                Los feriados de {anio} ya están cargados.
              </span>
            ) : (
              <>
                <div className="font-medium text-foreground">
                  Se van a cargar {faltantes.length} feriados
                </div>
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {faltantes.slice(0, 5).map((f) => (
                    <li key={f.date}>{formatDate(f.date)} · {f.name}</li>
                  ))}
                  {faltantes.length > 5 && <li>… y {faltantes.length - 5} más</li>}
                </ul>
              </>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Los feriados que se corren de día por ley (San Pedro y San Pablo, el
            Encuentro de Dos Mundos y el de las Iglesias Evangélicas) vienen ya
            trasladados. <strong>Conviene revisarlos</strong> contra el calendario
            oficial del año: cualquiera se puede corregir o borrar acá mismo.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={ocupado || faltantes.length === 0}>
            Cargar {faltantes.length > 0 ? faltantes.length : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Agregar una fecha suelta ─────────────────────────────────────────── */

function DialogoExcepcion({ onCerrar }: { onCerrar: () => void }) {
  const { addCalendarExceptions, currentProjectId } = useAppState();
  const { toast } = useToast();

  const [fecha, setFecha] = useState(() => claveDia(new Date()));
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<'feriado' | 'trabajado'>('feriado');
  const [ambito, setAmbito] = useState<'obra' | 'empresa'>('obra');
  const [ocupado, setOcupado] = useState(false);

  async function guardar() {
    setOcupado(true);
    try {
      await addCalendarExceptions(
        [{ date: fecha, name: nombre.trim(), type: tipo }],
        ambito === 'obra' ? (currentProjectId ?? null) : null,
      );
      onCerrar();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo agregar', description: e.message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar fecha al calendario</DialogTitle>
          <DialogDescription>
            Una fecha que se sale de la regla: un cierre, o un día que sí se trabajó.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ex-fecha">Fecha</Label>
              <Input id="ex-fecha" type="date" value={fecha}
                onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Qué pasa ese día</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as 'feriado' | 'trabajado')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="feriado">No se trabaja</SelectItem>
                  <SelectItem value="trabajado">Sí se trabaja</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ex-nombre">Motivo</Label>
            <Input id="ex-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Cierre por fiestas patrias" />
          </div>

          <div className="space-y-2">
            <Label>A quién aplica</Label>
            <Select value={ambito} onValueChange={(v) => setAmbito(v as 'obra' | 'empresa')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="obra">Solo esta obra</SelectItem>
                <SelectItem value="empresa">Todas las obras de la empresa</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Lo de la obra le gana a lo de la empresa: así una obra puede trabajar
              un feriado que el resto no trabaja.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={ocupado || !nombre.trim() || !fecha}>
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
