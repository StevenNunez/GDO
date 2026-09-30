"use client";

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, ChevronRight, ChevronDown, Link2, Check,
  AlertTriangle, ClipboardList, Loader2, FileDown, NotebookPen,
} from 'lucide-react';
import { useAppState, useAuth } from '@/modules/core/contexts/app-provider';
import { useToast } from '@/modules/core/hooks/use-toast';
import { PageHeader } from '@/components/page-header';
import { PlanLocked } from '@/components/plan-locked';
import { Card, CardContent } from '@/components/ui/card';
import { SurfaceCard } from '@/components/ui/surface-card';
import { FilterChips } from '@/components/ui/filter-chips';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatDate, addCalendarDays, toCalendarDay } from '@/lib/date-utils';
import { unidadesActivas } from '@/lib/work-units';
import { unidadesDeObra } from '@/lib/work-units';
import { indexarExcepciones, claveDia, esDiaHabil } from '@/lib/work-calendar';
import { actividadesDeObra } from '@/lib/train';
import { CAUSAS_CNC } from '@/lib/last-planner';
import {
  ESCALA_AVANCE, ETIQUETA_AVANCE, comoPorcentaje, avanceVigente,
  progresosDeObra, progresosDelDia, actividadesDeHoy, resumenDelDia,
  validarParte, esAviso, incrementoDelDia,
  type PendienteDeReporte,
} from '@/lib/daily-report';
import { generateParteDiarioPDF } from '@/lib/parte-diario-pdf-generator';
import { TraspasoDelDia } from '@/components/operations/traspaso-del-dia';
import { uploadObraFile } from '@/lib/storage';
import type { TrainActivity, NonComplianceCause } from '@/modules/core/lib/data';

const SIN_CAUSA = '__sin_causa__';

/* Valores reservados de los chips: no chocan con un nombre de grupo real
   porque ningún piso se llama así. */
const TODAS = '__todas__';
const ATRASADAS = '__atrasadas__';

/**
 * Parte diario: lo que pasó hoy en la obra, cargado desde el teléfono.
 *
 * Está hecha mobile-first de verdad, no "que no se rompa en móvil": el que la
 * usa está parado en un piso, con una mano, con casco. Por eso los avances son
 * seis botones grandes y no un deslizador, y por eso marcar un avance guarda
 * de inmediato sin abrir nada.
 *
 * El diálogo solo aparece cuando hace falta: cuando la unidad NO avanzó y hay
 * que decir por qué. Esa causa es el único dato que después permite dejar de
 * tropezar con lo mismo.
 */
export default function ParteDiarioPage() {
  const {
    trainActivities, workUnits, workCalendarExceptions, dailyProgress,
    projects, currentProjectId, can, lockedFeature, notify,
  } = useAppState();
  const { user, getTenantId } = useAuth();

  const [offset, setOffset] = useState(0);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<
    { actividad: TrainActivity; pendiente: PendienteDeReporte; progreso: number } | null
  >(null);
  const [enlace, setEnlace] = useState<TrainActivity | null>(null);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [traspasando, setTraspasando] = useState(false);
  const [filtro, setFiltro] = useState<string>(TODAS);

  const fecha = useMemo(() => {
    const hoy = toCalendarDay(new Date())!;
    return addCalendarDays(hoy, offset);
  }, [offset]);
  const claveFecha = claveDia(fecha);

  const obra = useMemo(
    () => projects.find((p) => p.id === currentProjectId) ?? null,
    [projects, currentProjectId],
  );

  const unidades = useMemo(
    () => unidadesActivas(unidadesDeObra(workUnits, currentProjectId)),
    [workUnits, currentProjectId],
  );

  const calendario = useMemo(
    () => indexarExcepciones(workCalendarExceptions, currentProjectId),
    [workCalendarExceptions, currentProjectId],
  );

  const progresos = useMemo(
    () => progresosDeObra(dailyProgress, currentProjectId),
    [dailyProgress, currentProjectId],
  );

  // A historical report must show what was known that day, not today's progress.
  const vigentes = useMemo(() => avanceVigente(progresos.filter(p => claveDia(p.date) <= claveFecha)), [progresos, claveFecha]);

  const actividades = useMemo(
    () => actividadesDeObra(trainActivities, currentProjectId),
    [trainActivities, currentProjectId],
  );

  /**
   * El subcontratista ve solo lo suyo. Se compara contra el responsable de la
   * actividad, que es texto libre: es lo que hay hasta que el subcontrato esté
   * cargado, y es lo que el jefe de terreno escribe igual.
   */
  const soloDe = user?.role === 'subcontratista' ? (user?.name ?? null) : null;

  const pendientes = useMemo(
    () => actividadesDeHoy(
      actividades, unidades, vigentes, progresos, fecha, obra?.workDays, calendario, soloDe,
    ),
    [actividades, unidades, vigentes, progresos, fecha, obra?.workDays, calendario, soloDe],
  );

  const resumen = useMemo(
    () => resumenDelDia(progresos, fecha, CAUSAS_CNC),
    [progresos, fecha],
  );

  const esHabil = esDiaHabil(fecha, obra?.workDays, calendario);

  /**
   * El resumen del día en PDF: lo que se lleva a la reunión de la mañana.
   * Se descarga cuando alguien lo necesita — no hay correo automático.
   */
  async function descargarPdf() {
    const tenantId = getTenantId();
    if (!tenantId) return;
    setGenerandoPdf(true);
    try {
      const delDia = progresosDelDia(progresos, fecha);
      const porActividad = new Map(actividades.map((a) => [a.id, a]));
      const porUnidad = new Map(unidades.map((u) => [u.id, u]));

      await generateParteDiarioPDF({
        tenantId,
        fecha,
        projectName: obra?.name ?? null,
        resumen,
        lineas: delDia
          .map((parteDelDia) => {
            const act = porActividad.get(parteDelDia.activityId);
            if (!act) return null;
            return {
              actividad: act,
              unidad: parteDelDia.unitId ? porUnidad.get(parteDelDia.unitId) ?? null : null,
              parte: parteDelDia,
              incremento: incrementoDelDia(parteDelDia, progresos),
            };
          })
          .filter((l): l is NonNullable<typeof l> => l !== null),
      });
    } catch (e: any) {
      notify(`No se pudo generar el PDF: ${e.message}`, 'destructive');
    } finally {
      setGenerandoPdf(false);
    }
  }
  /* Chips de filtro por grupo (piso, torre, frente). Con 56 deptos, encontrar
     el tuyo sin filtro es rendirse antes de empezar. */
  const chips = useMemo(() => {
    const cuenta = new Map<string, number>();
    let atrasadas = 0;
    let total = 0;
    for (const { pendientes: ps } of pendientes) {
      for (const p of ps) {
        total++;
        if (p.atrasada) atrasadas++;
        const g = p.unidad.groupName?.trim() || 'Sin grupo';
        cuenta.set(g, (cuenta.get(g) ?? 0) + 1);
      }
    }
    const lista: { value: string; label: string; count: number; tone?: 'danger' }[] = [
      { value: TODAS, label: 'Todas', count: total },
    ];
    if (atrasadas > 0) {
      lista.push({ value: ATRASADAS, label: 'Atrasadas', count: atrasadas, tone: 'danger' });
    }
    for (const [g, n] of Array.from(cuenta).sort((a, b) => a[0].localeCompare(b[0], 'es'))) {
      lista.push({ value: g, label: g, count: n });
    }
    return lista;
  }, [pendientes]);

  /** Las actividades ya filtradas, sin las que se quedaron sin unidades. */
  const visibles = useMemo(() => {
    if (filtro === TODAS) return pendientes;
    return pendientes
      .map(({ actividad, pendientes: ps }) => ({
        actividad,
        pendientes: ps.filter((p) => (
          filtro === ATRASADAS
            ? p.atrasada
            : (p.unidad.groupName?.trim() || 'Sin grupo') === filtro
        )),
      }))
      .filter((x) => x.pendientes.length > 0);
  }, [pendientes, filtro]);

  /* Cuánto del día va cargado: es el único número que el supervisor mira
     antes de guardar el teléfono. */
  const avanceDelDia = useMemo(() => {
    let total = 0;
    let hechas = 0;
    for (const { pendientes: ps } of visibles) {
      for (const p of ps) {
        total++;
        if (p.reportadaHoy) hechas++;
      }
    }
    return { total, hechas, porcentaje: total > 0 ? (hechas / total) * 100 : 0 };
  }, [visibles]);

  const puedeReportar = can('daily_report:submit') || can('planning:manage');

  /* El subcontratista invitado reporta en la obra de OTRA empresa: bloquearlo
     por SU plan sería cobrarle la suscripción del que lo contrató. Mismo
     criterio que el portal de estados de pago. */
  const esInvitado = user?.role === 'subcontratista';
  const bloqueoDePlan = esInvitado ? null : lockedFeature('planning:view');
  if (bloqueoDePlan) return <PlanLocked feature={bloqueoDePlan} title="Parte diario" />;

  if (!puedeReportar && !can('planning:view')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Parte diario" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No tienes permiso para cargar el parte diario.
        </CardContent></Card>
      </div>
    );
  }

  if (!currentProjectId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Parte diario" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Selecciona una obra para cargar su parte.
        </CardContent></Card>
      </div>
    );
  }

  /* La primera actividad viene abierta: obligar a un toque extra antes de
     poder reportar nada es exactamente la fricción que hace que el parte no se
     cargue. Cadena vacía = el usuario las cerró todas a propósito. */
  const idAbierta = abierta === null ? (visibles[0]?.actividad.id ?? null) : (abierta || null);

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        kicker="Terreno"
        title="Parte diario"
        description="Registra el avance real por unidad de trabajo. Si una actividad no avanzó, indica la causa para revisarla en la planificación semanal."
        actions={
          <div className="flex flex-wrap items-center gap-1">
            <Button variant="outline" size="sm" className="mr-1"
              disabled={resumen.reportes === 0} onClick={() => setTraspasando(true)}>
              <NotebookPen className="mr-2 h-4 w-4" />
              Traspasar el día
            </Button>
            <Button variant="outline" size="sm" className="mr-1"
              disabled={generandoPdf || resumen.reportes === 0} onClick={descargarPdf}>
              {generandoPdf
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <FileDown className="mr-2 h-4 w-4" />}
              PDF del día
            </Button>
            <Button variant="outline" size="icon" onClick={() => setOffset((o) => o - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[9rem] text-center">
              <div className="text-sm font-semibold text-foreground">
                {offset === 0 ? 'Hoy' : formatDate(fecha)}
              </div>
              <div className="text-xs text-muted-foreground">
                {offset === 0 ? formatDate(fecha) : ''}
              </div>
            </div>
            {/* No se reporta el futuro: un parte de mañana no existe. */}
            <Button variant="outline" size="icon" disabled={offset >= 0}
              onClick={() => setOffset((o) => Math.min(0, o + 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {/* ── Cómo va el día ─────────────────────────────────────────────── */}
      <SurfaceCard interactive={false}>
        <div className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {esHabil ? 'Jornada de trabajo' : 'Día no laboral'}
              </div>
              <div className="mt-1 text-3xl font-bold tracking-tighter text-foreground">
                {avanceDelDia.hechas}
                <span className="text-xl font-semibold text-muted-foreground">
                  {' '}de {avanceDelDia.total}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {avanceDelDia.total === 0
                  ? 'Sin unidades pendientes para este día.'
                  : avanceDelDia.hechas === avanceDelDia.total
                    ? 'Todos los avances del día están registrados.'
                    : `Faltan ${avanceDelDia.total - avanceDelDia.hechas} ${avanceDelDia.total - avanceDelDia.hechas === 1 ? 'unidad' : 'unidades'} por reportar.`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Dato label="Terminadas" valor={`${resumen.terminadas}`} />
              <Dato label="Jornadas" valor={resumen.jornadas > 0 ? `${resumen.jornadas}` : '—'} />
              <Dato
                label="Sin avance"
                valor={`${resumen.sinAvance}`}
                nota={resumen.causas[0]?.label}
                tono={resumen.sinAvance > 0 ? 'warning' : undefined}
              />
            </div>
          </div>

          {/* La barra del día: de un vistazo, cuánto falta. */}
          {avanceDelDia.total > 0 && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${avanceDelDia.porcentaje}%` }}
              />
            </div>
          )}

          {!esHabil && (
            <div className="flex items-start gap-2 rounded-xl bg-warning-subtle p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span className="text-foreground">
                Según el calendario de la obra este día no se trabaja. Puedes cargar el
                parte igual si se trabajó.
              </span>
            </div>
          )}
        </div>
      </SurfaceCard>

      {/* ── Filtros ────────────────────────────────────────────────────── */}
      <FilterChips options={chips} value={filtro} onChange={setFiltro} />

      {/* ── Las actividades ────────────────────────────────────────────── */}
      {visibles.length === 0 ? (
        <SurfaceCard interactive={false}>
          <div className="space-y-3 p-8 text-center text-sm text-muted-foreground">
            <ClipboardList className="mx-auto h-8 w-8 opacity-40" />
            <p className="text-base font-semibold text-foreground">
              {actividades.length === 0
                ? 'La obra todavía no tiene tren de actividades.'
                : filtro !== TODAS
                  ? 'Nada pendiente con ese filtro.'
                  : 'No hay nada pendiente de reportar para este día.'}
            </p>
            {actividades.length === 0 ? (
              <>
                <p className="mx-auto max-w-md">
                  El parte diario sale del tren: son las actividades programadas las
                  que le preguntan al supervisor qué avanzó.
                </p>
                <Button asChild size="sm">
                  <Link href="/dashboard/last-planner/tren">Ir al tren de actividades</Link>
                </Button>
              </>
            ) : filtro !== TODAS ? (
              <Button variant="outline" size="sm" onClick={() => setFiltro(TODAS)}>
                Ver todas
              </Button>
            ) : (
              <p className="mx-auto max-w-md">
                O ya está todo cargado, o al tren no le tocaba ninguna unidad hasta
                este día.
              </p>
            )}
          </div>
        </SurfaceCard>
      ) : (
        <div className="space-y-4">
          {visibles.map(({ actividad, pendientes: unidadesPendientes }) => (
            <TarjetaActividad
              key={actividad.id}
              actividad={actividad}
              pendientes={unidadesPendientes}
              abierta={idAbierta === actividad.id}
              onAlternar={() => setAbierta((a) => {
                const actual = a === null ? (visibles[0]?.actividad.id ?? null) : (a || null);
                return actual === actividad.id ? '' : actividad.id;
              })}
              fecha={claveFecha}
              progresosDelDia={progresosDelDia(progresos, fecha)}
              editable={puedeReportar}
              puedeCompartir={can('planning:manage') && claveFecha === claveDia(new Date())}
              onDetalle={(pendiente, progreso) =>
                setDetalle({ actividad, pendiente, progreso })}
              onEnlace={() => setEnlace(actividad)}
            />
          ))}
        </div>
      )}

      {detalle && (
        <DialogoParte
          actividad={detalle.actividad}
          pendiente={detalle.pendiente}
          progresoInicial={detalle.progreso}
          fecha={claveFecha}
          onCerrar={() => setDetalle(null)}
        />
      )}
      {enlace && (
        <DialogoEnlace actividad={enlace} fecha={claveFecha} onCerrar={() => setEnlace(null)} />
      )}
      {traspasando && (
        <TraspasoDelDia
          fecha={fecha}
          actividades={actividades}
          unidades={unidades}
          progresos={progresos}
          onCerrar={() => setTraspasando(false)}
        />
      )}
    </div>
  );
}

/** Un número suelto del encabezado, con su etiqueta chica arriba. */
function Dato({ label, valor, nota, tono }: {
  label: string; valor: string; nota?: string; tono?: 'warning';
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className={`text-xl font-bold tabular-nums ${
        tono === 'warning' ? 'text-warning' : 'text-foreground'
      }`}>
        {valor}
      </div>
      {nota && <p className="truncate text-[11px] text-muted-foreground">{nota}</p>}
    </div>
  );
}

/* ── Tarjeta de una actividad ─────────────────────────────────────────── */

function TarjetaActividad({
  actividad, pendientes, abierta, onAlternar, fecha, progresosDelDia: delDia,
  editable, puedeCompartir, onDetalle, onEnlace,
}: {
  actividad: TrainActivity;
  pendientes: PendienteDeReporte[];
  abierta: boolean;
  onAlternar: () => void;
  fecha: string;
  progresosDelDia: ReturnType<typeof progresosDelDia>;
  editable: boolean;
  puedeCompartir: boolean;
  onDetalle: (p: PendienteDeReporte, progreso: number) => void;
  onEnlace: () => void;
}) {
  const { saveDailyProgress } = useAppState();
  const { toast } = useToast();
  const [guardando, setGuardando] = useState<string | null>(null);

  const atrasadas = pendientes.filter((p) => p.atrasada).length;
  const reportadas = pendientes.filter((p) => p.reportadaHoy).length;
  const jornadasHoy = delDia
    .filter((p) => p.activityId === actividad.id)
    .reduce((t, p) => t + (p.crewDays ?? 0), 0);

  /**
   * El camino rápido: tocar un avance MAYOR al que había guarda al tiro.
   *
   * Si no es mayor, no se guarda nada acá: se abre el diálogo, porque la app
   * necesita la causa. Un parte de "sigue en 50%" sin causa es el dato que no
   * sirve para nada.
   */
  async function marcar(p: PendienteDeReporte, valor: number) {
    if (!editable) return;
    if (valor <= p.avance) {
      onDetalle(p, valor);
      return;
    }
    setGuardando(p.unidad.id);
    try {
      const existing = delDia.find(report => report.activityId === actividad.id && report.unitId === p.unidad.id);
      await saveDailyProgress({
        activityId: actividad.id,
        unitId: p.unidad.id,
        date: fecha,
        progress: valor,
        crewDays: existing?.crewDays,
        quantity: existing?.quantity,
        notes: existing?.notes,
        photoPath: existing?.photoPath,
      });
      toast({ title: `${p.unidad.name} · ${comoPorcentaje(valor)}%` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo guardar', description: e.message });
    } finally {
      setGuardando(null);
    }
  }

  return (
    <SurfaceCard interactive={false}>
      <button
        type="button"
        onClick={onAlternar}
        className="flex w-full items-center justify-between gap-3 p-5 text-left transition-colors hover:bg-muted/40"
      >
        <div className="min-w-0">
          {actividad.phase && (
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {actividad.phase}
            </div>
          )}
          <div className="mt-0.5 truncate text-lg font-bold tracking-tight text-foreground">
            {actividad.name}
          </div>
          <div className="mt-0.5 truncate text-sm text-muted-foreground">
            {actividad.responsibleName ?? 'Sin responsable'}
            {' · '}
            {reportadas > 0
              ? `${reportadas} de ${pendientes.length} reportadas`
              : `${pendientes.length} por reportar`}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {atrasadas > 0 && <StatusBadge tone="danger">{atrasadas} atrasada(s)</StatusBadge>}
          <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${
            abierta ? 'rotate-180' : ''
          }`} />
        </div>
      </button>

      {abierta && (
        <div className="space-y-3 border-t border-border bg-muted/20 p-4 sm:p-5">
          {jornadasHoy > 0 && (
            <p className="text-xs text-muted-foreground">
              {jornadasHoy} jornada(s) cargadas hoy en esta actividad.
            </p>
          )}

          {pendientes.map((p) => (
            <div
              key={p.unidad.id}
              className={`space-y-3 rounded-2xl border bg-card p-4 transition-colors ${
                p.atrasada ? 'border-danger/30' : 'border-border'
              }`}
            >
              {/* Cabecera de la unidad: el depto primero, grande */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {p.unidad.groupName && (
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {p.unidad.groupName}
                    </div>
                  )}
                  <div className="text-xl font-bold tracking-tight text-foreground">
                    {p.unidad.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    va en {comoPorcentaje(p.avance)}%
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {p.reportadaHoy
                    ? <StatusBadge tone="success" icon={Check}>Reportada</StatusBadge>
                    : p.atrasada
                      ? <StatusBadge tone="danger">Atrasada</StatusBadge>
                      : <StatusBadge tone="neutral">Pendiente</StatusBadge>}
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                    onClick={() => onDetalle(p, p.avance)}>
                    Detalle
                  </Button>
                </div>
              </div>

              {/* Seis botones grandes: se tocan con una mano y sin mirar.
                  Alto fijo de 3,5rem para que el pulgar no falle con guantes. */}
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {ESCALA_AVANCE.map((valor) => {
                  const activo = Math.abs(p.avance - valor) < 0.001;
                  return (
                    <button
                      key={valor}
                      type="button"
                      disabled={!editable || guardando === p.unidad.id}
                      onClick={() => marcar(p, valor)}
                      className={`flex h-14 flex-col items-center justify-center rounded-xl border px-1 text-center transition-all active:scale-95 ${
                        activo
                          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                          : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground'
                      } disabled:opacity-50`}
                    >
                      <span className="text-base font-bold tabular-nums leading-none">
                        {comoPorcentaje(valor)}%
                      </span>
                      <span className="mt-1 truncate text-[10px] leading-tight opacity-80">
                        {ETIQUETA_AVANCE[valor]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {puedeCompartir && (
            <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={onEnlace}>
              <Link2 className="mr-2 h-4 w-4" />
              Enlace para el capataz
            </Button>
          )}
        </div>
      )}
    </SurfaceCard>
  );
}

/* ── Diálogo de detalle ───────────────────────────────────────────────── */

function DialogoParte({ actividad, pendiente, progresoInicial, fecha, onCerrar }: {
  actividad: TrainActivity;
  pendiente: PendienteDeReporte;
  progresoInicial: number;
  fecha: string;
  onCerrar: () => void;
}) {
  const { saveDailyProgress, currentProjectId, dailyProgress } = useAppState();
  const { getTenantId } = useAuth();
  const { toast } = useToast();

  const [progreso, setProgreso] = useState(progresoInicial);
  const existing = dailyProgress.find(p => p.activityId === actividad.id && p.unitId === pendiente.unidad.id && claveDia(p.date) === fecha);
  const [jornadas, setJornadas] = useState<number | ''>(existing?.crewDays ?? '');
  const [causa, setCausa] = useState<string>(existing?.causeCode ?? SIN_CAUSA);
  const [nota, setNota] = useState(existing?.notes ?? '');
  const [foto, setFoto] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const mensajes = validarParte({
    progress: progreso,
    avanceAnterior: pendiente.avance,
    causeCode: causa === SIN_CAUSA ? null : (causa as NonComplianceCause),
    crewDays: jornadas === '' ? null : Number(jornadas),
  });
  const errores = mensajes.filter((m) => !esAviso(m));
  const avisos = mensajes.filter(esAviso);

  async function guardar() {
    setOcupado(true);
    try {
      let photoPath: string | null = existing?.photoPath ?? null;
      const tenantId = getTenantId();
      if (foto && tenantId) {
        // Una foto que no se puede subir (modo demo) no puede hacer perder el
        // parte: se avisa y el avance se guarda igual.
        try {
          const subido = await uploadObraFile(foto, {
            tenantId, projectId: currentProjectId, carpeta: 'parte-diario',
          });
          photoPath = subido.path;
        } catch (e: any) {
          toast({ title: 'El parte se guarda sin la foto', description: e.message });
        }
      }

      await saveDailyProgress({
        activityId: actividad.id,
        unitId: pendiente.unidad.id,
        date: fecha,
        progress: progreso,
        crewDays: jornadas === '' ? null : Number(jornadas),
        causeCode: causa === SIN_CAUSA ? null : (causa as NonComplianceCause),
        photoPath,
        quantity: existing?.quantity,
        notes: nota.trim() || null,
      });
      onCerrar();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo guardar', description: e.message });
    } finally {
      setOcupado(false);
    }
  }

  const necesitaCausa = progreso <= pendiente.avance;

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {pendiente.unidad.name}
            {pendiente.unidad.groupName ? ` · ${pendiente.unidad.groupName}` : ''}
          </DialogTitle>
          <DialogDescription>
            {actividad.name} · venía en {comoPorcentaje(pendiente.avance)}%
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>¿En cuánto quedó?</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {ESCALA_AVANCE.map((valor) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setProgreso(valor)}
                  className={`rounded-lg border px-2 py-2.5 text-center transition-colors ${
                    Math.abs(progreso - valor) < 0.001
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  <div className="text-sm font-semibold">{comoPorcentaje(valor)}%</div>
                  <div className="truncate text-[10px] leading-tight">
                    {ETIQUETA_AVANCE[valor]}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* La causa solo se pide cuando hace falta: preguntarla siempre
              enseña a contestar cualquier cosa para salir del paso. */}
          {necesitaCausa && (
            <div className="space-y-2">
              <Label>¿Por qué no avanzó?</Label>
              <Select value={causa} onValueChange={setCausa}>
                <SelectTrigger><SelectValue placeholder="Elige la causa" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_CAUSA}>Sin especificar</SelectItem>
                  {Object.entries(CAUSAS_CNC).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="pd-jornadas">Jornadas de hoy en esta unidad</Label>
            <Input id="pd-jornadas" type="number" step="0.5" min="0" inputMode="decimal"
              value={jornadas}
              onChange={(e) => setJornadas(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="Ej: 2" />
            <p className="text-xs text-muted-foreground">
              Opcional. Es lo que después da el rendimiento real de la cuadrilla.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pd-foto">Foto</Label>
            <Input id="pd-foto" type="file" accept="image/*" capture="environment"
              onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pd-nota">Observación</Label>
            <Textarea id="pd-nota" rows={2} value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej: falta el remate del rasgo de la ventana" />
          </div>

          {avisos.map((m) => <p key={m} className="text-sm text-warning">{m}</p>)}
          {errores.map((m) => <p key={m} className="text-sm text-danger">{m}</p>)}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={ocupado || errores.length > 0}>
            {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Enlace para el capataz ───────────────────────────────────────────── */

function DialogoEnlace({ actividad, fecha, onCerrar }: {
  actividad: TrainActivity;
  fecha: string;
  onCerrar: () => void;
}) {
  const { createDailyReportToken } = useAppState();
  const { toast } = useToast();

  const [nombre, setNombre] = useState(actividad.responsibleName ?? '');
  const [url, setUrl] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function generar() {
    setOcupado(true);
    try {
      const token = await createDailyReportToken({
        activityId: actividad.id,
        foremanName: nombre,
        validFor: fecha,
      });
      setUrl(`${window.location.origin}/parte/${token}`);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo generar', description: e.message });
    } finally {
      setOcupado(false);
    }
  }

  const mensajeWhatsapp = url
    ? `Hola ${nombre}, carga el avance de *${actividad.name}* de hoy acá: ${url}`
    : '';

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enlace para el capataz</DialogTitle>
          <DialogDescription>
            Abre solo el parte de «{actividad.name}» de este día. No es una cuenta:
            no da acceso al resto de la obra y vence a medianoche.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="en-nombre">¿Quién va a cargar el parte?</Label>
            <Input id="en-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Don Luis, capataz de PACAL" disabled={!!url} />
          </div>

          {url && (
            <div className="space-y-2">
              <Label htmlFor="en-url">Enlace</Label>
              <Input id="en-url" readOnly value={url}
                onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => {
                  navigator.clipboard?.writeText(url);
                  toast({ title: 'Enlace copiado' });
                }}>
                  Copiar
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={`https://wa.me/?text=${encodeURIComponent(mensajeWhatsapp)}`}
                    target="_blank" rel="noopener noreferrer">
                    Mandar por WhatsApp
                  </a>
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar}>{url ? 'Listo' : 'Cancelar'}</Button>
          {!url && (
            <Button onClick={generar} disabled={ocupado || !nombre.trim()}>
              {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generar enlace
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
