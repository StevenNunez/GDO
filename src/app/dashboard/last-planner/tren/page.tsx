"use client";

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Plus, Trash2, ArrowUp, ArrowDown, LayoutGrid, Layers, CalendarClock,
} from 'lucide-react';
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
import { unidadesDeObra, unidadesActivas, agruparUnidades } from '@/lib/work-units';
import { indexarExcepciones, claveDia } from '@/lib/work-calendar';
import {
  actividadesDeObra, matrizDelTren, terminoDelTren, escalonarActividades,
  estadoDeCelda, validarActividad, esSoloAviso, unidadesDeActividad,
  ritmoEnPalabras,
  type EstadoCelda, type FilaDelTren,
} from '@/lib/train';
import { getLeafItems } from '@/lib/budget-costs';
import type { TrainActivity, WorkUnit } from '@/modules/core/lib/data';

const TODOS = '__todos__';
const SIN_PARTIDA = '__sin_partida__';
const SIN_SUBCONTRATO = '__sin_subcontrato__';

/** Cuántas unidades se pintan de una antes de exigir filtrar por grupo. */
const LIMITE_SIN_FILTRO = 60;

const COLOR_CELDA: Record<EstadoCelda, string> = {
  pasada: 'bg-muted/60 text-muted-foreground',
  hoy: 'bg-primary/15 text-primary font-semibold',
  proxima: 'bg-warning-subtle text-warning',
  futura: 'bg-card text-muted-foreground',
};

/**
 * El tren de actividades: la matriz del programa de terminaciones.
 *
 * Filas = actividades, columnas = unidades, celda = el día que le toca esa
 * actividad a ese depto. Las fechas **no** están guardadas: salen del inicio de
 * cada actividad, su ritmo y el calendario laboral (`src/lib/train.ts`). Correr
 * una fecha de inicio un día repinta la fila entera sin escribir 240 celdas.
 */
export default function TrenPage() {
  const {
    trainActivities, workUnits, workCalendarExceptions, projects,
    currentProjectId, can, lockedFeature,
  } = useAppState();

  const [grupoVisible, setGrupoVisible] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [escalonando, setEscalonando] = useState(false);
  const [editando, setEditando] = useState<TrainActivity | null>(null);

  const obra = useMemo(
    () => projects.find((p) => p.id === currentProjectId) ?? null,
    [projects, currentProjectId],
  );

  const unidades = useMemo(
    () => unidadesActivas(unidadesDeObra(workUnits, currentProjectId)),
    [workUnits, currentProjectId],
  );

  const grupos = useMemo(() => agruparUnidades(unidades), [unidades]);

  const calendario = useMemo(
    () => indexarExcepciones(workCalendarExceptions, currentProjectId),
    [workCalendarExceptions, currentProjectId],
  );

  const actividades = useMemo(
    () => actividadesDeObra(trainActivities, currentProjectId),
    [trainActivities, currentProjectId],
  );

  /* La matriz se calcula una vez, no celda por celda dentro del render: una
     obra grande son 14.400 celdas y recalcular cada una al pintar la deja
     inusable. */
  const filas = useMemo(
    () => matrizDelTren(actividades, unidades, obra?.workDays, calendario),
    [actividades, unidades, obra?.workDays, calendario],
  );

  const termino = useMemo(() => terminoDelTren(filas), [filas]);

  /* Con muchas unidades se arranca mostrando un solo grupo: pintar 240
     columnas por 60 filas de una es lento y además no se lee. */
  const grupoElegido = grupoVisible
    ?? (unidades.length > LIMITE_SIN_FILTRO ? (grupos[0]?.groupName ?? TODOS) : TODOS);

  const columnas: WorkUnit[] = useMemo(() => {
    if (grupoElegido === TODOS) return unidades;
    return grupos.find((g) => g.groupName === grupoElegido)?.unidades ?? unidades;
  }, [grupoElegido, grupos, unidades]);

  const editable = can('planning:manage');

  const bloqueoDePlan = lockedFeature('planning:view');
  if (bloqueoDePlan) return <PlanLocked feature={bloqueoDePlan} title="Tren de actividades" />;

  if (!can('planning:view') && !editable) {
    return (
      <div className="space-y-6">
        <PageHeader title="Tren de actividades" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No tienes permiso para ver la programación de la obra.
        </CardContent></Card>
      </div>
    );
  }

  if (!currentProjectId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Tren de actividades" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Selecciona una obra para armar su tren.
        </CardContent></Card>
      </div>
    );
  }

  /* Sin unidades no hay matriz que pintar: son las columnas. Conviene mandar
     derecho a cargarlas en vez de mostrar una tabla vacía. */
  if (unidades.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Tren de actividades" />
        <Card>
          <CardContent className="space-y-3 p-6 text-sm text-muted-foreground">
            <LayoutGrid className="h-6 w-6" />
            <p className="font-medium text-foreground">
              Primero hay que cargar las unidades de la obra.
            </p>
            <p>
              Las unidades son las columnas de esta matriz: sin ellas no hay dónde
              programar las actividades.
            </p>
            <Button asChild size="sm">
              <Link href="/dashboard/last-planner/unidades">Ir a Unidades de obra</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Programar"
        title="Tren de actividades"
        description="Qué día le toca cada actividad a cada unidad. Las fechas se calculan solas desde el ritmo y el calendario: correr un inicio un día repinta la fila entera."
        actions={editable ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEscalonando(true)}
              disabled={actividades.length === 0}>
              <CalendarClock className="mr-2 h-4 w-4" />Escalonar
            </Button>
            <Button size="sm" onClick={() => setCreando(true)}>
              <Plus className="mr-2 h-4 w-4" />Nueva actividad
            </Button>
          </div>
        ) : undefined}
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="info">
          {actividades.length} {actividades.length === 1 ? 'actividad' : 'actividades'}
        </StatusBadge>
        <StatusBadge tone="neutral">{unidades.length} unidades</StatusBadge>
        {termino && (
          <StatusBadge tone="success">Termina el {formatDate(termino)}</StatusBadge>
        )}
      </div>

      {actividades.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 p-6 text-sm text-muted-foreground">
            <Layers className="h-6 w-6" />
            <p className="font-medium text-foreground">El tren todavía no tiene actividades.</p>
            <p>
              Cada actividad es una fila que recorre las {unidades.length} unidades a su
              propio ritmo. Con el <strong>ritmo</strong> y la <strong>fecha de inicio</strong>,
              la aplicación calcula qué día corresponde trabajar en cada unidad.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Selector de grupo: pintar 240 columnas de una es lento y no se lee. */}
          {grupos.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="tren-grupo" className="text-xs text-muted-foreground">
                Ver unidades de
              </Label>
              <Select value={grupoElegido} onValueChange={setGrupoVisible}>
                <SelectTrigger id="tren-grupo" className="h-9 w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>
                    Todos los grupos ({unidades.length} unidades)
                  </SelectItem>
                  {grupos.map((g) => (
                    <SelectItem key={g.groupName} value={g.groupName}>
                      {g.groupName} ({g.unidades.length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Leyenda />
            </div>
          )}

          <Matriz
            filas={filas}
            columnas={columnas}
            workDays={obra?.workDays ?? null}
            calendario={calendario}
            editable={editable}
            onEditar={setEditando}
          />
        </>
      )}

      {creando && (
        <DialogoActividad onCerrar={() => setCreando(false)} unidades={unidades}
          grupos={grupos.map((g) => g.groupName)} actividades={actividades} />
      )}
      {editando && (
        <DialogoActividad actividad={editando} onCerrar={() => setEditando(null)}
          unidades={unidades} grupos={grupos.map((g) => g.groupName)} actividades={actividades} />
      )}
      {escalonando && (
        <DialogoEscalonar onCerrar={() => setEscalonando(false)} actividades={actividades}
          workDays={obra?.workDays ?? null} calendario={calendario} />
      )}
    </div>
  );
}

function Leyenda() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1">
        <i className="h-3 w-3 rounded bg-primary/15" /> En curso
      </span>
      <span className="flex items-center gap-1">
        <i className="h-3 w-3 rounded bg-warning-subtle" /> Esta semana
      </span>
      <span className="flex items-center gap-1">
        <i className="h-3 w-3 rounded bg-muted/60" /> Ya pasó
      </span>
    </div>
  );
}

/* ── La matriz ────────────────────────────────────────────────────────── */

function Matriz({ filas, columnas, workDays, calendario, editable, onEditar }: {
  filas: FilaDelTren[];
  columnas: WorkUnit[];
  workDays: number[] | null;
  calendario: Map<string, 'feriado' | 'trabajado'>;
  editable: boolean;
  onEditar: (a: TrainActivity) => void;
}) {
  const hoy = new Date();

  return (
    /* La matriz es lo único de la pantalla que puede desbordar a lo ancho: va
       en su propio contenedor con scroll para que el resto de la página no se
       corra en el teléfono. */
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-max border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-20 min-w-[15rem] border-b border-r border-border bg-card p-2 text-left font-semibold text-foreground">
              Actividad
            </th>
            {columnas.map((u) => (
              <th key={u.id}
                className="min-w-[3.5rem] border-b border-border bg-muted/40 p-1 text-center font-medium text-muted-foreground">
                <div className="truncate">{u.name}</div>
                {u.typology && (
                  <div className="truncate text-[10px] font-normal opacity-70">{u.typology}</div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map(({ actividad, celdas, resumen }) => (
            <tr key={actividad.id} className="even:bg-muted/20">
              <th
                onClick={() => editable && onEditar(actividad)}
                className={`sticky left-0 z-10 border-b border-r border-border bg-card p-2 text-left align-top font-normal ${
                  editable ? 'cursor-pointer hover:bg-muted/50' : ''
                }`}
              >
                <div className="font-semibold text-foreground">{actividad.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {[
                    actividad.phase,
                    actividad.responsibleName,
                    ritmoEnPalabras(actividad.daysPerUnit),
                  ].filter(Boolean).join(' · ')}
                </div>
                {resumen.inicio ? (
                  <div className="text-[11px] text-muted-foreground">
                    {formatDate(resumen.inicio)} → {formatDate(resumen.termino!)}
                    {' · '}{resumen.duracionDias} días
                  </div>
                ) : (
                  <div className="text-[11px] text-warning">Sin fecha de inicio</div>
                )}
              </th>

              {columnas.map((u) => {
                const celda = celdas.get(u.id);
                if (!celda) {
                  // La actividad no recorre esta unidad (está limitada a otros
                  // grupos, o todavía no tiene inicio).
                  return (
                    <td key={u.id} className="border-b border-border bg-muted/10 p-1 text-center text-muted-foreground/40">
                      ·
                    </td>
                  );
                }
                const estado = estadoDeCelda(celda, hoy, workDays, calendario);
                return (
                  <td key={u.id}
                    title={`${actividad.name} · ${u.name}: ${formatDate(celda.inicio)}`}
                    className={`border-b border-border p-1 text-center tabular-nums ${COLOR_CELDA[estado]}`}>
                    {diaCorto(celda.inicio)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** `2026-09-14` → `14/09`. La celda es angosta: el año no cabe ni hace falta. */
function diaCorto(fecha: Date): string {
  const clave = claveDia(fecha);
  return clave ? `${clave.slice(8, 10)}/${clave.slice(5, 7)}` : '';
}

/* ── Crear o editar una actividad ─────────────────────────────────────── */

type ModoRitmo = 'por-dia' | 'dias-cu';

function DialogoActividad({ actividad, onCerrar, unidades, grupos, actividades }: {
  actividad?: TrainActivity;
  onCerrar: () => void;
  unidades: WorkUnit[];
  grupos: string[];
  actividades: TrainActivity[];
}) {
  const {
    addTrainActivity, updateTrainActivity, deleteTrainActivity, swapTrainActivityOrder,
    subcontracts, workItems, workCalendarExceptions, projects, currentProjectId,
  } = useAppState();
  const { toast } = useToast();

  const [nombre, setNombre] = useState(actividad?.name ?? '');
  const [fase, setFase] = useState(actividad?.phase ?? '');
  const [responsable, setResponsable] = useState(actividad?.responsibleName ?? '');
  const [subcontrato, setSubcontrato] = useState(actividad?.subcontractId ?? SIN_SUBCONTRATO);
  const [partida, setPartida] = useState(actividad?.workItemId ?? SIN_PARTIDA);
  const [inicio, setInicio] = useState(
    actividad?.startDate ? claveDia(actividad.startDate) : '',
  );
  const [grupo, setGrupo] = useState(actividad?.unitGroups?.[0] ?? TODOS);
  const [ocupado, setOcupado] = useState(false);

  /* El ritmo se guarda como días por unidad, pero se pregunta de las dos
     formas: en obra se dice "dos deptos por día" tanto como "dos días por
     depto", y obligar a traducirlo mentalmente es donde se cometen errores. */
  const [modo, setModo] = useState<ModoRitmo>(
    (actividad?.daysPerUnit ?? 1) < 1 ? 'por-dia' : 'dias-cu',
  );
  const [ritmo, setRitmo] = useState<number>(() => {
    const d = actividad?.daysPerUnit ?? 1;
    return d < 1 ? Math.round((1 / d) * 100) / 100 : d;
  });

  const daysPerUnit = modo === 'por-dia' ? (ritmo > 0 ? 1 / ritmo : 0) : ritmo;
  /* Envuelto en useMemo porque un array nuevo en cada render volvería a
     disparar el cálculo de validación y de unidades sin que nada haya cambiado. */
  const unitGroups = useMemo(
    () => (grupo === TODOS ? null : [grupo]),
    [grupo],
  );

  const obra = projects.find((p) => p.id === currentProjectId) ?? null;
  const calendario = useMemo(
    () => indexarExcepciones(workCalendarExceptions, currentProjectId),
    [workCalendarExceptions, currentProjectId],
  );

  const subcontratosObra = useMemo(
    () => subcontracts.filter((s) => s.projectId === currentProjectId),
    [subcontracts, currentProjectId],
  );

  const partidas = useMemo(
    () => getLeafItems(workItems.filter((w) => w.projectId === currentProjectId)),
    [workItems, currentProjectId],
  );

  const cuantasUnidades = useMemo(
    () => unidadesDeActividad({ unitGroups }, unidades).length,
    [unitGroups, unidades],
  );

  const mensajes = useMemo(
    () => validarActividad(
      { name: nombre, daysPerUnit, unitGroups, startDate: inicio || null },
      unidades, obra?.workDays, calendario,
    ),
    [nombre, daysPerUnit, unitGroups, inicio, unidades, obra?.workDays, calendario],
  );
  const errores = mensajes.filter((m) => !esSoloAviso(m));
  const avisos = mensajes.filter(esSoloAviso);

  /** Vecinas para el subir/bajar. */
  const vecinas = useMemo(() => {
    if (!actividad) return { anterior: null, siguiente: null };
    const i = actividades.findIndex((a) => a.id === actividad.id);
    return {
      anterior: i > 0 ? actividades[i - 1] : null,
      siguiente: i >= 0 && i < actividades.length - 1 ? actividades[i + 1] : null,
    };
  }, [actividades, actividad]);

  async function guardar() {
    setOcupado(true);
    try {
      const datos: Partial<TrainActivity> = {
        name: nombre.trim(),
        phase: fase.trim() || null,
        responsibleName: responsable.trim() || null,
        subcontractId: subcontrato === SIN_SUBCONTRATO ? null : subcontrato,
        workItemId: partida === SIN_PARTIDA ? null : partida,
        daysPerUnit: Math.round(daysPerUnit * 1000) / 1000,
        startDate: (inicio || null) as unknown as Date,
        unitGroups,
      };

      if (actividad) {
        await updateTrainActivity(actividad.id, datos);
      } else {
        const ultimo = actividades.length > 0
          ? Math.max(...actividades.map((a) => a.sortOrder)) + 1
          : 0;
        await addTrainActivity({ ...datos, sortOrder: ultimo });
      }
      onCerrar();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo guardar', description: e.message });
    } finally {
      setOcupado(false);
    }
  }

  async function mover(hacia: TrainActivity | null) {
    if (!actividad || !hacia) return;
    setOcupado(true);
    try {
      await swapTrainActivityOrder(
        { id: actividad.id, sortOrder: actividad.sortOrder },
        { id: hacia.id, sortOrder: hacia.sortOrder },
      );
      onCerrar();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo mover', description: e.message });
    } finally {
      setOcupado(false);
    }
  }

  async function borrar() {
    if (!actividad) return;
    setOcupado(true);
    try {
      await deleteTrainActivity(actividad.id);
      onCerrar();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo borrar', description: e.message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{actividad ? actividad.name : 'Nueva actividad'}</DialogTitle>
          <DialogDescription>
            Una fila del tren. Con el ritmo y la fecha de inicio, la app calcula
            qué día le toca a cada unidad.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ta-nombre">Actividad</Label>
              <Input id="ta-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Cerámica de piso" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ta-fase">Fase</Label>
              <Input id="ta-fase" value={fase} onChange={(e) => setFase(e.target.value)}
                placeholder="FASE I" />
            </div>
          </div>

          {/* Ritmo */}
          <div className="space-y-2">
            <Label>Ritmo de avance</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input type="number" step="0.5" min="0.1" className="w-28"
                value={ritmo}
                onChange={(e) => setRitmo(Number(e.target.value))} />
              <Select value={modo} onValueChange={(v) => setModo(v as ModoRitmo)}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="por-dia">unidades por día</SelectItem>
                  <SelectItem value="dias-cu">días en cada unidad</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Con este ritmo, las {cuantasUnidades} unidades se recorren en{' '}
              <strong>{Math.max(1, Math.ceil(cuantasUnidades * daysPerUnit))} días hábiles</strong>,
              saltando fines de semana y feriados.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ta-inicio">Empieza el</Label>
              <Input id="ta-inicio" type="date" value={inicio}
                onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Unidades que recorre</Label>
              <Select value={grupo} onValueChange={setGrupo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todas ({unidades.length})</SelectItem>
                  {grupos.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ta-responsable">Responsable</Label>
              <Input id="ta-responsable" value={responsable}
                onChange={(e) => setResponsable(e.target.value)} placeholder="Ej: PACAL" />
            </div>
            <div className="space-y-2">
              <Label>Subcontrato</Label>
              <Select value={subcontrato} onValueChange={setSubcontrato}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_SUBCONTRATO}>Sin subcontrato</SelectItem>
                  {subcontratosObra.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Partida de la EDT</Label>
            <Select value={partida} onValueChange={setPartida}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_PARTIDA}>Sin partida</SelectItem>
                {partidas.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Es lo que después deja que el parte diario mueva el avance físico de la obra.
            </p>
          </div>

          {avisos.map((m) => (
            <p key={m} className="text-sm text-warning">{m}</p>
          ))}
          {errores.map((m) => (
            <p key={m} className="text-sm text-danger">{m}</p>
          ))}

          {actividad && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <Button variant="outline" size="sm" disabled={ocupado || !vecinas.anterior}
                onClick={() => mover(vecinas.anterior)}>
                <ArrowUp className="mr-1 h-4 w-4" />Subir
              </Button>
              <Button variant="outline" size="sm" disabled={ocupado || !vecinas.siguiente}
                onClick={() => mover(vecinas.siguiente)}>
                <ArrowDown className="mr-1 h-4 w-4" />Bajar
              </Button>
              <Button variant="ghost" size="sm" className="text-danger"
                disabled={ocupado} onClick={borrar}>
                <Trash2 className="mr-1 h-4 w-4" />Borrar
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={ocupado || errores.length > 0 || !nombre.trim()}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Escalonar ────────────────────────────────────────────────────────── */

function DialogoEscalonar({ onCerrar, actividades, workDays, calendario }: {
  onCerrar: () => void;
  actividades: TrainActivity[];
  workDays: number[] | null;
  calendario: Map<string, 'feriado' | 'trabajado'>;
}) {
  const { applyTrainSchedule } = useAppState();
  const { toast } = useToast();

  const [desde, setDesde] = useState(() => claveDia(new Date()));
  const [desfase, setDesfase] = useState(2);
  const [ocupado, setOcupado] = useState(false);

  const cambios = useMemo(
    () => escalonarActividades(actividades, desde, desfase, workDays, calendario),
    [actividades, desde, desfase, workDays, calendario],
  );

  async function aplicar() {
    setOcupado(true);
    try {
      const cuantas = await applyTrainSchedule(cambios);
      toast({ title: `${cuantas} actividades reprogramadas` });
      onCerrar();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo aplicar', description: e.message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Escalonar el tren</DialogTitle>
          <DialogDescription>
            Le da a cada actividad una fecha de inicio corrida respecto de la
            anterior. Después cualquiera se puede corregir sola.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="esc-desde">La primera empieza el</Label>
              <Input id="esc-desde" type="date" value={desde}
                onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="esc-desfase">Días entre una y otra</Label>
              <Input id="esc-desfase" type="number" min="0" value={desfase}
                onChange={(e) => setDesfase(Number(e.target.value))} />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            {cambios.length === 0 ? (
              <span className="text-muted-foreground">
                Con esos valores no cambia ninguna fecha.
              </span>
            ) : (
              <>
                <div className="font-medium text-foreground">
                  Se van a mover {cambios.length} de {actividades.length} actividades
                </div>
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {cambios.slice(0, 4).map((c) => {
                    const a = actividades.find((x) => x.id === c.id);
                    return <li key={c.id}>{a?.name} → {formatDate(c.startDate)}</li>;
                  })}
                  {cambios.length > 4 && <li>… y {cambios.length - 4} más</li>}
                </ul>
              </>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            El desfase se cuenta en <strong>días hábiles</strong>: si cae fin de semana
            o feriado, la actividad parte el día hábil siguiente.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={aplicar} disabled={ocupado || cambios.length === 0}>
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
