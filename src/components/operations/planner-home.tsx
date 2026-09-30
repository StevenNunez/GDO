"use client";

import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowUpRight, ArrowRight, Building2, CalendarDays, CalendarRange, Check, ClipboardList, Layers, TrendingUp, AlertTriangle, Leaf } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PlanLocked } from '@/components/plan-locked';
import { Button } from '@/components/ui/button';
import { ModuleCard } from '@/components/ui/module-card';
import { unidadesDeObra, unidadesActivas } from '@/lib/work-units';
import { indexarExcepciones, claveDia } from '@/lib/work-calendar';
import { actividadesDeObra } from '@/lib/train';
import { actividadesDeHoy, avanceVigente, progresosDeObra } from '@/lib/daily-report';
import { tareasDeLaSemana, saludPrograma, semanasDeLookahead, claveSemana } from '@/lib/last-planner';
import { cn } from '@/lib/utils';

const tools = [
  { slug: 'unidades', icon: Building2, title: 'Unidades de obra', description: 'Define pisos, departamentos y frentes.' },
  { slug: 'calendario', icon: CalendarDays, title: 'Calendario laboral', description: 'Organiza jornadas, feriados y excepciones.' },
  { slug: 'tren', icon: Layers, title: 'Tren de actividades', description: 'Asigna ritmos y fechas a cada cuadrilla.' },
  { slug: 'programacion', icon: CalendarRange, title: 'Programa semanal', description: 'Libera restricciones y acuerda compromisos.' },
  { slug: 'parte-diario', icon: ClipboardList, title: 'Parte diario', description: 'Registra en terreno lo que realmente avanzó.' },
  { slug: 'analisis', icon: TrendingUp, title: 'Análisis de cumplimiento', description: 'Revisa rendimientos, atrasos y causas de no cumplimiento.' },
];

export default function PlannerHome() {
  const { workUnits, workCalendarExceptions, trainActivities, dailyProgress, lookaheadTasks, taskConstraints, projects, currentProjectId, can, lockedFeature } = useAppState();
  const obra = projects.find(p => p.id === currentProjectId);
  const units = useMemo(() => unidadesActivas(unidadesDeObra(workUnits, currentProjectId)), [workUnits, currentProjectId]);
  const calendar = useMemo(() => indexarExcepciones(workCalendarExceptions, currentProjectId), [workCalendarExceptions, currentProjectId]);
  const activities = useMemo(() => actividadesDeObra(trainActivities, currentProjectId), [trainActivities, currentProjectId]);
  const progress = useMemo(() => progresosDeObra(dailyProgress, currentProjectId), [dailyProgress, currentProjectId]);
  const today = claveDia(new Date());
  const pending = useMemo(() => actividadesDeHoy(activities, units, avanceVigente(progress.filter(p => claveDia(p.date) <= today)), progress, today, obra?.workDays, calendar), [activities, units, progress, today, obra?.workDays, calendar]);
  const health = useMemo(() => {
    const tasks = lookaheadTasks.filter(t => t.projectId === currentProjectId);
    const weeks = new Set(semanasDeLookahead(new Date(), 6).map(claveSemana));
    return saludPrograma(tareasDeLaSemana(tasks, today), tasks.filter(t => weeks.has(claveSemana(t.weekStart))), taskConstraints);
  }, [lookaheadTasks, currentProjectId, taskConstraints, today]);
  const blocked = lockedFeature('planning:view');
  if (blocked) return <PlanLocked feature={blocked} title="Last Planner" />;
  if (!can('planning:view') && !can('planning:manage')) return <p className="rounded-3xl bg-card p-8">No tienes permiso para ver la planificación de esta obra.</p>;
  if (!currentProjectId) return <div className="rounded-2xl border border-border bg-card p-8 shadow-sm"><h1 className="text-2xl font-semibold">Tu planificación empieza aquí</h1><p className="mt-3 text-muted-foreground">Selecciona una obra en la barra superior para abrir su planificación semanal.</p></div>;

  const unreported = pending.reduce((sum, a) => sum + a.pendientes.filter(p => !p.reportadaHoy).length, 0);
  const overdue = pending.reduce((sum, a) => sum + a.pendientes.filter(p => p.atrasada).length, 0);
  const planned = activities.filter(a => a.startDate).length;
  const ready = units.length > 0 && planned > 0;
  const steps = [
    { title: 'Unidades', detail: `${units.length} unidades activas`, done: units.length > 0, slug: 'unidades' },
    { title: 'Calendario', detail: obra?.workDays?.length ? 'Jornada configurada' : 'Lunes a viernes por defecto', done: Boolean(obra?.workDays?.length), slug: 'calendario' },
    { title: 'Tren', detail: `${planned} de ${activities.length} actividades con fecha`, done: activities.length > 0 && planned === activities.length, slug: 'tren' },
  ];
  return (
    <div className="mx-auto max-w-[1280px] space-y-7 pb-6">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-9">
        <div className="relative grid gap-7 lg:grid-cols-[1.5fr_1fr] lg:items-center">
          <div>
            <div className="mb-5 flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-primary"><Leaf className="h-4 w-4" /> PLANIFICACIÓN DE OBRA · LAST PLANNER</div>
            <h1 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight sm:text-[2.6rem]">Una semana clara.<br />Un equipo que avanza.</h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">Coordina el trabajo de la semana, registra el avance en terreno y revisa las causas de no cumplimiento.</p>
            <div className="mt-4 flex items-center gap-2 text-sm font-medium text-primary"><Building2 className="h-4 w-4 shrink-0" /><span className="truncate">{obra?.name ?? 'Obra seleccionada'}</span></div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild className="h-12 rounded-full px-5"><Link href={ready ? '/dashboard/last-planner/parte-diario' : '/dashboard/last-planner/unidades'}>{ready ? 'Abrir parte de hoy' : can('planning:manage') ? 'Preparar mi obra' : 'Ver unidades'}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
              <Button asChild variant="outline" className="h-12 rounded-full border-primary/15 px-5"><Link href="/dashboard/last-planner/programacion">Ver programa semanal</Link></Button>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-background p-5 sm:p-6">
            <div className="flex items-center justify-between"><span className="text-sm font-semibold">Cumplimiento semanal</span><span className="rounded-full bg-cta/20 px-2.5 py-1 text-[10px] font-semibold text-foreground" title="Porcentaje de Plan Cumplido">PPC</span></div>
            <div className="mt-3 flex items-baseline sm:mt-5 gap-3"><span className="text-3xl font-semibold tracking-tight text-primary sm:text-5xl">{health.ppc.ppc === null ? '—' : `${health.ppc.ppc.toFixed(0)}%`}</span><span className="text-xs text-muted-foreground">de compromisos cumplidos</span></div>
            <div className="my-3 h-2 sm:my-4 overflow-hidden rounded-full bg-primary/10"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${health.ppc.ppc ?? 0}%` }} /></div>
            <p className="text-sm text-muted-foreground">{health.ppc.comprometidas ? `${health.ppc.cumplidas} cumplidos de ${health.ppc.comprometidas} compromisos.` : 'Todavía no hay compromisos esta semana.'}</p>
            <Link href="/dashboard/last-planner/programacion" className="mt-4 flex min-h-11 items-center justify-between border-t border-primary/10 pt-3 text-sm font-semibold text-primary">Revisar compromisos <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>
      <section aria-labelledby="today-title">
        <div className="mb-3 flex items-center justify-between gap-3"><h2 id="today-title" className="text-lg font-semibold">Lo que necesita atención</h2><span className="text-xs text-muted-foreground">Hoy en tu obra</span></div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: ClipboardList, title: 'Partes pendientes', value: unreported, detail: ready ? 'unidades sin parte de hoy' : 'Configura el tren para comenzar', href: 'parte-diario' },
            { icon: AlertTriangle, title: 'Unidades atrasadas', value: overdue, detail: 'según el tren y el avance real', href: 'parte-diario' },
            { icon: Layers, title: 'Restricciones pendientes', value: health.restriccionesPendientes, detail: `${health.restriccionesVencidas} con fecha vencida`, href: 'programacion' },
          ].map(({ icon: Icon, title, value, detail, href }) => <Link key={title} href={`/dashboard/last-planner/${href}`} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring"><Icon className="h-5 w-5 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="text-xs font-medium text-muted-foreground">{title}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><span className="text-3xl font-semibold tabular-nums text-primary">{value}</span></Link>)}
        </div>
      </section>
      <section className="rounded-[1.5rem] border border-border/60 bg-card p-5 sm:p-6" aria-labelledby="setup-title">
        <div className="mb-4"><h2 id="setup-title" className="font-semibold">La base de tu planificación</h2><p className="mt-1 text-sm text-muted-foreground">{ready ? 'Revisa la configuración cuando cambie la obra.' : 'Empieza por las unidades, revisa la jornada y arma el tren.'}</p></div>
        <div className="grid gap-3 sm:grid-cols-3">{steps.map((step, index) => <Link key={step.slug} href={`/dashboard/last-planner/${step.slug}`} className="flex min-h-20 items-center gap-3 rounded-2xl border border-border bg-background p-3 transition-colors hover:border-primary/40 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"><span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold', step.done ? 'bg-primary/10 text-primary' : 'bg-cta/20 text-foreground')}>{step.done ? <Check className="h-4 w-4" /> : `0${index + 1}`}</span><div className="min-w-0"><p className="text-sm font-semibold">{step.title}</p><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{step.detail}</p></div></Link>)}</div>
      </section>
      <section aria-labelledby="tools-title"><h2 id="tools-title" className="mb-4 text-xl font-semibold tracking-tight">Cada paso, en su lugar</h2><div className="grid gap-4 min-[420px]:grid-cols-2 xl:grid-cols-3">{tools.map(({ slug, ...tool }) => <ModuleCard key={slug} {...tool} href={`/dashboard/last-planner/${slug}`} />)}</div></section>
    </div>
  );
}
