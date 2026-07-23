'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { formatCLP } from '@/lib/format';
import { useAppState } from '@/modules/core/contexts/app-provider';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckSquare,
  Clock,
  Construction,
  FolderTree,
  Layers,
  ListChecks,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { WorkItem } from '@/modules/core/lib/data';
import { Progress } from '@/components/ui/progress';
import { PanelCard } from '@/components/ui/panel-card';
import { StatTile } from '@/components/ui/stat-tile';
import { StatusBadge } from '@/components/ui/status-badge';
import { SurfaceCard } from '@/components/ui/surface-card';
import { Button } from '@/components/ui/button';
import { format, isPast, isWithinInterval, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { toDate } from '@/lib/date-utils';

const WEATHER_LABEL: Record<string, string> = {
  soleado: 'Soleado',
  nublado: 'Nublado',
  lluvia: 'Lluvia',
  viento: 'Viento',
  heladas: 'Heladas',
};

export default function ConstructionControlHubPage() {
  const { workItems, bitacoraEntries, can } = useAppState();

  const stats = useMemo(() => {
    const items: WorkItem[] = workItems || [];
    const leaves = items.filter((i) => i.type !== 'project' && i.type !== 'phase');

    const pendingReview = items.filter((i) => i.status === 'pending-quality-review');
    const completed = items.filter((i) => i.status === 'completed').length;
    const inProgress = items.filter((i) => i.status === 'in-progress').length;
    const rejected = items.filter((i) => i.status === 'rejected').length;

    const totalBudget = leaves.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const earnedValue = leaves.reduce((s, i) => s + (i.quantity * i.unitPrice * i.progress) / 100, 0);
    const budgetProgress = totalBudget > 0 ? (earnedValue / totalBudget) * 100 : 0;

    // Avance físico general: usa el nodo raíz `project` si existe; si no (obras
    // sin raíz explícita), cae al avance valorizado, que ya pondera por valor.
    const projectItem = items.find((i) => i.type === 'project');
    const overallProgress = projectItem?.progress ?? budgetProgress;

    // Avance por fase: fases de primer nivel ordenadas por path.
    const phases = items
      .filter((i) => i.type === 'phase')
      .sort((a, b) => (a.path || '').localeCompare(b.path || ''));

    const today = new Date();
    const in7Days = addDays(today, 7);
    const overdue = items.filter((i) => {
      if (i.status === 'completed') return false;
      const end = toDate(i.plannedEndDate);
      return end && isPast(end);
    });
    const upcomingDeadlines = items.filter((i) => {
      if (i.status === 'completed') return false;
      const end = toDate(i.plannedEndDate);
      return end && isWithinInterval(end, { start: today, end: in7Days });
    });

    const recentBitacora = (bitacoraEntries || []).slice(0, 4);

    return {
      isEmpty: items.length === 0,
      overallProgress,
      pendingReview,
      completed,
      inProgress,
      rejected,
      totalBudget,
      earnedValue,
      budgetProgress,
      phases,
      overdue,
      upcomingDeadlines,
      recentBitacora,
    };
  }, [workItems, bitacoraEntries]);

  const canRegister = can('construction_control:register_progress') || can('construction_control:edit_structure');

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        title="Control de Obra"
        description="Panel general: avance físico, plazos, calidad y bitácora de terreno."
        actions={
          canRegister ? (
            <Button asChild variant="cta">
              <Link href="/dashboard/construction-control/wbs">
                <FolderTree className="mr-2 h-4 w-4" />
                Registrar avance
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* Estado vacío: guía a cargar la EDT */}
      {stats.isEmpty ? (
        <SurfaceCard interactive={false} className="items-center p-12 text-center">
          <FolderTree className="mb-4 h-14 w-14 text-muted-foreground opacity-50" strokeWidth={1.25} />
          <h3 className="text-lg font-bold tracking-tight">Aún no hay partidas cargadas</h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Crea la estructura de desglose del trabajo (EDT) para empezar a registrar avance, plazos y calidad de la obra.
          </p>
          {can('construction_control:edit_structure') && (
            <Button asChild variant="cta" className="mt-6">
              <Link href="/dashboard/construction-control/wbs">
                Crear estructura de trabajo
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          )}
        </SurfaceCard>
      ) : (
        <>
          {/* Alertas de plazo */}
          {stats.overdue.length > 0 && (
            <div className="rounded-2xl border border-danger/30 bg-danger-subtle p-4">
              <div className="flex items-center gap-2 font-semibold text-danger">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {stats.overdue.length === 1
                  ? '1 partida con plazo vencido'
                  : `${stats.overdue.length} partidas con plazo vencido`}
              </div>
              <div className="mt-2 space-y-0.5">
                {stats.overdue.slice(0, 3).map((i) => (
                  <p key={i.id} className="text-sm text-danger/90">
                    <span className="mr-1 font-mono text-xs opacity-70">{i.path}</span>
                    {i.name}
                    {i.plannedEndDate && (
                      <span className="ml-1 text-xs opacity-70">
                        — vencía {format(toDate(i.plannedEndDate)!, "d 'de' MMMM", { locale: es })}
                      </span>
                    )}
                  </p>
                ))}
                {stats.overdue.length > 3 && (
                  <p className="text-xs text-danger/70">...y {stats.overdue.length - 3} más.</p>
                )}
              </div>
            </div>
          )}

          {stats.upcomingDeadlines.length > 0 && (
            <div className="rounded-2xl border border-warning/30 bg-warning-subtle p-4">
              <div className="flex items-center gap-2 font-semibold text-warning">
                <Clock className="h-4 w-4 shrink-0" />
                {stats.upcomingDeadlines.length}{' '}
                {stats.upcomingDeadlines.length === 1 ? 'partida vence' : 'partidas vencen'} en los próximos 7 días
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {stats.upcomingDeadlines.slice(0, 4).map((i) => (
                  <span
                    key={i.id}
                    className="rounded-full border border-warning/30 px-2 py-0.5 text-xs font-medium text-warning"
                  >
                    {i.path} — {i.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Indicadores de estado */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="En progreso" value={stats.inProgress} icon={Construction} tone="info" />
            <StatTile label="En revisión" value={stats.pendingReview.length} icon={ListChecks} tone="warning" />
            <StatTile label="Completadas" value={stats.completed} icon={CheckSquare} tone="success" />
            <StatTile label="Rechazadas" value={stats.rejected} icon={TrendingDown} tone="danger" />
          </div>

          {/* Avance general + valor de contrato */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <PanelCard
              title="Avance Físico General"
              description="Progreso de la obra sobre el total planificado"
              icon={TrendingUp}
              className="lg:col-span-2"
            >
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="text-muted-foreground">Progreso físico</span>
                    <span className="text-lg font-bold tracking-tighter text-primary">
                      {stats.overallProgress.toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={stats.overallProgress} className="h-3" />
                </div>
                {stats.totalBudget > 0 && (
                  <div>
                    <div className="mb-2 flex justify-between text-sm">
                      <span className="text-muted-foreground">Avance valorizado</span>
                      <span className="font-semibold">{stats.budgetProgress.toFixed(1)}%</span>
                    </div>
                    <Progress value={stats.budgetProgress} className="h-2" />
                  </div>
                )}
              </div>
            </PanelCard>

            {stats.totalBudget > 0 && (
              <PanelCard title="Valor de Contrato" icon={BarChart3} tone="info">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Presupuesto total</p>
                    <p className="text-base font-bold tracking-tight">{formatCLP(stats.totalBudget)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Valor ganado (avance)</p>
                    <p className="text-base font-bold tracking-tight text-success">{formatCLP(stats.earnedValue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Saldo pendiente</p>
                    <p className="font-semibold text-muted-foreground">
                      {formatCLP(stats.totalBudget - stats.earnedValue)}
                    </p>
                  </div>
                </div>
              </PanelCard>
            )}
          </div>

          {/* Avance por fase + bitácora reciente */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PanelCard title="Avance por Fase" description="Progreso físico de cada fase" icon={Layers}>
              {stats.phases.length > 0 ? (
                <div className="space-y-4">
                  {stats.phases.map((p) => (
                    <div key={p.id}>
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate font-medium">
                          <span className="mr-1.5 font-mono text-xs text-muted-foreground">{p.path}</span>
                          {p.name}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">{(p.progress ?? 0).toFixed(0)}%</span>
                      </div>
                      <Progress value={p.progress ?? 0} className="h-2" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No hay fases definidas en la EDT.
                </p>
              )}
            </PanelCard>

            {can('module_construction_control:view') && (
              <PanelCard
                title="Bitácora Reciente"
                description="Últimos registros de terreno"
                icon={BookOpen}
                actions={
                  <Link
                    href="/dashboard/construction-control/bitacora"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Ver todo <ArrowRight className="h-3 w-3" />
                  </Link>
                }
              >
                {stats.recentBitacora.length > 0 ? (
                  <div className="space-y-2">
                    {stats.recentBitacora.map((b: any) => (
                      <div key={b.id} className="rounded-xl border border-border bg-muted/40 p-3">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="font-medium">
                            {b.date ? format(toDate(b.date)!, "d 'de' MMM", { locale: es }) : 'Sin fecha'}
                          </span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {b.weather && <StatusBadge tone="neutral">{WEATHER_LABEL[b.weather] ?? b.weather}</StatusBadge>}
                            <span>{b.workerCount ?? 0} pers.</span>
                          </div>
                        </div>
                        {b.workPerformed && (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{b.workPerformed}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Aún no hay entradas en la bitácora.
                  </p>
                )}
              </PanelCard>
            )}
          </div>

          {/* Partidas en revisión — accionable */}
          {can('construction_control:review_protocols') && stats.pendingReview.length > 0 && (
            <PanelCard
              title="Partidas en Revisión de Calidad"
              description="Esperando tu aprobación o rechazo"
              icon={CheckSquare}
              tone="warning"
              actions={
                <Link
                  href="/dashboard/construction-control/revisar-protocolos"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Ir a revisar <ArrowRight className="h-3 w-3" />
                </Link>
              }
            >
              <div className="space-y-2">
                {stats.pendingReview.slice(0, 5).map((i) => (
                  <Link
                    key={i.id}
                    href="/dashboard/construction-control/revisar-protocolos"
                    className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <span className="min-w-0 truncate text-sm font-medium">
                      <span className="mr-1.5 font-mono text-xs text-muted-foreground">{i.path}</span>
                      {i.name}
                    </span>
                    <StatusBadge tone="warning">Revisar</StatusBadge>
                  </Link>
                ))}
                {stats.pendingReview.length > 5 && (
                  <p className="text-center text-xs text-muted-foreground">
                    ...y {stats.pendingReview.length - 5} más.
                  </p>
                )}
              </div>
            </PanelCard>
          )}
        </>
      )}
    </div>
  );
}
