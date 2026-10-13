"use client";

import { useMemo, useState } from 'react';
import {
  Building2, Plus, Wand2, ClipboardPaste, Trash2, ArrowUp, ArrowDown, EyeOff, Eye,
} from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { useToast } from '@/modules/core/hooks/use-toast';
import { PageHeader } from '@/components/page-header';
import { PlanLocked } from '@/components/plan-locked';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  generarUnidades, parsearUnidadesPegadas, unidadesDeObra, agruparUnidades,
  siguienteOrden, validarTanda,
  type UnidadNueva, type FormatoUnidad,
} from '@/lib/work-units';
import type { WorkUnit } from '@/modules/core/lib/data';
import { paletaDeTipologias } from '@/lib/planner-tones';
import { catFill, catRail, catText } from '@/components/operations/planner-tone-classes';
import { Metric, SectionLabel } from '@/components/operations/planner-ui';
import { cn } from '@/lib/utils';

const FORMATOS: Record<FormatoUnidad, string> = {
  'piso-numero': 'Número de piso + número (101, 312, 1615)',
  'correlativo': 'Correlativo corrido (1, 2, 3…)',
  'letra': 'Letra por grupo (3-A, 3-B, 3-C)',
};

/**
 * Unidades de obra: las columnas de la matriz del tren de actividades.
 *
 * Se muestran como fichas y no como tabla a propósito. Una obra son cientos de
 * unidades y lo que se hace con ellas en el día a día es mirarlas y tocar una;
 * una tabla de 240 filas con seis columnas no se lee en un teléfono, que es
 * donde va a estar el supervisor.
 */
export default function UnidadesPage() {
  const { workUnits, currentProjectId, can, lockedFeature } = useAppState();

  const [generando, setGenerando] = useState(false);
  const [pegando, setPegando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<WorkUnit | null>(null);

  const unidades = useMemo(
    () => unidadesDeObra(workUnits, currentProjectId),
    [workUnits, currentProjectId],
  );

  const grupos = useMemo(() => agruparUnidades(unidades), [unidades]);
  const excluidas = useMemo(() => unidades.filter((u) => u.status === 'excluida').length, [unidades]);

  /* Cada tipología tiene siempre el mismo color (por orden alfabético): así el piso se lee de un
     vistazo y la leyenda de arriba sirve de índice. */
  const paleta = useMemo(() => paletaDeTipologias(unidades.map((u) => u.typology)), [unidades]);
  const tipologias = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const u of unidades) {
      const t = u.typology?.trim();
      if (t) cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
    }
    return Array.from(paleta.entries()).map(([nombre, color]) => ({ nombre, color, cantidad: cuenta.get(nombre) ?? 0 }));
  }, [unidades, paleta]);

  const editable = can('planning:manage');

  const bloqueoDePlan = lockedFeature('planning:view');
  if (bloqueoDePlan) return <PlanLocked feature={bloqueoDePlan} title="Unidades de obra" />;

  if (!can('planning:view') && !editable) {
    return (
      <div className="space-y-6">
        <PageHeader title="Unidades de obra" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No tienes permiso para ver la programación de la obra.
        </CardContent></Card>
      </div>
    );
  }

  if (!currentProjectId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Unidades de obra" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Selecciona una obra para cargar sus unidades.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Configurar"
        title="Unidades de obra"
        description="Define dónde se ejecuta cada actividad: departamentos, pisos, sectores o frentes de trabajo. Estas unidades ordenan el tren y el parte diario."
        actions={editable ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPegando(true)}>
              <ClipboardPaste className="mr-2 h-4 w-4" />Pegar de Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCreando(true)}>
              <Plus className="mr-2 h-4 w-4" />Agregar una
            </Button>
            <Button size="sm" onClick={() => setGenerando(true)}>
              <Wand2 className="mr-2 h-4 w-4" />Generar
            </Button>
          </div>
        ) : undefined}
      />

      {unidades.length > 0 && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Unidades" value={unidades.length - excluidas} hint="activas en el tren" tone="info" />
            <Metric label="Grupos" value={grupos.length} hint={grupos.length === 1 ? 'un piso, torre o frente' : 'pisos, torres o frentes'} />
            <Metric label="Tipologías" value={tipologias.length} hint={tipologias.length ? 'distintas en la obra' : 'sin tipología cargada'} />
            <Metric label="Excluidas" value={excluidas} hint={excluidas > 0 ? 'fuera del tren y del parte' : 'todas participan del tren'} tone={excluidas > 0 ? 'warning' : 'neutral'} />
          </div>

          {tipologias.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card px-4 py-3">
              <span className="font-cifras text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Tipologías</span>
              {tipologias.map((t) => (
                <span key={t.nombre} className="inline-flex items-center gap-1.5 text-[13px]">
                  <i className={cn('h-2.5 w-2.5 rounded-full', catFill[t.color])} aria-hidden />
                  <span className={cn('font-medium', catText[t.color])}>{t.nombre}</span>
                  <span className="font-cifras text-[11px] text-muted-foreground">{t.cantidad}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {unidades.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 p-6 text-sm text-muted-foreground">
            <Building2 className="h-6 w-6 text-muted-foreground" />
            <p className="font-medium text-foreground">Esta obra todavía no tiene unidades.</p>
            <p>
              Si es un edificio, <strong>Generar</strong> las crea todas de una vez
              («16 pisos × 15 departamentos»). Si ya las tienes en una planilla,
              <strong> Pegar de Excel</strong> las toma de ahí tal como están.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grupos.map((grupo) => (
            <section key={grupo.groupName} aria-label={grupo.groupName}>
              <SectionLabel aside={`${grupo.unidades.length} ${grupo.unidades.length === 1 ? 'unidad' : 'unidades'}`}>
                {grupo.groupName}
              </SectionLabel>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10">
                {grupo.unidades.map((u) => {
                  const excluida = u.status === 'excluida';
                  const color = u.typology ? paleta.get(u.typology.trim()) : undefined;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => editable && setEditando(u)}
                      disabled={!editable}
                      className={cn(
                        'relative overflow-hidden rounded-lg border p-2.5 pl-3.5 text-left transition-colors before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full',
                        excluida
                          ? 'border-dashed border-border bg-card text-muted-foreground before:bg-warning'
                          : cn('border-border bg-card text-foreground hover:border-primary/50', color !== undefined ? catRail[color] : 'before:bg-border'),
                        editable ? 'cursor-pointer' : 'cursor-default',
                      )}
                    >
                      <div className={cn('truncate font-cifras text-sm font-semibold', excluida && 'line-through decoration-muted-foreground/60')}>{u.name}</div>
                      <div className="mt-0.5 truncate text-[11px]">
                        {u.typology
                          ? <span className={cn('font-medium', color !== undefined ? catText[color] : 'text-muted-foreground')}>{u.typology}</span>
                          : <span className="text-muted-foreground">{u.area ? `${u.area} m²` : '—'}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {generando && <DialogoGenerar onCerrar={() => setGenerando(false)} existentes={unidades} />}
      {pegando && <DialogoPegar onCerrar={() => setPegando(false)} existentes={unidades} />}
      {creando && <DialogoUnidad onCerrar={() => setCreando(false)} existentes={unidades} />}
      {editando && (
        <DialogoUnidad
          unidad={editando}
          existentes={unidades}
          onCerrar={() => setEditando(null)}
        />
      )}
    </div>
  );
}

/* ── Generar por patrón ───────────────────────────────────────────────── */

function DialogoGenerar({ onCerrar, existentes }: {
  onCerrar: () => void;
  existentes: WorkUnit[];
}) {
  const { addWorkUnits } = useAppState();
  const { toast } = useToast();

  const [etiqueta, setEtiqueta] = useState('PISO');
  const [desde, setDesde] = useState(1);
  const [hasta, setHasta] = useState(16);
  const [porGrupo, setPorGrupo] = useState(15);
  const [formato, setFormato] = useState<FormatoUnidad>('piso-numero');
  const [desdeNumero, setDesdeNumero] = useState(1);
  const [extras, setExtras] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const previsualizacion = useMemo(() => generarUnidades({
    grupoEtiqueta: etiqueta,
    grupoDesde: desde,
    grupoHasta: hasta,
    unidadesPorGrupo: porGrupo,
    formato,
    desdeNumero,
    extras: extras.split(',').map((e) => e.trim()).filter(Boolean),
  }), [etiqueta, desde, hasta, porGrupo, formato, desdeNumero, extras]);

  const errores = useMemo(
    () => (previsualizacion.length > 0 ? validarTanda(previsualizacion, existentes) : []),
    [previsualizacion, existentes],
  );

  async function guardar() {
    setOcupado(true);
    try {
      const cuantas = await addWorkUnits(previsualizacion, siguienteOrden(existentes));
      toast({ title: `${cuantas} unidades creadas` });
      onCerrar();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo generar', description: e.message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generar unidades</DialogTitle>
          <DialogDescription>
            Crea todas las unidades de una vez a partir del patrón del edificio.
            Después se pueden editar una por una.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="gen-etiqueta">Grupo</Label>
              <Input id="gen-etiqueta" value={etiqueta}
                onChange={(e) => setEtiqueta(e.target.value)} placeholder="PISO" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gen-desde">Desde</Label>
              <Input id="gen-desde" type="number" value={desde}
                onChange={(e) => setDesde(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gen-hasta">Hasta</Label>
              <Input id="gen-hasta" type="number" value={hasta}
                onChange={(e) => setHasta(Number(e.target.value))} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="gen-por-grupo">Unidades por grupo</Label>
              <Input id="gen-por-grupo" type="number" value={porGrupo}
                onChange={(e) => setPorGrupo(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gen-desde-numero">Primer número</Label>
              <Input id="gen-desde-numero" type="number" value={desdeNumero}
                onChange={(e) => setDesdeNumero(Number(e.target.value))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Cómo se numeran</Label>
            <Select value={formato} onValueChange={(v) => setFormato(v as FormatoUnidad)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(FORMATOS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gen-extras">Unidades extra en cada grupo</Label>
            <Input id="gen-extras" value={extras} onChange={(e) => setExtras(e.target.value)}
              placeholder="PASILLO, ESCALA" />
            <p className="text-xs text-muted-foreground">
              Separadas por coma. Van al final del grupo, después de los departamentos.
            </p>
          </div>

          {/* La previsualización es lo que evita crear 240 unidades mal
              numeradas y tener que borrarlas todas. */}
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            {previsualizacion.length === 0 ? (
              <span className="text-muted-foreground">
                Revisa los números: con esos valores no se crea ninguna unidad.
              </span>
            ) : (
              <>
                <div className="font-medium text-foreground">
                  Se van a crear {previsualizacion.length} unidades
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {previsualizacion.slice(0, 6).map((u) => u.name).join(', ')}
                  {previsualizacion.length > 6 && ` … ${previsualizacion[previsualizacion.length - 1].name}`}
                </div>
              </>
            )}
          </div>

          {errores.map((e) => (
            <p key={e} className="text-sm text-danger">{e}</p>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button
            onClick={guardar}
            disabled={ocupado || previsualizacion.length === 0 || errores.length > 0}
          >
            Crear {previsualizacion.length > 0 ? previsualizacion.length : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Pegar desde Excel ────────────────────────────────────────────────── */

function DialogoPegar({ onCerrar, existentes }: {
  onCerrar: () => void;
  existentes: WorkUnit[];
}) {
  const { addWorkUnits } = useAppState();
  const { toast } = useToast();

  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const parseadas = useMemo(() => parsearUnidadesPegadas(texto), [texto]);
  const errores = useMemo(
    () => (parseadas.length > 0 ? validarTanda(parseadas, existentes) : []),
    [parseadas, existentes],
  );

  async function guardar() {
    setOcupado(true);
    try {
      const cuantas = await addWorkUnits(parseadas, siguienteOrden(existentes));
      toast({ title: `${cuantas} unidades cargadas` });
      onCerrar();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo cargar', description: e.message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pegar unidades desde Excel</DialogTitle>
          <DialogDescription>
            Copia las celdas en la planilla y pégalas acá. Una unidad por línea.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pegar-texto">Unidades</Label>
            <Textarea
              id="pegar-texto"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={10}
              className="font-mono text-xs"
              placeholder={'112\tPISO 1\tSM3b\t42,5\n113\tPISO 1\tSM3a\t38\n114\tPISO 1\tFV\t51,2'}
            />
            <p className="text-xs text-muted-foreground">
              Las columnas son <strong>nombre · grupo · tipología · superficie</strong>,
              en ese orden. Solo el nombre es obligatorio; el resto se puede dejar vacío.
            </p>
          </div>

          {texto.trim() && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              {parseadas.length === 0 ? (
                <span className="text-muted-foreground">No se reconoció ninguna unidad.</span>
              ) : (
                <>
                  <div className="font-medium text-foreground">
                    Se reconocieron {parseadas.length} unidades
                  </div>
                  <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {parseadas.slice(0, 3).map((u, i) => (
                      <div key={i}>
                        <strong className="text-foreground">{u.name}</strong>
                        {u.groupName ? ` · ${u.groupName}` : ''}
                        {u.typology ? ` · ${u.typology}` : ''}
                        {u.area != null ? ` · ${u.area} m²` : ''}
                      </div>
                    ))}
                    {parseadas.length > 3 && <div>…</div>}
                  </div>
                </>
              )}
            </div>
          )}

          {errores.map((e) => (
            <p key={e} className="text-sm text-danger">{e}</p>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button
            onClick={guardar}
            disabled={ocupado || parseadas.length === 0 || errores.length > 0}
          >
            Cargar {parseadas.length > 0 ? parseadas.length : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Crear o editar una unidad suelta ─────────────────────────────────── */

function DialogoUnidad({ unidad, onCerrar, existentes }: {
  unidad?: WorkUnit;
  onCerrar: () => void;
  existentes: WorkUnit[];
}) {
  const {
    addWorkUnits, updateWorkUnit, deleteWorkUnit, swapWorkUnitOrder,
  } = useAppState();
  const { toast } = useToast();

  const [nombre, setNombre] = useState(unidad?.name ?? '');
  const [grupo, setGrupo] = useState(unidad?.groupName ?? '');
  const [tipologia, setTipologia] = useState(unidad?.typology ?? '');
  const [area, setArea] = useState<number | ''>(unidad?.area ?? '');
  const [ocupado, setOcupado] = useState(false);

  /** Vecinas dentro del mismo grupo: es ahí donde tiene sentido reordenar. */
  const vecinas = useMemo(() => {
    if (!unidad) return { anterior: null, siguiente: null };
    const delGrupo = existentes.filter(
      (u) => (u.groupName ?? '') === (unidad.groupName ?? ''),
    );
    const i = delGrupo.findIndex((u) => u.id === unidad.id);
    return {
      anterior: i > 0 ? delGrupo[i - 1] : null,
      siguiente: i >= 0 && i < delGrupo.length - 1 ? delGrupo[i + 1] : null,
    };
  }, [existentes, unidad]);

  async function guardar() {
    setOcupado(true);
    try {
      const datos: UnidadNueva = {
        name: nombre.trim(),
        groupName: grupo.trim() || null,
        typology: tipologia.trim() || null,
        area: area === '' ? null : Number(area),
        sortOrder: unidad?.sortOrder ?? 0,
      };
      if (!datos.name) throw new Error('La unidad necesita un nombre.');

      if (unidad) {
        await updateWorkUnit(unidad.id, {
          name: datos.name,
          groupName: datos.groupName,
          typology: datos.typology,
          area: datos.area,
        });
      } else {
        const errores = validarTanda([datos], existentes);
        if (errores.length > 0) throw new Error(errores[0]);
        await addWorkUnits([datos], siguienteOrden(existentes));
      }
      onCerrar();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo guardar', description: e.message });
    } finally {
      setOcupado(false);
    }
  }

  async function alternarEstado() {
    if (!unidad) return;
    setOcupado(true);
    try {
      await updateWorkUnit(unidad.id, {
        status: unidad.status === 'activa' ? 'excluida' : 'activa',
      });
      onCerrar();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo cambiar', description: e.message });
    } finally {
      setOcupado(false);
    }
  }

  async function mover(hacia: WorkUnit | null) {
    if (!unidad || !hacia) return;
    setOcupado(true);
    try {
      await swapWorkUnitOrder(
        { id: unidad.id, sortOrder: unidad.sortOrder },
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
    if (!unidad) return;
    setOcupado(true);
    try {
      await deleteWorkUnit(unidad.id);
      onCerrar();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo borrar', description: e.message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{unidad ? `Unidad ${unidad.name}` : 'Agregar unidad'}</DialogTitle>
          <DialogDescription>
            El nombre es el que va a elegir el supervisor al reportar su avance.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="u-nombre">Nombre</Label>
              <Input id="u-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)}
                placeholder="312" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-grupo">Grupo</Label>
              <Input id="u-grupo" value={grupo} onChange={(e) => setGrupo(e.target.value)}
                placeholder="PISO 3" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="u-tipologia">Tipología</Label>
              <Input id="u-tipologia" value={tipologia}
                onChange={(e) => setTipologia(e.target.value)} placeholder="SM3b" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-area">Superficie (m²)</Label>
              <Input id="u-area" type="number" step="0.01" value={area}
                onChange={(e) => setArea(e.target.value === '' ? '' : Number(e.target.value))} />
            </div>
          </div>

          {unidad && (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" disabled={ocupado || !vecinas.anterior}
                  onClick={() => mover(vecinas.anterior)}>
                  <ArrowUp className="mr-1 h-4 w-4" />Antes
                </Button>
                <Button variant="outline" size="sm" disabled={ocupado || !vecinas.siguiente}
                  onClick={() => mover(vecinas.siguiente)}>
                  <ArrowDown className="mr-1 h-4 w-4" />Después
                </Button>
                <Button variant="outline" size="sm" disabled={ocupado} onClick={alternarEstado}>
                  {unidad.status === 'activa'
                    ? <><EyeOff className="mr-1 h-4 w-4" />Excluir del tren</>
                    : <><Eye className="mr-1 h-4 w-4" />Volver a incluir</>}
                </Button>
                <Button variant="ghost" size="sm" className="text-danger"
                  disabled={ocupado} onClick={borrar}>
                  <Trash2 className="mr-1 h-4 w-4" />Borrar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                <strong>Excluir</strong> la deja fuera del tren y del parte diario sin
                perder lo ya reportado. <strong>Borrar</strong> la elimina para siempre.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={ocupado || !nombre.trim()}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
