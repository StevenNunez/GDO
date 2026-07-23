
'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { PageHeader } from '@/components/page-header';
import { PanelCard } from '@/components/ui/panel-card';
import { StatTile } from '@/components/ui/stat-tile';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Calendar, Trash2, Layers,
  Users, Search, Clock, TrendingUp, TrendingDown, ChevronsRightLeft, Edit,
  Loader2, BarChart3, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { Gantt, Task, ViewMode } from 'gantt-task-react';
import 'gantt-task-react/dist/index.css';
import { useToast } from '@/modules/core/hooks/use-toast';
import { useAppState } from '@/modules/core/contexts/app-provider';
import type { User as UserType, WorkItem } from '@/modules/core/lib/data';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { cn } from '@/lib/utils';
import { eachDayOfInterval, differenceInDays, startOfDay, format } from 'date-fns';
import { es } from 'date-fns/locale';

// --- Estilos Globales para el Gantt ---
const GanttCustomStyles = () => (
  <style>{`
    .gantt-container {
      --gantt-font-family: var(--font-sans), system-ui, sans-serif;
    }
    /* Header & table cells */
    .gantt-container [class*="ganttTable_"],
    .gantt-container [class*="calendar"] {
      background-color: hsl(var(--card)) !important;
      color: hsl(var(--foreground)) !important;
    }
    .gantt-container [class*="ganttTable_"] [class*="Header"] {
      color: hsl(var(--muted-foreground)) !important;
      font-weight: 600;
    }
    /* Grid lines */
    .gantt-container [class*="gridRow"] line,
    .gantt-container [class*="grid"] line {
      stroke: hsl(var(--border)) !important;
    }
    /* Weekend shading */
    .gantt-container [class*="weekend"],
    .gantt-container rect[class*="weekend"] {
      fill: hsl(var(--muted) / 0.3) !important;
    }
    /* Today line */
    .gantt-container [class*="today"] line,
    .gantt-container [class*="Today"] {
      stroke: hsl(var(--primary)) !important;
      stroke-width: 2 !important;
    }
    /* Task bars rounded */
    .gantt-container rect[class*="bar"] {
      rx: 6;
      ry: 6;
    }
    /* Scrollbar */
    .gantt-container ::-webkit-scrollbar { width: 6px; height: 6px; }
    .gantt-container ::-webkit-scrollbar-track { background: transparent; }
    .gantt-container ::-webkit-scrollbar-thumb { background: hsl(var(--muted-foreground) / 0.2); border-radius: 3px; }
    .gantt-container ::-webkit-scrollbar-thumb:hover { background: hsl(var(--muted-foreground) / 0.4); }
    /* Fallback for hashed class names */
    .gantt-container ._3_pmuJ, .gantt-container ._291r0X, .gantt-container ._1n_4l- {
      background-color: hsl(var(--card)) !important;
    }
    .gantt-container ._3_pmuJ button, .gantt-container ._1n_4l- > div {
      color: hsl(var(--muted-foreground)) !important; font-weight: 500;
    }
    .gantt-container ._1n_4l- ._3Yt5l-, .gantt-container ._291r0X div {
      color: hsl(var(--foreground)) !important;
    }
    .gantt-container ._2-D47- { stroke: hsl(var(--border)) !important; }
    .gantt-container ._2IsDI_ { fill: hsl(var(--muted) / 0.3) !important; }
    .gantt-container ._1YV57- { stroke: hsl(var(--primary)) !important; }
  `}</style>
);

// --- Tipos Extendidos ---
interface TaskType extends Task {
  description?: string;
  assignees?: string[]; // La librería usa 'assignees', nosotros usaremos 'assignedTo'
  plannedProgress?: number;
  assignedTo?: string | null;
}

export default function GanttChartPage() {
  const { users, workItems, updateWorkItem, deleteWorkItem } = useAppState();
  const { toast } = useToast();
  
  const [tasks, setTasks] = useState<TaskType[]>([]);
  const [view, setView] = useState<ViewMode>(ViewMode.Week);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentTask, setCurrentTask] = useState<Partial<TaskType>>({});
  const [isEditing, setIsEditing] = useState(false);

  const { isLoading } = useAppState();

  // Mapear workItems a Tasks de Gantt cada vez que workItems cambie
  useEffect(() => {
    if (workItems) {
      const ganttTasks: TaskType[] = workItems.map((item: WorkItem): TaskType => ({
        id: item.id,
        name: item.name,
        type: item.type === 'project' || item.type === 'phase' || item.type === 'subphase' ? 'project' : 'task',
        start: item.plannedStartDate ? new Date(item.plannedStartDate) : new Date(),
        end: item.plannedEndDate ? new Date(item.plannedEndDate) : new Date(),
        progress: item.progress || 0,
        project: item.parentId || undefined,
        hideChildren: false,
        assignedTo: (item as any).assignedTo,
      }));
      setTasks(ganttTasks);
    }
  }, [workItems]);

  // Stats calculadas
  const stats = useMemo(() => {
    const items = workItems || [];
    const leaves = items.filter(i => i.type !== 'project' && i.type !== 'phase');
    const completed = items.filter(i => i.status === 'completed').length;
    const overallProgress = items.find(i => i.type === 'project')?.progress ?? 0;
    const noDates = items.filter(i => !i.plannedStartDate || !i.plannedEndDate).length;
    return { total: items.length, leaves: leaves.length, completed, overallProgress, noDates };
  }, [workItems]);


  const filteredTasks = useMemo(() => {
    if (!searchTerm) return tasks;
    return tasks.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [tasks, searchTerm]);

  const handleTaskChange = useCallback(async (task: Task) => {
    try {
      await updateWorkItem(task.id, { plannedStartDate: task.start, plannedEndDate: task.end });
      // El estado se actualizará automáticamente a través del useEffect cuando workItems cambie
    } catch(e) {
      toast({ title: 'Error al actualizar', description: 'No se pudo guardar la nueva fecha.', variant: 'destructive'});
    }
  }, [updateWorkItem, toast]);

  const handleProgressChange = useCallback(async (task: Task) => {
    try {
      await updateWorkItem(task.id, { progress: task.progress });
      // El estado se actualizará automáticamente
    } catch(e) {
       toast({ title: 'Error', description: 'No se pudo actualizar el progreso.', variant: 'destructive'});
    }
  }, [toast, updateWorkItem]);

  const handleDblClick = useCallback((task: Task) => {
    const workItem = workItems.find(item => item.id === task.id);
    if(workItem) {
        setCurrentTask({
            ...task,
            assignedTo: (workItem as any).assignedTo,
        });
        setIsEditing(true);
        setIsModalOpen(true);
    }
  }, [workItems]);

  const handleDelete = useCallback(async (task: Task) => {
    try {
        await deleteWorkItem(task.id);
        toast({ title: "Tarea eliminada", variant: "destructive" });
        setIsModalOpen(false);
    } catch (e) {
      toast({ title: "Error", description: "No se pudo eliminar la tarea.", variant: "destructive" });
    }
  }, [deleteWorkItem, toast]);

  const handleExpanderClick = useCallback((task: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, hideChildren: !t.hideChildren } : t)));
  }, []);


const handleSaveTask = async () => {
    if (!currentTask.name?.trim() || !currentTask.start || !currentTask.end || currentTask.start > currentTask.end) {
      toast({ title: "Datos inválidos", description: "Revisa el nombre y las fechas.", variant: "destructive" });
      return;
    }

    try {
        if (isEditing) {
            const originalItem = workItems.find(item => item.id === currentTask.id);
            if (!originalItem) {
                throw new Error("No se encontró la tarea original para actualizar.");
            }
            
            const taskToSave: Partial<WorkItem> = {
                ...originalItem,
                name: currentTask.name,
                type: currentTask.type as WorkItem['type'],
                parentId: currentTask.project || null,
                plannedStartDate: currentTask.start,
                plannedEndDate: currentTask.end,
                progress: currentTask.progress,
                assignedTo: currentTask.assignedTo,
            };

            await updateWorkItem(currentTask.id!, taskToSave);
            toast({ title: "Tarea actualizada" });
        } else {
            // La creación es manejada por el módulo EDT, aquí solo mostramos una advertencia.
            toast({ title: "Acción Desactivada", description: "Crea nuevas tareas desde el módulo 'Partidas (EDT)' para mantener la consistencia del proyecto." });
        }
        setIsModalOpen(false);
    } catch(e: any) {
        toast({ title: "Error", description: e.message || "No se pudo guardar la tarea.", variant: 'destructive'});
    }
  };

  const dateToString = (date?: Date) => date ? date.toISOString().split('T')[0] : '';
  const stringToDate = (str: string) => {
      if(!str) return undefined;
      const [y, m, d] = str.split('-').map(Number);
      return new Date(y, m - 1, d);
  };
  
  // --- Lógica de Curva S y SPI ---
  const { sCurveData, projectSPI, todayLabel } = useMemo(() => {
    if (tasks.length === 0) return { sCurveData: [], projectSPI: 1, todayLabel: '' };
    
    const projectStart = new Date(Math.min(...tasks.map(t => t.start.getTime())));
    const projectEnd = new Date(Math.max(...tasks.map(t => t.end.getTime())));
    const today = startOfDay(new Date());

    const dateRange = eachDayOfInterval({ start: projectStart, end: projectEnd });
    let cumulativePlanned = 0;
    let cumulativeActual = 0;
    
    const relevantTasks = tasks.filter(t => t.type !== 'project' && t.type !== 'milestone');
    if (relevantTasks.length === 0) return { sCurveData: [], projectSPI: 1, todayLabel: '' };

    const sCurve = dateRange.map(day => {
        let dailyPlanned = 0;
        let dailyActual = 0;
        
        relevantTasks.forEach(task => {
            const taskStart = startOfDay(task.start);
            const taskEnd = startOfDay(task.end);
            const duration = differenceInDays(taskEnd, taskStart) + 1;
            
            if (duration > 0) {
              if (day >= taskStart && day <= taskEnd) {
                  dailyPlanned += 100 / duration;
              }
              if (day <= today && day >= taskStart && day <= taskEnd) {
                  const actualProgressOnDay = Math.min(100, task.progress || 0) / duration;
                  dailyActual += actualProgressOnDay;
              }
            }
        });

        cumulativePlanned += dailyPlanned / relevantTasks.length;
        if (day <= today) {
          cumulativeActual += dailyActual / relevantTasks.length;
        }

        const label = format(day, "d MMM", { locale: es });

        return {
            date: label,
            fullDate: day,
            programado: parseFloat(Math.min(100, cumulativePlanned).toFixed(1)),
            real: day <= today ? parseFloat(Math.min(100, cumulativeActual).toFixed(1)) : undefined,
        };
    });

    const todayIdx = dateRange.findIndex(d => startOfDay(d) >= today);
    const todayData = sCurve[todayIdx > -1 ? todayIdx : sCurve.length - 1];
    const spi = (todayData?.programado ?? 0) > 0 ? ((todayData?.real || 0) / todayData.programado) : 1;
    const tLabel = todayIdx > -1 ? sCurve[todayIdx]?.date : '';

    return { sCurveData: sCurve, projectSPI: spi, todayLabel: tLabel };
  }, [tasks]);

  return (
    <div className="flex flex-col gap-6 fade-in w-full max-w-[100vw] overflow-hidden pb-10">
      <GanttCustomStyles />
      <PageHeader
        title="Cronograma de Obra"
        description="Carta Gantt, curva S y análisis de rendimiento del proyecto."
      />

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={projectSPI > 1.05 ? TrendingUp : projectSPI < 0.95 ? TrendingDown : ChevronsRightLeft}
          label="Estado del Proyecto"
          value={projectSPI > 1.05 ? 'Adelantado' : projectSPI < 0.95 ? 'Atrasado' : 'A tiempo'}
          tone={projectSPI > 1.05 ? 'success' : projectSPI < 0.95 ? 'danger' : 'warning'}
        />
        <StatTile
          icon={BarChart3}
          label="Índice SPI"
          value={projectSPI.toFixed(2)}
          sub={projectSPI >= 1 ? 'Rendimiento óptimo' : 'Bajo rendimiento'}
        />
        <StatTile icon={Layers} label="Tareas Totales" value={stats.total} />
        <StatTile icon={CheckCircle2} label="Completadas" value={stats.completed} tone="success" />
      </div>

      {/* Alerta sin fechas */}
      {stats.noDates > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-warning/30 bg-warning-subtle px-4 py-2.5 text-sm text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <strong>{stats.noDates}</strong> tarea{stats.noDates > 1 ? 's' : ''} sin fechas planificadas.
            Asigna fechas desde el módulo EDT para verlas en el Gantt.
          </span>
        </div>
      )}

      <PanelCard
        title="Diagrama Gantt"
        description="Haz doble clic en una tarea para editarla. Arrastra las barras para cambiar fechas."
        icon={Layers}
        contentClassName="px-0 pb-0"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="relative w-full sm:w-44">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Buscar tarea..." className="h-9 pl-8 text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <div className="flex rounded-lg border border-border bg-muted p-0.5">
              {[ViewMode.Day, ViewMode.Week, ViewMode.Month].map((m) => (
                <Button key={m} variant={view === m ? "default" : "ghost"} size="sm" onClick={() => setView(m)} className={cn("h-7 rounded-md px-3 text-xs", view !== m && "text-muted-foreground hover:bg-transparent")}>
                  {m === ViewMode.Day ? 'Día' : m === ViewMode.Week ? 'Semana' : 'Mes'}
                </Button>
              ))}
            </div>
          </div>
        }
      >
        <div className="gantt-container relative min-h-[450px] overflow-hidden border-t border-border">
          {isLoading ? (
            <div className="h-[450px] flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Cargando cronograma...</p>
            </div>
          ) : filteredTasks.length > 0 ? (
             <div className="w-full overflow-x-auto">
                <div className="min-w-[800px]"> 
                    <Gantt
                        tasks={filteredTasks} viewMode={view} onDateChange={handleTaskChange} onProgressChange={handleProgressChange} onDoubleClick={handleDblClick} onDelete={handleDelete} onExpanderClick={handleExpanderClick}
                        locale="es" columnWidth={view === ViewMode.Month ? 300 : view === ViewMode.Week ? 250 : 65}
                        listCellWidth="180px" barFill={70} barCornerRadius={6} rowHeight={48} headerHeight={48}
                        todayColor="hsla(var(--primary) / 0.04)" projectBackgroundColor="hsl(var(--secondary))" projectProgressColor="hsl(var(--secondary-foreground))"
                        arrowColor="hsl(var(--muted-foreground))" fontFamily="inherit" fontSize="12px"
                    />
                </div>
            </div>
          ) : (
            <div className="flex h-[450px] flex-col items-center justify-center gap-3 text-center">
                <div className="rounded-2xl border border-dashed border-border bg-muted p-5">
                  <Calendar className="h-10 w-10 text-muted-foreground opacity-40" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{searchTerm ? 'Sin resultados' : 'Sin tareas planificadas'}</p>
                  <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                    {searchTerm ? `No se encontraron tareas para "${searchTerm}"` : 'Crea partidas con fechas planificadas desde el módulo EDT.'}
                  </p>
                </div>
                {searchTerm && <Button variant="outline" size="sm" onClick={() => setSearchTerm('')}>Limpiar Búsqueda</Button>}
            </div>
          )}
        </div>
      </PanelCard>

      {/* Curva S */}
      <PanelCard
        title="Curva S de Avance"
        description="Comparación avance programado vs. real. La línea punteada marca el día de hoy."
        icon={TrendingUp}
        actions={
          projectSPI !== 1 ? (
            <StatusBadge tone={projectSPI >= 1 ? 'success' : 'danger'}>SPI: {projectSPI.toFixed(2)}</StatusBadge>
          ) : undefined
        }
      >
          {sCurveData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
                <LineChart data={sCurveData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                    <XAxis dataKey="date" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickFormatter={(value) => `${value.toFixed(0)}%`} tickLine={false} axisLine={false} domain={[0, 100]} />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                      formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    {todayLabel && <ReferenceLine x={todayLabel} stroke="hsl(var(--primary))" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: 'Hoy', fill: 'hsl(var(--primary))', fontSize: 10, position: 'top' }} />}
                    <Line type="monotone" dataKey="programado" stroke="hsl(var(--info))" strokeWidth={2} dot={false} name="Programado" strokeDasharray="6 3" />
                    <Line type="monotone" dataKey="real" stroke="hsl(var(--success))" strokeWidth={2.5} dot={false} name="Real" connectNulls={false} />
                </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[200px] flex-col items-center justify-center gap-2 text-center">
              <BarChart3 className="h-8 w-8 text-muted-foreground opacity-30" />
              <p className="text-sm text-muted-foreground">Sin datos suficientes para generar la curva S.</p>
            </div>
          )}
      </PanelCard>

      {/* Dialog de Edición */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[560px] gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 bg-muted/20 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
                <Edit className="h-5 w-5 text-primary"/>
                Editar Tarea
            </DialogTitle>
            <DialogDescription>Modifica la planificación, fechas y responsable.</DialogDescription>
          </DialogHeader>
          <div className="p-6 space-y-5">
            <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs font-medium">Nombre de la Tarea</Label>
                <Input id="name" value={currentTask.name || ''} onChange={(e) => setCurrentTask({ ...currentTask, name: e.target.value })} placeholder="Ej: Instalación de Tuberías" className="h-9 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                     <Label className="text-xs font-medium">Tipo</Label>
                     <Select value={currentTask.type || 'task'} onValueChange={(val: any) => setCurrentTask({...currentTask, type: val})}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                              <SelectItem value="task">📌 Tarea</SelectItem>
                              <SelectItem value="project">📁 Proyecto</SelectItem>
                              <SelectItem value="milestone">🔴 Hito</SelectItem>
                          </SelectContent>
                     </Select>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Proyecto Padre</Label>
                     <Select value={currentTask.project || "none"} onValueChange={(val) => setCurrentTask({ ...currentTask, project: val === "none" ? undefined : val })} disabled={currentTask.type === 'project'}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Sin padre" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none" className="text-muted-foreground">— Raíz —</SelectItem>
                            {tasks.filter(t => t.type === 'project' && t.id !== currentTask.id).map(t => (<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <div className="bg-muted/15 p-4 rounded-xl border space-y-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cronograma</h4>
                </div>
                <div className="grid grid-cols-2 gap-3">
                     <div className="space-y-1.5">
                       <Label htmlFor="start" className="text-xs text-muted-foreground">Inicio</Label>
                       <Input id="start" type="date" className="h-9 text-sm" value={dateToString(currentTask.start)} onChange={(e) => setCurrentTask({ ...currentTask, start: stringToDate(e.target.value) })}/>
                     </div>
                     <div className="space-y-1.5">
                       <Label htmlFor="end" className="text-xs text-muted-foreground">Fin</Label>
                       <Input id="end" type="date" className="h-9 text-sm" value={dateToString(currentTask.end)} onChange={(e) => setCurrentTask({ ...currentTask, end: stringToDate(e.target.value) })}/>
                     </div>
                </div>
                <div className="space-y-2 pt-1">
                    <div className="flex justify-between items-center">
                      <Label className="text-xs text-muted-foreground">Avance</Label>
                      <span className={cn('text-sm font-bold tabular-nums', (currentTask.progress || 0) >= 100 ? 'text-success' : 'text-primary')}>
                        {currentTask.progress || 0}%
                      </span>
                    </div>
                    <Slider value={[currentTask.progress || 0]} max={100} step={5} onValueChange={(val) => setCurrentTask({...currentTask, progress: val[0]})}/>
                </div>
            </div>
            <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs font-medium"><Users className="h-3.5 w-3.5"/> Responsable</Label>
                <Select value={currentTask.assignedTo || 'none'} onValueChange={(val) => setCurrentTask({ ...currentTask, assignedTo: val === "none" ? null : val})}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Asignar..." /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">Sin asignar</SelectItem>
                        {(users || []).map((u: UserType) => (<SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>))}
                    </SelectContent>
                </Select>
            </div>
          </div>
          <DialogFooter className="px-6 py-3 bg-muted/20 border-t flex items-center !justify-between">
            {isEditing ? (
              <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5" onClick={() => handleDelete(currentTask as Task)}>
                <Trash2 className="h-3.5 w-3.5" /> Eliminar
              </Button>
            ) : <div/>}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleSaveTask}>Guardar Cambios</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

