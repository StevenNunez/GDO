
'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { PageHeader } from '@/components/page-header';
import { formatCLP } from '@/lib/format';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  History,
  FolderTree,
  Search,
  Package,
  Layers,
  TrendingUp,
  DollarSign,
  CheckCircle2,
  Clock,
  XCircle,
  BarChart3,
  FileText,
  ArrowLeft,
} from 'lucide-react';
import { SurfaceCard } from '@/components/ui/surface-card';
import { StatTile } from '@/components/ui/stat-tile';
import { Input } from '@/components/ui/input';
import { WorkItem, ProgressLog, Budget, Apu, ApuItem } from '@/modules/core/lib/data';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PanelCard } from '@/components/ui/panel-card';
import { sumBudgetValue, sumEarnedValue, getLeafItems } from '@/lib/budget-costs';
import { computeApu } from '@/lib/apu-costs';
import { Wallet, Calculator } from 'lucide-react';
import { CreateWorkItemForm } from '@/components/operations/create-work-item-form';
import { RegisterProgressForm } from '@/components/operations/register-progress-form';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toDate } from '@/lib/date-utils';
import { Progress } from '@/components/ui/progress';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useToast } from '@/modules/core/hooks/use-toast';
import { Sparkles } from 'lucide-react';

// --- Types ---
type TreeWorkItem = WorkItem & { children: TreeWorkItem[] };

// --- Helpers ---

const getStatusConfig = (status: WorkItem['status'], progress: number): { label: string; tone: StatusTone; icon: React.ElementType } => {
  if (status === 'completed') return { label: 'Completada', tone: 'success', icon: CheckCircle2 };
  if (status === 'pending-quality-review') return { label: 'En Revisión', tone: 'info', icon: Clock };
  if (status === 'rejected') return { label: 'Rechazada', tone: 'danger', icon: XCircle };
  if (progress > 0) return { label: 'En Progreso', tone: 'warning', icon: TrendingUp };
  return { label: 'Sin Iniciar', tone: 'neutral', icon: Package };
};

// La barra de avance sí es semántica: verde = terminado, ámbar = a medias,
// rojo = recién empezado. Va con los tokens para que sirva en ambos temas.
const getProgressColor = (p: number) => {
  if (p >= 100) return 'bg-success';
  if (p >= 70) return 'bg-info';
  if (p >= 40) return 'bg-warning';
  if (p > 0) return 'bg-danger';
  return 'bg-muted-foreground/30';
};

const getTypeIcon = (type: WorkItem['type']) => {
  switch (type) {
    case 'project': return '📁';
    case 'phase': return '📂';
    case 'subphase': return '📋';
    case 'activity': return '⚙️';
    case 'task': return '📌';
    default: return '📄';
  }
};

// --- Tree Builder ---
const buildTree = (items: WorkItem[]): TreeWorkItem[] => {
  const itemMap = new Map<string, TreeWorkItem>();
  const roots: TreeWorkItem[] = [];

  items.forEach(item => {
    itemMap.set(item.id, { ...item, children: [] });
  });

  items.forEach(item => {
    const node = itemMap.get(item.id)!;
    if (item.parentId && itemMap.has(item.parentId)) {
      itemMap.get(item.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortRecursive = (nodes: TreeWorkItem[]) => {
    nodes.sort((a, b) => a.path.localeCompare(b.path));
    nodes.forEach(n => sortRecursive(n.children));
  };

  sortRecursive(roots);
  return roots;
};

// --- Tree Node ---
const WorkItemNode = ({
  node,
  level = 0,
  onSelect,
  selectedId,
  isLast = false,
}: {
  node: TreeWorkItem;
  level?: number;
  onSelect: (item: WorkItem) => void;
  selectedId: string | null;
  isLast?: boolean;
}) => {
  const [isExpanded, setIsExpanded] = useState(level < 2);
  const hasChildren = node.children.length > 0;
  const progress = node.progress || 0;
  const statusCfg = getStatusConfig(node.status, progress);
  const isSelected = selectedId === node.id;

  return (
    <div className="relative">
      {/* Tree connector lines */}
      {level > 0 && (
        <div
          className="absolute left-0 top-0 bottom-0 border-l border-border/40"
          style={{ left: `${(level - 1) * 20 + 10}px` }}
        />
      )}
      {level > 0 && (
        <div
          className="absolute border-t border-border/40"
          style={{ left: `${(level - 1) * 20 + 10}px`, top: '18px', width: '12px' }}
        />
      )}

      <div
        style={{ paddingLeft: `${level * 20}px` }}
        className="relative"
      >
        <div
          onClick={() => onSelect(node)}
          className={cn(
            'flex items-center gap-2 py-2 px-2.5 rounded-lg cursor-pointer transition-all duration-200 group relative',
            isSelected
              ? 'bg-primary/10 border border-primary/30 shadow-sm shadow-primary/5'
              : 'hover:bg-muted/60 border border-transparent'
          )}
        >
          {/* Expand/Collapse */}
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="p-0.5 rounded-md hover:bg-muted-foreground/10 transition-colors shrink-0"
            >
              <div className={cn('transition-transform duration-200', isExpanded && 'rotate-0')}>
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>
            </button>
          ) : (
            <div className="w-[18px] shrink-0" />
          )}

          {/* Type emoji */}
          <span className="text-sm shrink-0">{getTypeIcon(node.type)}</span>

          {/* Path code */}
          <span className={cn(
            'text-[11px] font-mono shrink-0 px-1.5 py-0.5 rounded-md transition-colors',
            isSelected ? 'bg-primary/20 text-primary' : 'bg-muted/80 text-muted-foreground group-hover:text-primary'
          )}>
            {node.path}
          </span>

          {/* Name + progress */}
          <div className="flex-grow min-w-0">
            <p className={cn(
              'truncate text-sm transition-colors',
              isSelected ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'
            )}>
              {node.name}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <Progress
                value={progress}
                className="h-1 flex-grow bg-muted/50"
                indicatorClassName={getProgressColor(progress)}
              />
            </div>
          </div>

          {/* Status + percentage */}
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge tone={statusCfg.tone} className="text-[10px] px-1.5 py-0 h-5">
              {statusCfg.label}
            </StatusBadge>
            <span className={cn(
              'text-xs font-mono font-semibold tabular-nums min-w-[44px] text-right',
              progress >= 100 ? 'text-success' : progress > 0 ? 'text-foreground' : 'text-muted-foreground'
            )}>
              {progress.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="animate-in fade-in-0 slide-in-from-top-1 duration-200">
          {node.children.map((child, idx) => (
            <WorkItemNode
              key={child.id}
              node={child}
              level={level + 1}
              onSelect={onSelect}
              selectedId={selectedId}
              isLast={idx === node.children.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// --- APU de una partida ---
// El APU es la justificación del precio unitario: al aplicarlo se copia desde la
// biblioteca y su total pasa a ser el `unitPrice` de la partida.
function WorkItemApuPanel({
  workItem, apus, apuItems, canEdit, onApply, onSyncPrice,
}: {
  workItem: WorkItem;
  apus: Apu[];
  apuItems: ApuItem[];
  canEdit: boolean;
  onApply: (templateId: string, template: Apu) => void;
  onSyncPrice: (total: number) => void;
}) {
  const ownApu = useMemo(
    () => apus.find(a => a.workItemId === workItem.id) ?? null,
    [apus, workItem.id]
  );

  const ownItems = useMemo(
    () => (ownApu ? apuItems.filter(i => i.apuId === ownApu.id) : []),
    [apuItems, ownApu]
  );

  const breakdown = useMemo(() => computeApu(ownItems), [ownItems]);
  const library = useMemo(() => apus.filter(a => a.isTemplate), [apus]);

  // Se compara con tolerancia de $1: los montos se guardan como NUMERIC y
  // comparar por igualdad exacta marcaría diferencias que no existen.
  const outOfSync = ownApu && Math.abs(breakdown.total - (workItem.unitPrice || 0)) > 1;

  if (!ownApu) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Esta partida no tiene APU. Aplica uno de la biblioteca para justificar su precio unitario.
        </p>
        {canEdit ? (
          library.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>La biblioteca está vacía</AlertTitle>
              <AlertDescription>
                Crea APU en Control de Obra → APU y vuelve aquí para aplicarlos.
              </AlertDescription>
            </Alert>
          ) : (
            <Select onValueChange={(v) => {
              const tpl = library.find(a => a.id === v);
              if (tpl) onApply(v, tpl);
            }}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Aplicar APU de la biblioteca..." /></SelectTrigger>
              <SelectContent>
                {library.map(a => {
                  const total = computeApu(apuItems.filter(i => i.apuId === a.id)).total;
                  return (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} — {formatCLP(total)}/{a.unit}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )
        ) : (
          <p className="text-xs text-muted-foreground">No tienes permisos para aplicar un APU.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{ownApu.name}</p>
          <p className="text-xs text-muted-foreground">Precio por {ownApu.unit}</p>
        </div>
        <span className="shrink-0 font-mono text-lg font-bold tabular-nums text-primary">
          {formatCLP(breakdown.total)}
        </span>
      </div>

      <div className="space-y-1">
        {(['material', 'labor', 'equipment', 'other'] as const).map(kind => {
          if (breakdown[kind] === 0) return null;
          const label = { material: 'Materiales', labor: 'Mano de obra', equipment: 'Equipos', other: 'Otros' }[kind];
          return (
            <div key={kind} className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-mono tabular-nums">{formatCLP(breakdown[kind])}</span>
            </div>
          );
        })}
      </div>

      {outOfSync && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>El precio de la partida no coincide con su APU</AlertTitle>
          <AlertDescription className="space-y-2">
            <p className="text-xs">
              La partida tiene {formatCLP(workItem.unitPrice || 0)} y el APU da {formatCLP(breakdown.total)}.
            </p>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => onSyncPrice(breakdown.total)}>
                Actualizar precio de la partida
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {canEdit && library.length > 0 && (
        <Select onValueChange={(v) => {
          const tpl = library.find(a => a.id === v);
          if (tpl) onApply(v, tpl);
        }}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Reemplazar por otro APU de la biblioteca..." />
          </SelectTrigger>
          <SelectContent>
            {library.map(a => {
              const total = computeApu(apuItems.filter(i => i.apuId === a.id)).total;
              return (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} — {formatCLP(total)}/{a.unit}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

// --- Panel de presupuestos ---
// Conecta cada Contrato (raíz de la EDT) con una obra y lo marca como principal
// o adicional. Es el único lugar donde se hace esa asignación.
function BudgetsPanel({
  budgets, projects, workItems, canEdit, onAssign, onSetType, onDelete,
}: {
  budgets: Budget[];
  projects: { id: string; name: string }[];
  workItems: WorkItem[];
  canEdit: boolean;
  onAssign: (b: Budget, projectId: string | null) => void;
  onSetType: (b: Budget, type: 'principal' | 'adicional') => void;
  onDelete: (b: Budget) => void;
}) {
  const itemsByBudget = useMemo(() => {
    const map = new Map<string, WorkItem[]>();
    for (const wi of workItems) {
      if (!wi.budgetId) continue;
      const list = map.get(wi.budgetId);
      if (list) list.push(wi);
      else map.set(wi.budgetId, [wi]);
    }
    return map;
  }, [workItems]);

  const unassigned = budgets.filter(b => !b.projectId).length;

  if (budgets.length === 0) return null;

  return (
    <PanelCard
      title="Presupuestos y obras"
      icon={Wallet}
      tone={unassigned > 0 ? 'warning' : 'neutral'}
      description={
        unassigned > 0
          ? `${unassigned} presupuesto(s) sin obra asignada — no cuentan para el control de gastos por cliente hasta asignarlos.`
          : 'Cada Contrato de la EDT está conectado a una obra.'
      }
    >
      <div className="space-y-2">
        {budgets.map(b => {
          const value = sumBudgetValue(itemsByBudget.get(b.id) ?? []);
          return (
            <div key={b.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{b.name}</p>
                <p className="text-xs text-muted-foreground">{formatCLP(value)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={b.type}
                  disabled={!canEdit}
                  onValueChange={(v) => onSetType(b, v as 'principal' | 'adicional')}
                >
                  <SelectTrigger className="h-8 w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="principal">Principal</SelectItem>
                    <SelectItem value="adicional">Adicional</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={b.projectId || 'none'}
                  disabled={!canEdit}
                  onValueChange={(v) => onAssign(b, v === 'none' ? null : v)}
                >
                  <SelectTrigger className={cn('h-8 w-[180px]', !b.projectId && 'border-warning text-warning')}>
                    <SelectValue placeholder="Sin obra" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin obra asignada</SelectItem>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {canEdit && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => onDelete(b)} aria-label="Eliminar presupuesto">
                    <XCircle className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </PanelCard>
  );
}

// --- Main Page ---
export default function ConstructionWBSPage() {
  const { workItems, budgets, projects, apus, apuItems, isLoading, progressLogs, submitForQualityReview, importWorkItemsTemplate, updateBudget, deleteBudget, applyApuToWorkItem, setWorkItemUnitPrice, can } = useAppState();
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const handleImportTemplate = useCallback(async () => {
    setIsImporting(true);
    try {
      await importWorkItemsTemplate();
      toast({ title: 'Plantilla importada', description: 'Se cargó la estructura EDT de ejemplo. Puedes editarla libremente.' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo importar', description: e instanceof Error ? e.message : 'Error desconocido.' });
    } finally {
      setIsImporting(false);
    }
  }, [importWorkItemsTemplate, toast]);

  const handleAssignBudget = useCallback(async (b: Budget, projectId: string | null) => {
    try {
      await updateBudget(b.id, { projectId });
      const name = projects.find(p => p.id === projectId)?.name;
      toast({ title: 'Presupuesto asignado', description: name ? `"${b.name}" ahora pertenece a ${name}.` : `"${b.name}" quedó sin obra.` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e instanceof Error ? e.message : 'No se pudo asignar.' });
    }
  }, [updateBudget, projects, toast]);

  const handleSetBudgetType = useCallback(async (b: Budget, type: 'principal' | 'adicional') => {
    try {
      await updateBudget(b.id, { type });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e instanceof Error ? e.message : 'No se pudo actualizar.' });
    }
  }, [updateBudget, toast]);

  const handleDeleteBudget = useCallback(async (b: Budget) => {
    try {
      await deleteBudget(b.id);
      toast({ title: 'Presupuesto eliminado', description: `"${b.name}" y sus partidas fueron eliminados.` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e instanceof Error ? e.message : 'No se pudo eliminar.' });
    }
  }, [deleteBudget, toast]);

  const handleApplyApu = useCallback(async (templateId: string, template: Apu, workItem: WorkItem) => {
    try {
      // El total se calcula desde la plantilla que ya está en memoria: las líneas
      // copiadas llegan por realtime y esperarlas dejaría el precio en cero.
      const total = computeApu(apuItems.filter(i => i.apuId === templateId)).total;
      await applyApuToWorkItem(templateId, workItem.id);
      await setWorkItemUnitPrice(workItem.id, total);
      toast({
        title: 'APU aplicado',
        description: `"${template.name}" quedó como APU de la partida. Precio unitario: ${formatCLP(total)}.`,
      });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e instanceof Error ? e.message : 'No se pudo aplicar el APU.' });
    }
  }, [apuItems, applyApuToWorkItem, setWorkItemUnitPrice, toast]);

  const handleSyncUnitPrice = useCallback(async (workItemId: string, total: number) => {
    try {
      await setWorkItemUnitPrice(workItemId, total);
      toast({ title: 'Precio actualizado', description: `La partida quedó en ${formatCLP(total)} por unidad.` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e instanceof Error ? e.message : 'No se pudo actualizar.' });
    }
  }, [setWorkItemUnitPrice, toast]);

  const filteredItems = useMemo(() => {
    if (!workItems) return [];
    if (!searchTerm) return workItems;
    const lowerTerm = searchTerm.toLowerCase();
    return workItems.filter(item =>
      item.name.toLowerCase().includes(lowerTerm) ||
      item.path.toLowerCase().includes(lowerTerm)
    );
  }, [workItems, searchTerm]);

  const tree = useMemo(() => buildTree(filteredItems || []), [filteredItems]);

  const selectedItemLogs = useMemo(() => {
    if (!selectedItem || !progressLogs) return [];
    return progressLogs
      .filter((log: ProgressLog) => log.workItemId === selectedItem.id)
      .sort((a, b) => {
        const dateA = toDate(a.date)?.getTime() || 0;
        const dateB = toDate(b.date)?.getTime() || 0;
        return dateB - dateA;
      });
  }, [selectedItem, progressLogs]);

  const stats = useMemo(() => {
    const items = workItems || [];
    // Hojas reales del árbol (sin hijos), no por `type`: antes se filtraba con
    // `type !== 'project' && type !== 'phase'`, lo que contaba dos veces una
    // subfase que tuviera partidas dentro e inflaba el monto. Se usa el mismo
    // cálculo que el control de gastos por cliente para que los totales cuadren.
    const leaves = getLeafItems(items);
    const total = leaves.length;
    const completed = items.filter(i => i.status === 'completed').length;
    const inReview = items.filter(i => i.status === 'pending-quality-review').length;
    const inProgress = items.filter(i => i.status === 'in-progress' && i.progress > 0).length;
    const overallProgress = items.find(i => i.type === 'project')?.progress ?? 0;
    const totalBudget = sumBudgetValue(items);
    const earnedValue = sumEarnedValue(items);
    return { total, completed, inReview, inProgress, overallProgress, totalBudget, earnedValue };
  }, [workItems]);

  const formatDate = (date: Date | string | undefined | null) => {
    const jsDate = toDate(date);
    if (!jsDate) return 'N/A';
    return format(jsDate, "d MMM yyyy", { locale: es });
  };

  if (!can('module_construction_control:view')) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Acceso Denegado</AlertTitle>
        <AlertDescription>
          No tienes los permisos necesarios para acceder a este módulo.
        </AlertDescription>
      </Alert>
    );
  }

  const selectedStatus = selectedItem ? getStatusConfig(selectedItem.status, selectedItem.progress) : null;

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Partidas de Obra (EDT)"
          description="Estructura de desglose del trabajo — registra y controla el avance físico por partida."
          actions={
            can('construction_control:edit_structure') ? (
              <Button
                variant={showCreateForm ? 'secondary' : 'default'}
                size="sm"
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="gap-2"
              >
                {showCreateForm ? <ArrowLeft className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
                {showCreateForm ? 'Volver al árbol' : 'Nueva Partida'}
              </Button>
            ) : undefined
          }
        />

        {can('construction_control:edit_structure') && (
          <BudgetsPanel
            budgets={budgets}
            projects={projects}
            workItems={workItems || []}
            canEdit={can('construction_control:edit_structure')}
            onAssign={handleAssignBudget}
            onSetType={handleSetBudgetType}
            onDelete={handleDeleteBudget}
          />
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <StatTile icon={BarChart3} label="Avance General" value={`${stats.overallProgress.toFixed(1)}%`} />
          <StatTile icon={Package} label="Total Partidas" value={stats.total} />
          <StatTile icon={TrendingUp} label="En Progreso" value={stats.inProgress} tone="warning" />
          <StatTile icon={Clock} label="En Revisión" value={stats.inReview} tone="info" />
          <StatTile
            icon={DollarSign}
            label="Valor Ganado"
            value={stats.totalBudget > 0 ? `${((stats.earnedValue / stats.totalBudget) * 100).toFixed(0)}%` : '—'}
            tone="success"
            sub={stats.totalBudget > 0 ? formatCLP(stats.earnedValue) : undefined}
          />
        </div>

        {/* Main Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
          {/* Left Column: Tree or Create Form */}
          <div className="lg:col-span-2 space-y-4">
            {showCreateForm && can('construction_control:edit_structure') ? (
              <PanelCard
                title="Añadir Partida / Actividad"
                description="Construye la estructura de desglose de la obra."
                icon={Layers}
                className="border-primary/20"
              >
                <CreateWorkItemForm workItems={workItems || []} />
              </PanelCard>
            ) : (
              <PanelCard
                title="Estructura EDT"
                icon={FolderTree}
                actions={
                  (workItems || []).length > 0 ? (
                    <StatusBadge tone="neutral" className="tabular-nums">
                      {(workItems || []).length} ítems
                    </StatusBadge>
                  ) : undefined
                }
              >
                <div className="relative pb-3">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nombre o código..."
                    className="h-9 pl-9 text-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div>
                  {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-3">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">Cargando estructura...</p>
                    </div>
                  ) : tree.length > 0 ? (
                    <ScrollArea className="h-[calc(100vh-380px)] min-h-[400px]">
                      <div className="space-y-0.5 pr-3">
                        {tree.map((node, idx) => (
                          <WorkItemNode
                            key={node.id}
                            node={node}
                            onSelect={setSelectedItem}
                            selectedId={selectedItem?.id || null}
                            isLast={idx === tree.length - 1}
                          />
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
                      <div className="rounded-2xl border border-dashed border-border bg-muted p-5">
                        <FolderTree className="h-10 w-10 text-muted-foreground opacity-50" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          {searchTerm ? 'Sin resultados' : 'Sin estructura definida'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {searchTerm
                            ? `No se encontraron partidas para "${searchTerm}"`
                            : 'Crea tu primera partida, o parte de una plantilla de ejemplo.'
                          }
                        </p>
                      </div>
                      {!searchTerm && can('construction_control:edit_structure') && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2 mt-1"
                          onClick={handleImportTemplate}
                          disabled={isImporting}
                        >
                          {isImporting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4 text-primary" />
                          )}
                          {isImporting ? 'Importando...' : 'Importar plantilla de ejemplo'}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </PanelCard>
            )}
          </div>

          {/* Right Column: Detail Panel */}
          <div className="lg:col-span-3 lg:sticky lg:top-6">
            <SurfaceCard interactive={false} className="min-h-[60vh]">
              {selectedItem && selectedStatus ? (
                <>
                  {/* Detail Header */}
                  <div className="border-b border-border p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-grow">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-base">{getTypeIcon(selectedItem.type)}</span>
                          <StatusBadge tone="neutral" className="h-5 px-1.5 font-mono text-[10px]">
                            {selectedItem.path}
                          </StatusBadge>
                          <StatusBadge tone={selectedStatus.tone} icon={selectedStatus.icon} className="h-5 px-1.5 text-[10px]">
                            {selectedStatus.label}
                          </StatusBadge>
                        </div>
                        <h2 className="text-lg font-bold leading-snug tracking-tight">{selectedItem.name}</h2>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn(
                          'text-2xl font-bold tabular-nums',
                          selectedItem.progress >= 100 ? 'text-success' : 'text-primary'
                        )}>
                          {selectedItem.progress.toFixed(1)}%
                        </p>
                        <p className="text-[11px] text-muted-foreground">avance</p>
                      </div>
                    </div>
                    <Progress
                      value={selectedItem.progress}
                      className="mt-2 h-2"
                      indicatorClassName={getProgressColor(selectedItem.progress)}
                    />
                  </div>

                  <div className="p-5">
                    {/* Info Grid */}
                    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        { label: 'Unidad', value: selectedItem.unit, mono: true },
                        { label: 'Cantidad', value: selectedItem.quantity.toLocaleString('es-CL'), mono: true },
                        { label: 'P. Unitario', value: formatCLP(selectedItem.unitPrice) },
                        { label: 'Costo Total', value: formatCLP(selectedItem.quantity * selectedItem.unitPrice), bold: true },
                      ].map((item) => (
                        <div key={item.label} className="rounded-xl border border-border bg-muted/40 p-3">
                          <p className="mb-0.5 text-[11px] text-muted-foreground">{item.label}</p>
                          <p className={cn(
                            'text-sm truncate',
                            item.mono && 'font-mono',
                            item.bold ? 'font-bold text-primary' : 'font-semibold'
                          )}>
                            {item.value}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Tabs: Avance / Historial */}
                    <Tabs defaultValue="progress" className="w-full">
                      <TabsList className="w-full grid grid-cols-3 h-9">
                        <TabsTrigger value="progress" className="text-xs gap-1.5">
                          <TrendingUp className="h-3.5 w-3.5" /> Avance
                        </TabsTrigger>
                        <TabsTrigger value="apu" className="text-xs gap-1.5">
                          <Calculator className="h-3.5 w-3.5" /> APU
                        </TabsTrigger>
                        <TabsTrigger value="history" className="text-xs gap-1.5">
                          <History className="h-3.5 w-3.5" /> Historial
                          {selectedItemLogs.length > 0 && (
                            <StatusBadge tone="neutral" className="ml-1 h-4 px-1 text-[10px]">
                              {selectedItemLogs.length}
                            </StatusBadge>
                          )}
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="progress" className="mt-3">
                        <RegisterProgressForm workItem={selectedItem} />
                      </TabsContent>

                      <TabsContent value="apu" className="mt-3">
                        <WorkItemApuPanel
                          workItem={selectedItem}
                          apus={apus}
                          apuItems={apuItems}
                          canEdit={can('construction_control:edit_structure')}
                          onApply={(templateId, template) => handleApplyApu(templateId, template, selectedItem)}
                          onSyncPrice={(total) => handleSyncUnitPrice(selectedItem.id, total)}
                        />
                      </TabsContent>

                      <TabsContent value="history" className="mt-3">
                        <div className="rounded-2xl border border-border bg-muted/40 p-4">
                            <ScrollArea className="max-h-[320px]">
                              {selectedItemLogs.length > 0 ? (
                                <Table>
                                  <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                      <TableHead className="text-xs h-8">Fecha</TableHead>
                                      <TableHead className="text-xs h-8 text-right">Cantidad</TableHead>
                                      <TableHead className="text-xs h-8">Usuario</TableHead>
                                      <TableHead className="text-xs h-8">Observaciones</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {selectedItemLogs.map((log, idx) => (
                                      <TableRow key={log.id} className={cn(idx === 0 && 'bg-primary/5')}>
                                        <TableCell className="text-xs py-2.5">
                                          {formatDate(log.date)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-xs py-2.5 font-semibold">
                                          {log.quantity.toLocaleString('es-CL')}
                                        </TableCell>
                                        <TableCell className="text-xs py-2.5">{log.userName}</TableCell>
                                        <TableCell className="text-xs py-2.5 text-muted-foreground max-w-[180px] truncate">
                                          {log.observations || '—'}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              ) : (
                                <div className="flex flex-col items-center justify-center gap-2 py-12">
                                  <History className="h-8 w-8 text-muted-foreground opacity-40" />
                                  <p className="text-sm text-muted-foreground">Sin registros de avance</p>
                                  <p className="text-xs text-muted-foreground">Los avances registrados aparecerán aquí.</p>
                                </div>
                              )}
                            </ScrollArea>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </div>
                </>
              ) : (
                /* Empty State */
                <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-5">
                  <div className="relative">
                    <div className="absolute inset-0 animate-ping rounded-full bg-primary/5" style={{ animationDuration: '3s' }} />
                    <div className="relative rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/10 to-primary/5 p-6">
                      <FileText className="h-12 w-12 text-primary/40" />
                    </div>
                  </div>
                  <div className="max-w-xs text-center">
                    <h3 className="mb-1 font-bold tracking-tight text-foreground">Selecciona una partida</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Haz clic en cualquier ítem de la estructura EDT para ver sus detalles, registrar avance y consultar el historial.
                    </p>
                  </div>
                </div>
              )}
            </SurfaceCard>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
