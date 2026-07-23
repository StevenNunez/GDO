
'use client';

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { useAuth, useAppState } from '@/modules/core/contexts/app-provider';
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  FolderTree,
  GanttChartSquare,
  TrendingUp,
  DollarSign,
  Briefcase,
  CalendarCheck,
  ArrowLeft,
  Info,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { PanelCard } from '@/components/ui/panel-card';
import { StatTile } from '@/components/ui/stat-tile';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatCLP } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { WorkItem, ProgressLog } from '@/modules/core/lib/data';
import { RegisterProgressForm } from '@/components/operations/register-progress-form';
import { cn } from '@/lib/utils';
import { toDate } from '@/lib/date-utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, eachDayOfInterval, differenceInDays, startOfDay, isAfter, isBefore } from 'date-fns';
import { es } from 'date-fns/locale';
import { Progress } from '@/components/ui/progress';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

// Importación dinámica de Gantt para evitar errores de SSR
const Gantt = dynamic(() => import('gantt-task-react').then(mod => mod.Gantt), {
  ssr: false,
  loading: () => <div className="h-[300px] flex items-center justify-center bg-muted/10 text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin" /></div>
});
import { ViewMode, type Task } from 'gantt-task-react';
import 'gantt-task-react/dist/index.css'; // Asegúrate de importar los estilos

// --- Tipos y Helpers ---

type TreeWorkItem = WorkItem & { children: TreeWorkItem[] };

/**
 * Construye un árbol jerárquico a partir de una lista plana de items, 
 * filtrando solo la rama que pertenece al contrato (rootId) especificado.
 */
const buildTree = (items: WorkItem[], rootId: string): TreeWorkItem[] => {
  const itemMap = new Map<string, TreeWorkItem>();
  const roots: TreeWorkItem[] = [];

  // 1. Inicializar nodos
  items.forEach(item => {
    itemMap.set(item.id, { ...item, children: [] });
  });

  // 2. Construir relaciones
  items.forEach(item => {
    if (item.id === rootId) {
        roots.push(itemMap.get(item.id)!);
    } else if (item.parentId && itemMap.has(item.parentId)) {
      // Verificar recursivamente si este ítem pertenece al árbol del contrato
      const current = itemMap.get(item.id);
      const parent = itemMap.get(item.parentId);
      
      // Solo agregamos si el padre existe en nuestro mapa (es parte del contrato)
      if (parent) {
          parent.children.push(current!);
      }
    }
  });

  const sortRecursive = (nodes: TreeWorkItem[]) => {
    nodes.sort((a, b) => (a.path || '').localeCompare(b.path || ''));
    nodes.forEach(n => sortRecursive(n.children));
  };
  
  // Encontrar el nodo raíz del proyecto actual
  const projectNode = roots.find(node => node.id === rootId);
  
  // Si encontramos el contrato raíz, devolvemos ese nodo (y sus hijos ya enlazados)
  // Si no, buscamos en los items si alguno es el rootId (caso borde)
  const actualRoot = projectNode || itemMap.get(rootId);

  if (actualRoot) {
    sortRecursive(actualRoot.children);
    return [actualRoot];
  }

  return [];
};

// --- Componentes UI Internos ---

const WorkItemNode = ({
  node,
  level = 0,
  onSelect,
  onDoubleClick,
  selectedId,
}: {
  node: TreeWorkItem;
  level?: number;
  onSelect: (item: WorkItem) => void;
  onDoubleClick: (item: WorkItem) => void;
  selectedId: string | null;
}) => {
  // Expandir automáticamente los primeros 2 niveles
  const [isExpanded, setIsExpanded] = useState(level < 2);
  const hasChildren = node.children.length > 0;
  const progress = node.progress || 0;
  const isSelected = selectedId === node.id;

  return (
    <div className="relative select-none">
      <div
        onClick={() => onSelect(node)}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(node); }}
        className={cn(
          'flex items-center gap-2 py-2 px-2 rounded-lg cursor-pointer transition-all duration-200 border border-transparent',
          isSelected 
            ? 'bg-primary/10 border-primary/30 shadow-sm' 
            : 'hover:bg-muted/50'
        )}
        style={{ marginLeft: `${level * 1.2}rem` }}
      >
        {/* Línea guía visual para la jerarquía */}
        {level > 0 && (
            <div className="absolute left-0 top-0 bottom-0 border-l border-dashed border-border" style={{ left: `${(level * 1.2) - 0.6}rem` }} />
        )}

        <button
            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
            className={cn(
                "p-0.5 rounded-md hover:bg-muted-foreground/10 transition-colors h-5 w-5 flex items-center justify-center shrink-0 text-muted-foreground",
                !hasChildren && "invisible"
            )}
        >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <div className="flex-grow min-w-0 grid gap-1">
            <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm truncate text-foreground flex items-center gap-2" title={node.name}>
                    <StatusBadge tone="neutral" className="h-5 px-1 py-0 font-mono text-[10px]">{node.path}</StatusBadge>
                    {node.name}
                </span>
            </div>
            {/* Barra de progreso mini */}
            <div className="flex items-center gap-2">
                <Progress value={progress} className="h-1.5 flex-grow bg-muted" indicatorClassName={progress >= 100 ? "bg-success" : "bg-info"} />
            </div>
        </div>
        
        <span className={cn(
            "text-[10px] font-mono font-bold w-10 text-right shrink-0",
            progress >= 100 ? "text-success" : "text-muted-foreground"
        )}>
            {progress.toFixed(0)}%
        </span>
      </div>

      {hasChildren && isExpanded && (
        <div className="animate-in slide-in-from-top-1 fade-in duration-200">
          {node.children.map((child) => (
            <WorkItemNode
              key={child.id}
              node={child}
              level={level + 1}
              onSelect={onSelect}
              onDoubleClick={onDoubleClick}
              selectedId={selectedId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const WorkItemTree = ({ workItems, onSelect, onDoubleClick, selectedId, rootId }: { workItems: WorkItem[], onSelect: (item: WorkItem) => void, onDoubleClick: (item: WorkItem) => void, selectedId: string | null, rootId: string }) => {
    const tree = useMemo(() => buildTree(workItems || [], rootId), [workItems, rootId]);

    if (!workItems.length) return <div className="p-4 text-center text-sm text-muted-foreground">No hay partidas disponibles.</div>;

    return (
        <ScrollArea className="h-[500px] border rounded-md bg-card/50">
            <div className="p-2 space-y-1">
                {tree.map((node) => (
                    <WorkItemNode
                        key={node.id}
                        node={node}
                        onSelect={onSelect}
                        onDoubleClick={onDoubleClick}
                        selectedId={selectedId}
                        level={0}
                    />
                ))}
            </div>
        </ScrollArea>
    );
};

// --- Componente Principal ---

export default function ContractorContractDetailPage() {
  const router = useRouter();
  const params = useParams();
  const contractId = params.id as string;
  
  const { user } = useAuth();
  const { workItems, isLoading, progressLogs } = useAppState();
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);
  const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Week); // Estado para vista Gantt

  // 1. Obtener Contrato y sus Ítems (Jerarquía)
  const { contract, contractItems } = useMemo(() => {
    if (!workItems || !user || !contractId) return { contract: null, contractItems: [] };
    
    // Obtener todos los items donde el usuario es responsable o creador
    const allUserItems = workItems.filter(item => item.assignedTo === user.id || item.createdBy === user.id);
    
    // Buscar el contrato raíz
    const contract = allUserItems.find(item => item.id === contractId);

    if (!contract) return { contract: null, contractItems: [] };

    // Construir lista plana de todos los hijos de este contrato
    const itemsForThisContract: WorkItem[] = [contract];
    const findChildren = (parentId: string) => {
        const children = allUserItems.filter(item => item.parentId === parentId);
        children.forEach(child => {
            itemsForThisContract.push(child);
            findChildren(child.id);
        });
    };
    findChildren(contractId);

    return { contract, contractItems: itemsForThisContract };
  }, [workItems, user, contractId]);
  
  // 2. Preparar tareas para Gantt con Jerarquía
  const tasksForGantt = useMemo(() => contractItems.map((item: WorkItem): Task => {
        const isProject = 'children' in item && Array.isArray(item.children) && item.children.length > 0 || item.id === contractId;
        return {
            id: item.id,
            name: item.name,
            type: 'task', // Usamos 'task' genérico pero agrupamos con 'project' property
            project: item.parentId || undefined, // Esto permite el agrupamiento en la librería Gantt
            start: item.plannedStartDate ? new Date(item.plannedStartDate) : new Date(),
            end: item.plannedEndDate ? new Date(item.plannedEndDate) : new Date(),
            progress: item.progress || 0,
            isDisabled: true, // Solo lectura
            styles: { 
                progressColor: progressLogs?.some(l => l.workItemId === item.id) ? '#10b981' : '#3b82f6', // Verde si hay avance, Azul si no
                progressSelectedColor: '#10b981', 
                backgroundColor: isProject ? '#8b5cf6' : '#3b82f6', // Púrpura para padres, Azul para hijos
                backgroundSelectedColor: '#2563eb' 
            },
            // Ocultar hijos por defecto en el Gantt si son muchos puede ser útil, aquí los mostramos
            hideChildren: false 
        };
    }).sort((a,b) => a.start.getTime() - b.start.getTime()), [contractItems, contractId, progressLogs]);

  // 3. Calcular Curva S y KPIs Financieros (Optimizado)
  const { sCurveData, financialKPIs, spi } = useMemo(() => {
    if (tasksForGantt.length === 0 || !contract) return { sCurveData: [], financialKPIs: { totalContract: 0, earnedValue: 0, progressWeighted: 0 }, spi: 0 };
    
    // Filtrar fechas válidas
    const validTasks = tasksForGantt.filter(t => !isNaN(t.start.getTime()) && !isNaN(t.end.getTime()));
    if(validTasks.length === 0) return { sCurveData: [], financialKPIs: { totalContract: 0, earnedValue: 0, progressWeighted: 0 }, spi: 0 };
    
    const projectStart = new Date(Math.min(...validTasks.map(d => d.start.getTime())));
    const projectEnd = new Date(Math.max(...validTasks.map(d => d.end.getTime())));
    
    // Buffer visual para la gráfica
    const chartEnd = new Date(Math.max(projectEnd.getTime(), new Date().getTime()));
    const dateRange = eachDayOfInterval({ start: projectStart, end: chartEnd });
    
    const totalContractValue = contractItems.reduce((acc, item) => acc + ((item.quantity || 0) * (item.unitPrice || 0)), 0);
    const totalEarnedValue = contractItems.reduce((acc, item) => acc + ((item.quantity || 0) * (item.unitPrice || 0) * (item.progress || 0) / 100), 0);

    const today = startOfDay(new Date());
    let currentPlannedValue = 0;

    const sCurve = dateRange.map(day => {
        let dailyPlanned = 0;
        
        contractItems.forEach(item => {
            if (!item.plannedStartDate || !item.plannedEndDate || item.id === contractId) return; // Ignorar raíz para suma
            
            const taskStart = startOfDay(new Date(item.plannedStartDate));
            const taskEnd = startOfDay(new Date(item.plannedEndDate));
            const duration = differenceInDays(taskEnd, taskStart) + 1;
            const itemValue = (item.quantity || 0) * (item.unitPrice || 0);
            
            if (duration > 0 && totalContractValue > 0) {
               const weight = itemValue / totalContractValue;
               
               if (isAfter(day, taskEnd)) {
                   dailyPlanned += (100 * weight);
               } else if (!isBefore(day, taskStart)) {
                   const daysPassed = differenceInDays(day, taskStart) + 1;
                   const progressPercent = (daysPassed / duration) * 100;
                   dailyPlanned += (progressPercent * weight);
               }
            }
        });

        // Capturar el valor planificado a la fecha de hoy para el SPI
        if (day.getTime() === today.getTime()) {
            currentPlannedValue = dailyPlanned;
        }

        return {
            date: format(day, 'dd/MM', { locale: es }),
            timestamp: day.getTime(),
            Planificado: Math.min(100, Math.round(dailyPlanned)),
            // Solo mostramos la curva Real hasta el día de hoy
            Real: isAfter(day, today) ? null : Math.min(100, Math.round((totalEarnedValue / totalContractValue) * 100) || 0)
        };
    });

    // SPI (Schedule Performance Index) = EV / PV
    const currentProgressPercent = totalContractValue > 0 ? (totalEarnedValue / totalContractValue) * 100 : 0;
    const spiValue = currentPlannedValue > 0 ? currentProgressPercent / currentPlannedValue : 1;

    return { 
        sCurveData: sCurve, 
        financialKPIs: { 
            totalContract: totalContractValue, 
            earnedValue: totalEarnedValue,
            progressWeighted: currentProgressPercent
        },
        spi: spiValue
    };
  }, [tasksForGantt, contractItems, contract, contractId]);
  
  // 4. Logs del ítem seleccionado
  const selectedItemLogs = useMemo(() => {
    if (!selectedItem || !progressLogs) return [];
    return progressLogs
      .filter((log: ProgressLog) => log.workItemId === selectedItem.id)
      .sort((a, b) => {
        const dateA = toDate(a.date)?.getTime() ?? 0;
        const dateB = toDate(b.date)?.getTime() ?? 0;
        return dateB - dateA;
      });
  }, [selectedItem, progressLogs]);
  
  const handleDoubleClick = (item: WorkItem) => {
    // Permitir registrar avance en cualquier nivel excepto si es el proyecto raíz abstracto
    if (item.id !== contractId) {
      setSelectedItem(item);
      setIsProgressModalOpen(true);
    }
  };

  const formatDate = (date: Date | string | undefined) => {
    const jsDate = toDate(date);
    if (!jsDate) return 'N/A';
    return format(jsDate, "dd MMM yyyy", { locale: es });
  };
  
  if (isLoading) {
      return (
          <div className="flex h-[80vh] items-center justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary"/>
          </div>
      )
  }

  if (!contract) {
      return (
        <div className="text-center py-20">
            <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                <Briefcase className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Contrato no encontrado</h2>
            <p className="text-muted-foreground mb-6">El contrato que buscas no existe o no tienes permiso para verlo.</p>
            <Button onClick={() => router.push('/dashboard/estado-pago/contratos')}>
                <ArrowLeft className="mr-2 h-4 w-4"/> Volver a mis contratos
            </Button>
        </div>
      )
  }

  return (
    <div className="flex flex-col gap-8 fade-in pb-12">
       {/* Estilos locales para Gantt */}
       <style jsx global>{`
        .gantt-container { --gantt-font-family: var(--font-sans), system-ui, sans-serif; }
        .gantt-container ._3_pmuJ, .gantt-container ._291r0X, .gantt-container ._1n_4l- { background-color: hsl(var(--card)) !important; color: hsl(var(--foreground)); }
        .gantt-container ._3_pmuJ button { color: hsl(var(--muted-foreground)) !important; font-weight: 600; }
        .gantt-container ._2-D47- { stroke: hsl(var(--border)) !important; }
        .gantt-container ._1YV57- { stroke: #8b5cf6 !important; stroke-width: 2px; } /* Today line */
      `}</style>

       {selectedItem && (
        <Dialog open={isProgressModalOpen} onOpenChange={setIsProgressModalOpen}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CalendarCheck className="h-5 w-5 text-primary"/> Registrar Avance
                    </DialogTitle>
                    <DialogDescription>
                        Actualizando: <span className="font-semibold text-foreground">{selectedItem.name}</span>
                    </DialogDescription>
                </DialogHeader>
                <RegisterProgressForm workItem={selectedItem} onSuccess={() => setIsProgressModalOpen(false)} />
            </DialogContent>
        </Dialog>
      )}

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/estado-pago/contratos')} className="hover:bg-muted/50">
            <ArrowLeft className="h-5 w-5"/>
        </Button>
        <div className="space-y-1">
            <PageHeader 
                title={contract.name}
                description={`Contrato #${contract.id.substring(0,8).toUpperCase()} • ${user?.name.split(' ')[0] || 'Contratista'}`}
                className="mb-0 border-0 pb-0"
            />
        </div>
      </div>

      {/* --- KPI CARDS (Resumen Financiero) --- */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatTile label="Monto Total" value={formatCLP(financialKPIs.totalContract)} icon={DollarSign} tone="info" />
          <StatTile label="Valor Ganado" value={formatCLP(financialKPIs.earnedValue)} icon={TrendingUp} tone="success" />
          <StatTile label="Avance Ponderado" value={`${financialKPIs.progressWeighted.toFixed(1)}%`} icon={Briefcase} />
          <StatTile
              label="SPI (Eficiencia)"
              value={`${spi.toFixed(2)}x`}
              icon={spi >= 1 ? CheckCircle2 : AlertTriangle}
              tone={spi >= 1 ? 'success' : 'danger'}
              sub={spi >= 1 ? 'Adelantado' : 'Retrasado'}
          />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-4 space-y-6">
            <PanelCard
                title="Estructura WBS"
                description="Haz doble clic para registrar avance."
                icon={FolderTree}
                className="flex h-[600px] flex-col"
                contentClassName="flex-1 overflow-hidden px-0 pb-0"
            >
                    <WorkItemTree
                        workItems={contractItems}
                        onSelect={setSelectedItem}
                        onDoubleClick={handleDoubleClick}
                        selectedId={selectedItem?.id || null}
                        rootId={contractId}
                    />
            </PanelCard>
        </div>

        <div className="lg:col-span-8 space-y-6">
            {selectedItem ? (
                 <PanelCard
                    icon={FolderTree}
                    title={selectedItem.name}
                    description={<><span className="mr-1 font-mono">{selectedItem.path}</span>· P. Unitario: <span className="font-mono font-medium text-foreground">{formatCLP(selectedItem.unitPrice)}</span> · Cantidad: {selectedItem.quantity.toLocaleString()} {selectedItem.unit}</>}
                    contentClassName="px-0 pb-0"
                    actions={
                        <Button onClick={() => setIsProgressModalOpen(true)} className="bg-success text-background hover:bg-success/90">
                            <CalendarCheck className="mr-2 h-4 w-4"/> Registrar Avance
                        </Button>
                    }
                 >
                        <div className="grid grid-cols-1 gap-4 border-y border-border bg-muted/40 p-6 text-center sm:grid-cols-3">
                            <div>
                                <p className="text-xs font-bold uppercase text-muted-foreground">Avance Actual</p>
                                <p className="text-2xl font-bold tracking-tighter text-success">{selectedItem.progress || 0}%</p>
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase text-muted-foreground">Por Ejecutar</p>
                                <p className="text-2xl font-bold tracking-tighter text-info">{100 - (selectedItem.progress || 0)}%</p>
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase text-muted-foreground">Valor Ejecutado</p>
                                <p className="text-2xl font-bold tracking-tighter text-foreground">
                                    {formatCLP((selectedItem.quantity * selectedItem.unitPrice) * (selectedItem.progress || 0) / 100)}
                                </p>
                            </div>
                        </div>

                        <div className="p-4">
                            <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                <Info className="h-4 w-4"/> Historial de Registros
                            </h4>
                            <ScrollArea className="h-[250px] rounded-md border border-border">
                                <Table>
                                    <TableHeader className="bg-muted/50 sticky top-0">
                                        <TableRow>
                                            <TableHead className="w-[120px]">Fecha</TableHead>
                                            <TableHead className="text-right">Cantidad</TableHead>
                                            <TableHead>Usuario</TableHead>
                                            <TableHead className="w-[40%]">Observaciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {selectedItemLogs.length > 0 ? (
                                            selectedItemLogs.map(log => (
                                                <TableRow key={log.id}>
                                                    <TableCell className="font-mono text-xs w-28">{formatDate(log.date)}</TableCell>
                                                    <TableCell className="text-right font-bold text-success w-24">+{log.quantity.toLocaleString()}</TableCell>
                                                    <TableCell className="text-xs text-muted-foreground">{log.userName}</TableCell>
                                                    <TableCell className="text-xs text-muted-foreground italic truncate max-w-[200px]">{log.observations || "-"}</TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow><TableCell colSpan={4} className="text-center h-24 text-muted-foreground">Sin historial de avance.</TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </div>
                </PanelCard>
            ) : (
                <div className="flex h-[500px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border bg-card text-muted-foreground">
                    <div className="mb-6 animate-pulse rounded-full bg-muted p-6">
                        <CalendarCheck className="h-12 w-12 text-muted-foreground/50" />
                    </div>
                    <h3 className="text-xl font-bold tracking-tight text-foreground">Selecciona una Partida</h3>
                    <p className="max-w-md text-center mt-2 text-sm">
                        Navega por la estructura a la izquierda y selecciona una actividad para ver sus detalles, presupuesto y registrar avances físicos.
                    </p>
                </div>
            )}
        </div>
      </div>
      
     <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-4">
         <PanelCard
           title="Cronograma Maestro"
           icon={GanttChartSquare}
           contentClassName="min-h-[350px] overflow-hidden px-0 pb-0"
           actions={
               <div className="flex gap-1 rounded-md bg-muted p-1">
                   <Button variant={viewMode === ViewMode.Day ? 'secondary' : 'ghost'} size="sm" className="h-6 px-2 text-xs" onClick={() => setViewMode(ViewMode.Day)}>Día</Button>
                   <Button variant={viewMode === ViewMode.Week ? 'secondary' : 'ghost'} size="sm" className="h-6 px-2 text-xs" onClick={() => setViewMode(ViewMode.Week)}>Sem</Button>
                   <Button variant={viewMode === ViewMode.Month ? 'secondary' : 'ghost'} size="sm" className="h-6 px-2 text-xs" onClick={() => setViewMode(ViewMode.Month)}>Mes</Button>
               </div>
           }
         >
             {tasksForGantt.length > 0 ? (
                 <div className="w-full overflow-x-auto p-4 gantt-container">
                     <div className="min-w-[600px]">
                         <Gantt 
                            tasks={tasksForGantt} 
                            viewMode={viewMode} 
                            locale="es" 
                            columnWidth={viewMode === ViewMode.Month ? 300 : 60}
                            listCellWidth=""
                            barFill={80}
                            barCornerRadius={4}
                            projectProgressColor="#10b981"
                            projectProgressSelectedColor="#059669"
                         />
                     </div>
                 </div>
             ) : (
                 <div className="flex h-[300px] items-center justify-center text-muted-foreground"><Info className="mr-2 h-4 w-4"/> No hay datos de planificación.</div>
             )}
       </PanelCard>

       <PanelCard
           title="Curva S de Valor Ganado"
           description="Evolución financiera: Planificado vs Ejecutado Real."
           icon={TrendingUp}
       >
                <div className="h-[300px] w-full">
                   <ResponsiveContainer width="100%" height="100%">
                   <AreaChart data={sCurveData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                       <defs>
                           <linearGradient id="colorPlanned" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/><stop offset="95%" stopColor="#8884d8" stopOpacity={0}/></linearGradient>
                           <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8}/><stop offset="95%" stopColor="#82ca9d" stopOpacity={0}/></linearGradient>
                       </defs>
                       <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                       <YAxis unit="%" fontSize={12} tickLine={false} axisLine={false} />
                       <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                       <RechartsTooltip 
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            formatter={(value: any) => [`${value}%`, '']}
                       />
                       <Legend verticalAlign="top" height={36}/>
                       <Area type="monotone" dataKey="Planificado" stroke="#8884d8" fillOpacity={1} fill="url(#colorPlanned)" strokeWidth={2} />
                       <Area type="monotone" dataKey="Real" stroke="#82ca9d" fillOpacity={1} fill="url(#colorReal)" strokeWidth={2} connectNulls />
                   </AreaChart>
                   </ResponsiveContainer>
                </div>
       </PanelCard>
     </div>

    </div>
  );
}