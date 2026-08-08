'use client';

import React from 'react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { formatCLP } from '@/lib/format';
import { PanelCard } from '@/components/ui/panel-card';
import { SurfaceCard } from '@/components/ui/surface-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/modules/core/hooks/use-toast';
import { Wallet, Plus, Trash2, AlertCircle, Receipt, FileDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BudgetOverhead } from '@/modules/core/lib/data';
import { computeBudgetSummary } from '@/lib/apu-costs';
import { generateBudgetPDF } from '@/lib/budget-pdf-generator';
import { EnviarDocumento } from '@/components/enviar-documento';

export default function PresupuestoPage() {
  const {
    budgets, projects, clients, workItems, budgetOverheads,
    updateBudget, addBudgetOverhead, updateBudgetOverhead, deleteBudgetOverhead, can,
  } = useAppState();
  const { toast } = useToast();

  const canEdit = can('construction_control:edit_structure');
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [downloading, setDownloading] = React.useState(false);

  const selected = React.useMemo(
    () => budgets.find(b => b.id === selectedId) ?? budgets[0] ?? null,
    [budgets, selectedId]
  );

  const items = React.useMemo(
    () => (selected ? workItems.filter(w => w.budgetId === selected.id) : []),
    [workItems, selected]
  );

  const overheads = React.useMemo(
    () => (selected ? budgetOverheads.filter(o => o.budgetId === selected.id) : []),
    [budgetOverheads, selected]
  );

  const summary = React.useMemo(
    () => computeBudgetSummary(selected, items, overheads),
    [selected, items, overheads]
  );

  const projectName = selected?.projectId
    ? projects.find(p => p.id === selected.projectId)?.name
    : null;
  const clientName = React.useMemo(() => {
    const project = projects.find(p => p.id === selected?.projectId);
    return project?.clientId ? clients.find(c => c.id === project.clientId)?.name : null;
  }, [projects, clients, selected]);

  /** Correo del cliente de la obra, para proponerlo al enviar el presupuesto. */
  const clientEmail = React.useMemo(() => {
    const project = projects.find(p => p.id === selected?.projectId);
    return project?.clientId
      ? clients.find(c => c.id === project.clientId)?.email ?? null
      : null;
  }, [projects, clients, selected]);

  const setPercent = async (field: 'contingencyPercent' | 'profitPercent' | 'taxPercent', value: number) => {
    if (!selected) return;
    try {
      await updateBudget(selected.id, { [field]: value });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
  };

  const downloadPdf = async () => {
    if (!selected) return;
    setDownloading(true);
    try {
      await generateBudgetPDF({
        budget: selected,
        items,
        overheads,
        summary,
        projectName,
        clientName,
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'No se pudo generar el PDF', description: err.message });
    } finally {
      setDownloading(false);
    }
  };

  const addLine = async () => {
    if (!selected) return;
    try {
      await addBudgetOverhead({
        budgetId: selected.id, name: 'Nuevo gasto general',
        mode: 'amount', amount: 0, percent: 0, sortOrder: overheads.length,
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
  };

  if (!can('module_construction_control:view')) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Acceso Denegado</AlertTitle>
        <AlertDescription>No tienes permisos para acceder a este módulo.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        title="Estructura del Presupuesto"
        description="Del costo directo de las partidas al total con IVA: gastos generales, imprevistos y utilidad."
        actions={budgets.length > 0 && (
          <div className="flex items-center gap-2">
            <Select value={selected?.id ?? ''} onValueChange={setSelectedId}>
              <SelectTrigger className="w-[260px]"><SelectValue placeholder="Elegir presupuesto..." /></SelectTrigger>
              <SelectContent>
                {budgets.map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}{b.type === 'adicional' ? ' (adicional)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected && (
              <>
                <Button variant="cta" onClick={downloadPdf} disabled={downloading}>
                  <FileDown className="mr-1.5 h-4 w-4" />
                  {downloading ? 'Generando…' : 'Descargar PDF'}
                </Button>
                <EnviarDocumento
                  fileName={`Presupuesto_${selected.name.replace(/[^\w-]+/g, '_')}.pdf`}
                  asuntoSugerido={`Presupuesto · ${selected.name}${projectName ? ` — ${projectName}` : ''}`}
                  destinatarioSugerido={clientEmail}
                  descripcionDestinatario="el cliente"
                  mensajeSugerido="Estimados: adjuntamos el presupuesto para su revisión."
                  generarPdf={() => generateBudgetPDF({
                    budget: selected, items, overheads, summary,
                    projectName, clientName, salida: 'blob',
                  })}
                />
              </>
            )}
          </div>
        )}
      />

      {!selected ? (
        <SurfaceCard interactive={false} className="items-center p-12 text-center">
          <Wallet className="mb-4 h-12 w-12 text-muted-foreground/40" strokeWidth={1.2} />
          <h3 className="text-lg font-bold tracking-tight">Aún no hay presupuestos</h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Crea un Contrato en Partidas (EDT) y se genera su presupuesto automáticamente.
          </p>
        </SurfaceCard>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <StatusBadge tone={selected.type === 'adicional' ? 'info' : 'neutral'}>
              {selected.type === 'adicional' ? 'Adicional' : 'Principal'}
            </StatusBadge>
            {projectName
              ? <span>Obra: <span className="font-medium text-foreground">{projectName}</span></span>
              : <StatusBadge tone="warning">Sin obra asignada</StatusBadge>}
            {clientName && <span>· Cliente: <span className="font-medium text-foreground">{clientName}</span></span>}
            <span>· {items.length} partida(s)</span>
          </div>

          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
            {/* Gastos generales */}
            <PanelCard
              title="Gastos Generales"
              icon={Receipt}
              description="Cada línea puede ser un monto fijo o un % del costo directo."
              className="lg:col-span-3"
              actions={canEdit && (
                <Button variant="outline" size="sm" onClick={addLine}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Agregar
                </Button>
              )}
            >
              {overheads.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Sin gastos generales cargados. El presupuesto solo considera el costo directo.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {overheads.map(o => (
                    <OverheadLine
                      key={o.id}
                      overhead={o}
                      value={summary.overheadLines.get(o.id) ?? 0}
                      canEdit={canEdit}
                      onUpdate={updateBudgetOverhead}
                      onDelete={deleteBudgetOverhead}
                    />
                  ))}
                  <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
                    <span className="font-semibold">Subtotal gastos generales</span>
                    <span className="font-mono font-bold tabular-nums">{formatCLP(summary.overheads)}</span>
                  </div>
                </div>
              )}
            </PanelCard>

            {/* Resumen */}
            <PanelCard title="Resumen" icon={Wallet} className="lg:col-span-2">
              <div className="space-y-1">
                <Row label="Costo directo" hint={`${items.length} partida(s)`} value={summary.directCost} />
                <Row label="Gastos generales" value={summary.overheads} />

                <PercentRow
                  label="Imprevistos" base="sobre CD + GG"
                  percent={selected.contingencyPercent ?? 0}
                  value={summary.contingency} canEdit={canEdit}
                  onCommit={v => setPercent('contingencyPercent', v)}
                />
                <PercentRow
                  label="Utilidad" base="sobre CD + GG + imprev."
                  percent={selected.profitPercent ?? 0}
                  value={summary.profit} canEdit={canEdit}
                  onCommit={v => setPercent('profitPercent', v)}
                />

                <div className="flex items-center justify-between border-t border-border py-2 text-sm">
                  <span className="font-semibold">Neto</span>
                  <span className="font-mono font-bold tabular-nums">{formatCLP(summary.net)}</span>
                </div>

                <PercentRow
                  label="IVA" base="sobre el neto"
                  percent={selected.taxPercent ?? 19}
                  value={summary.tax} canEdit={canEdit}
                  onCommit={v => setPercent('taxPercent', v)}
                />

                <div className="mt-2 flex items-center justify-between rounded-xl bg-sidebar px-4 py-3">
                  <span className="text-sm font-semibold uppercase tracking-wider text-sidebar-foreground">Total</span>
                  <span className="font-mono text-xl font-bold tabular-nums text-cta">{formatCLP(summary.total)}</span>
                </div>

                {summary.directCost === 0 && (
                  <p className="pt-2 text-xs text-warning">
                    El costo directo es $0: este presupuesto todavía no tiene partidas con cantidad y precio.
                  </p>
                )}
              </div>
            </PanelCard>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">
        {label}
        {hint && <span className="ml-1 text-xs opacity-70">({hint})</span>}
      </span>
      <span className="font-mono tabular-nums">{formatCLP(value)}</span>
    </div>
  );
}

function PercentRow({
  label, base, percent, value, canEdit, onCommit,
}: {
  label: string; base: string; percent: number; value: number;
  canEdit: boolean; onCommit: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span className="min-w-0 text-muted-foreground">
        {label}
        <span className="ml-1 text-xs opacity-70">({base})</span>
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <Input
          type="number" step="any"
          className="h-7 w-[70px] text-right font-mono text-xs"
          defaultValue={percent}
          disabled={!canEdit}
          onBlur={e => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v) && v !== percent) onCommit(v);
          }}
        />
        <span className="text-xs text-muted-foreground">%</span>
        <span className="w-[110px] text-right font-mono tabular-nums">{formatCLP(value)}</span>
      </div>
    </div>
  );
}

function OverheadLine({
  overhead, value, canEdit, onUpdate, onDelete,
}: {
  overhead: BudgetOverhead;
  value: number;
  canEdit: boolean;
  onUpdate: (id: string, data: Partial<BudgetOverhead>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  // Igual que en el APU: se guarda al salir del campo, no en cada tecla.
  const commit = (data: Partial<BudgetOverhead>) => { void onUpdate(overhead.id, data); };
  const isPercent = overhead.mode === 'percent';

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-2">
      <Input
        className="h-8 min-w-0 flex-1 border-transparent bg-transparent text-sm focus:border-input"
        defaultValue={overhead.name}
        disabled={!canEdit}
        onBlur={e => { if (e.target.value !== overhead.name) commit({ name: e.target.value }); }}
      />
      <Select
        value={overhead.mode}
        disabled={!canEdit}
        onValueChange={v => commit({ mode: v as BudgetOverhead['mode'] })}
      >
        <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="amount">Monto</SelectItem>
          <SelectItem value="percent">% del CD</SelectItem>
        </SelectContent>
      </Select>
      <Input
        type="number" step="any"
        className="h-8 w-[120px] text-right font-mono text-sm"
        defaultValue={isPercent ? overhead.percent : overhead.amount}
        disabled={!canEdit}
        onBlur={e => {
          const v = Number(e.target.value);
          if (Number.isNaN(v)) return;
          commit(isPercent ? { percent: v } : { amount: v });
        }}
      />
      <span className={cn('w-[110px] text-right font-mono text-sm font-semibold tabular-nums')}>
        {formatCLP(value)}
      </span>
      {canEdit && (
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
          onClick={() => onDelete(overhead.id)} aria-label="Eliminar gasto general">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
