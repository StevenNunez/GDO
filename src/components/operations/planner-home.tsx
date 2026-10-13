"use client";

import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowUpRight, ArrowRight, Building2, CalendarDays, CalendarRange, Check, ChevronRight, ClipboardList, Layers, TrendingUp, AlertTriangle } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PlanLocked } from '@/components/plan-locked';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { usePlannerHealth } from '@/components/operations/use-planner-health';
import { Metric, SectionLabel, Sparkline, ToneBar } from '@/components/operations/planner-ui';
import { toneForPpc } from '@/lib/planner-tones';
import { unidadesDeObra, unidadesActivas } from '@/lib/work-units';
import { indexarExcepciones, claveDia } from '@/lib/work-calendar';
import { actividadesDeObra } from '@/lib/train';
import { actividadesDeHoy, avanceVigente, progresosDeObra } from '@/lib/daily-report';
import { cn } from '@/lib/utils';

/** Seguimiento diario: lo que se usa una vez armada la base de la planificación. */
const followUp = [
  { slug: 'parte-diario', icon: ClipboardList, title: 'Parte diario', description: 'Registra en terreno lo que realmente avanzó.' },
  { slug: 'analisis', icon: TrendingUp, title: 'Análisis de cumplimiento', description: 'Revisa rendimientos, atrasos y causas de no cumplimiento.' },
];

export default function PlannerHome() {
  const { workUnits, workCalendarExceptions, trainActivities, dailyProgress, projects, currentProjectId, can, lockedFeature } = useAppState();
  const obra = projects.find(p => p.id === currentProjectId);
  const units = useMemo(() => unidadesActivas(unidadesDeObra(workUnits, currentProjectId)), [workUnits, currentProjectId]);
  const calendar = useMemo(() => indexarExcepciones(workCalendarExceptions, currentProjectId), [workCalendarExceptions, currentProjectId]);
  const activities = useMemo(() => actividadesDeObra(trainActivities, currentProjectId), [trainActivities, currentProjectId]);
  const progress = useMemo(() => progresosDeObra(dailyProgress, currentProjectId), [dailyProgress, currentProjectId]);
  const today = claveDia(new Date());
  const pending = useMemo(() => actividadesDeHoy(activities, units, avanceVigente(progress.filter(p => claveDia(p.date) <= today)), progress, today, obra?.workDays, calendar), [activities, units, progress, today, obra?.workDays, calendar]);
  const health = usePlannerHealth();
  const blocked = lockedFeature('planning:view');
  if (blocked) return <PlanLocked feature={blocked} title="Last Planner" />;
  if (!can('planning:view') && !can('planning:manage')) return <p className="rounded-lg border border-border bg-card p-8">No tienes permiso para ver la planificación de esta obra.</p>;
  if (!currentProjectId || !health) return <div className="rounded-lg border border-border bg-card p-8"><h1 className="text-2xl font-semibold tracking-tight">Tu planificación empieza aquí</h1><p className="mt-3 text-muted-foreground">Selecciona una obra en la barra superior para abrir su planificación semanal.</p></div>;

  const unreported = pending.reduce((sum, a) => sum + a.pendientes.filter(p => !p.reportadaHoy).length, 0);
  const overdue = pending.reduce((sum, a) => sum + a.pendientes.filter(p => p.atrasada).length, 0);
  const planned = activities.filter(a => a.startDate).length;
  const ready = units.length > 0 && planned > 0;
  const committed = health.ppc.comprometidas;
  const steps = [
    { title: 'Unidades', detail: `${units.length} unidades activas`, done: units.length > 0, slug: 'unidades', icon: Building2 },
    { title: 'Calendario', detail: obra?.workDays?.length ? 'Jornada configurada' : 'Lunes a viernes por defecto', done: Boolean(obra?.workDays?.length), slug: 'calendario', icon: CalendarDays },
    { title: 'Tren', detail: `${planned} de ${activities.length} actividades con fecha`, done: activities.length > 0 && planned === activities.length, slug: 'tren', icon: Layers },
    { title: 'Programa semanal', detail: committed ? `${committed} compromisos esta semana` : 'Aún no hay compromisos esta semana', done: committed > 0, slug: 'programacion', icon: CalendarRange },
  ];
  const doneCount = steps.filter(s => s.done).length;
  const attention = [
    { icon: ClipboardList, title: 'Partes pendientes', value: unreported, detail: ready ? 'unidades sin parte de hoy' : 'Configura el tren para comenzar', href: 'parte-diario', tone: 'warning' as const },
    { icon: AlertTriangle, title: 'Unidades atrasadas', value: overdue, detail: 'según el tren y el avance real', href: 'parte-diario', tone: 'danger' as const },
    { icon: Layers, title: 'Restricciones pendientes', value: health.restriccionesPendientes, detail: `${health.restriccionesVencidas} con fecha vencida`, href: 'programacion', tone: 'info' as const },
  ];
  const ppc = health.ppc.ppc;
  const ppcTone = toneForPpc(ppc);
  return (
    <div className="space-y-6 pb-6">
      <section className="hub-welcome relative grid gap-6 rounded-lg border border-border bg-card p-6 sm:p-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
        <div>
          <p className="font-cifras text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Planificación de obra · Last Planner</p>
          <h1 className="mt-3 max-w-xl text-3xl font-semibold leading-[1.12] tracking-[-0.025em] sm:text-[2.1rem]">Una semana clara.<br /><span className="text-primary">Un equipo que avanza.</span></h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">Coordina el trabajo de la semana, registra el avance en terreno y revisa las causas de no cumplimiento.</p>
          <div className="mt-4 flex items-center gap-2 text-[13px] text-muted-foreground"><Building2 className="h-4 w-4 shrink-0" /><span className="truncate">{obra?.name ?? 'Obra seleccionada'}</span></div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild className="h-11 px-5 sm:h-10"><Link href={ready ? '/dashboard/last-planner/parte-diario' : '/dashboard/last-planner/unidades'}>{ready ? 'Abrir parte de hoy' : can('planning:manage') ? 'Preparar mi obra' : 'Ver unidades'}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            <Button asChild variant="outline" className="h-11 px-5 sm:h-10"><Link href="/dashboard/last-planner/programacion">Ver programa semanal</Link></Button>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/60 p-5">
          <div className="flex items-center justify-between"><span className="font-cifras text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Cumplimiento semanal</span><StatusBadge tone="warning" title="Porcentaje de Plan Cumplido">PPC</StatusBadge></div>
          <div className="mt-4 flex items-end justify-between gap-3">
            <div className="flex items-baseline gap-1.5"><span className="text-5xl font-semibold leading-none tracking-tight tabular-nums">{ppc === null ? '—' : ppc.toFixed(0)}</span>{ppc !== null && <span className="text-lg text-muted-foreground">%</span>}</div>
            <Sparkline values={health.ppcSerie} className={ppcTone === 'danger' ? 'text-danger' : ppcTone === 'warning' ? 'text-warning' : 'text-primary'} />
          </div>
          <ToneBar value={ppc ?? 0} tone={ppcTone === 'neutral' ? 'info' : ppcTone} className="my-4" />
          <p className="text-[13px] text-muted-foreground">{committed ? `${health.ppc.cumplidas} de ${committed} compromisos cumplidos esta semana.` : 'Todavía no hay compromisos esta semana.'}</p>
          <div className="mt-4 flex min-h-11 items-center justify-between gap-3 border-t border-border pt-3 text-sm">
            <span className="text-xs text-muted-foreground">Restricciones: {health.restriccionesPendientes} sin resolver</span>
            <Link href="/dashboard/last-planner/programacion" className="inline-flex items-center gap-1 font-semibold text-primary focus-visible:ring-2 focus-visible:ring-ring">Revisar compromisos <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="today-title">
        <SectionLabel id="today-title" aside="hoy en tu obra">Lo que necesita atención</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-3">
          {attention.map(({ icon, title, value, detail, href, tone }) => (
            <Link key={title} href={`/dashboard/last-planner/${href}`} className="block rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-ring [&>div]:transition-colors [&:hover>div]:border-primary/40">
              <Metric label={title} icon={icon} value={value} hint={detail} tone={value > 0 ? tone : 'neutral'} />
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="setup-title">
        <SectionLabel id="setup-title" aside={`${doneCount} de ${steps.length} listos`}>La base de tu planificación</SectionLabel>
        <p className="mb-3 text-sm text-muted-foreground">{ready ? 'Revisa la configuración cuando cambie la obra.' : 'Empieza por las unidades, revisa la jornada y arma el tren.'}</p>
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {steps.map((step, index) => (
            <li key={step.slug}>
              <Link href={`/dashboard/last-planner/${step.slug}`} className="flex min-h-16 items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-cifras text-xs font-semibold', step.done ? 'border-success bg-success text-white' : 'border-border text-muted-foreground')}>{step.done ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{step.title}</span><span className="block truncate text-xs text-muted-foreground">{step.detail}</span></span>
                <StatusBadge tone={step.done ? 'success' : 'warning'} className="shrink-0">{step.done ? 'Listo' : 'Pendiente'}</StatusBadge>
                <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="follow-title">
        <SectionLabel id="follow-title">Seguimiento</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2">
          {followUp.map(({ slug, icon: Icon, title, description }) => (
            <Link key={slug} href={`/dashboard/last-planner/${slug}`} className="flex min-h-20 items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{title}</span><span className="block text-xs leading-relaxed text-muted-foreground">{description}</span></span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
