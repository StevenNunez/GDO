'use client';

import React from 'react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { formatCLP } from '@/lib/format';
import { PanelCard } from '@/components/ui/panel-card';
import { SurfaceCard } from '@/components/ui/surface-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/modules/core/hooks/use-toast';
import {
  Calculator, Plus, Trash2, Search, AlertCircle, Package, HardHat, Truck, Boxes, ChevronRight, Copy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Apu, ApuItem, Resource } from '@/modules/core/lib/data';
import { computeApu, type ApuKind } from '@/lib/apu-costs';

const KINDS: Record<ApuKind, { label: string; icon: React.ElementType }> = {
  material: { label: 'Materiales', icon: Package },
  labor: { label: 'Mano de obra', icon: HardHat },
  equipment: { label: 'Equipos', icon: Truck },
  other: { label: 'Otros', icon: Boxes },
};

const KIND_ORDER: ApuKind[] = ['material', 'labor', 'equipment', 'other'];
const UNITS = ['un', 'm', 'm2', 'm3', 'kg', 'ton', 'sc', 'lt', 'gl', 'HH', 'HM', 'global'];

export default function ApuPage() {
  const {
    apus, apuItems, resources,
    addApu, updateApu, deleteApu, addApuItem, updateApuItem, deleteApuItem,
    can,
  } = useAppState();
  const { toast } = useToast();

  const canEdit = can('construction_control:edit_structure');

  const [search, setSearch] = React.useState('');
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [newApu, setNewApu] = React.useState({ name: '', unit: 'm2', code: '' });

  // Solo la biblioteca: los APU con workItemId son la copia de una partida y se
  // editan desde la partida, no acá.
  const library = React.useMemo(
    () => apus.filter(a => a.isTemplate),
    [apus]
  );

  const itemsByApu = React.useMemo(() => {
    const map = new Map<string, ApuItem[]>();
    for (const item of apuItems) {
      const list = map.get(item.apuId);
      if (list) list.push(item);
      else map.set(item.apuId, [item]);
    }
    for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  }, [apuItems]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return library;
    return library.filter(a =>
      a.name.toLowerCase().includes(q) || (a.code ?? '').toLowerCase().includes(q)
    );
  }, [library, search]);

  const selected = React.useMemo(
    () => library.find(a => a.id === selectedId) ?? null,
    [library, selectedId]
  );

  const selectedItems = selected ? (itemsByApu.get(selected.id) ?? []) : [];
  const breakdown = React.useMemo(() => computeApu(selectedItems), [selectedItems]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newApu.name.trim()) return;
    try {
      const id = await addApu({
        name: newApu.name.trim(),
        unit: newApu.unit,
        code: newApu.code.trim() || null,
        isTemplate: true,
      });
      setSelectedId(id);
      setIsCreateOpen(false);
      setNewApu({ name: '', unit: 'm2', code: '' });
      toast({ title: 'APU creado', description: 'Agrega los recursos para calcular el precio unitario.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message || 'No se pudo crear el APU.' });
    }
  };

  const handleDuplicate = async (apu: Apu) => {
    try {
      const id = await addApu({
        name: `${apu.name} (copia)`, unit: apu.unit, code: apu.code, isTemplate: true,
      });
      const source = itemsByApu.get(apu.id) ?? [];
      for (const item of source) {
        await addApuItem({
          apuId: id, resourceId: item.resourceId, name: item.name, kind: item.kind,
          unit: item.unit, calcMode: item.calcMode, quantity: item.quantity,
          unitPrice: item.unitPrice, percentValue: item.percentValue,
          percentOf: item.percentOf, sortOrder: item.sortOrder,
        });
      }
      setSelectedId(id);
      toast({ title: 'APU duplicado', description: `Se copiaron ${source.length} línea(s).` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message || 'No se pudo duplicar.' });
    }
  };

  const handleDelete = async (apu: Apu) => {
    try {
      await deleteApu(apu.id);
      if (selectedId === apu.id) setSelectedId(null);
      toast({ title: 'APU eliminado', description: `"${apu.name}" y sus líneas fueron eliminados.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message || 'No se pudo eliminar.' });
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
        title="Análisis de Precios Unitarios (APU)"
        description="Desglosa el precio de cada partida en materiales, mano de obra y equipos. Los APU de la biblioteca se aplican a las partidas de cualquier obra."
        actions={canEdit && (
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo APU
          </Button>
        )}
      />

      {resources.length === 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Primero carga el catálogo de recursos</AlertTitle>
          <AlertDescription>
            Los APU se arman con recursos (materiales, mano de obra, equipos) y sus precios.
            Puedes agregar líneas manuales, pero el catálogo te evita repetir precios.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        {/* Biblioteca */}
        <PanelCard
          title="Biblioteca"
          icon={Calculator}
          description={`${filtered.length} de ${library.length} APU`}
          className="lg:col-span-1"
        >
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="h-9 pl-9" placeholder="Buscar APU..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {library.length === 0 ? 'Aún no hay APU en la biblioteca.' : 'Ninguno coincide con la búsqueda.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map(apu => {
                const total = computeApu(itemsByApu.get(apu.id) ?? []).total;
                const isSelected = apu.id === selectedId;
                return (
                  <li key={apu.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(apu.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-muted/40 hover:border-cta/40'
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{apu.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatCLP(total)} / {apu.unit}
                        </p>
                      </div>
                      <ChevronRight className={cn('h-4 w-4 shrink-0', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </PanelCard>

        {/* Detalle */}
        <div className="lg:col-span-2">
          {!selected ? (
            <SurfaceCard interactive={false} className="items-center p-12 text-center">
              <Calculator className="mb-4 h-12 w-12 text-muted-foreground/40" strokeWidth={1.2} />
              <h3 className="text-lg font-bold tracking-tight">Selecciona un APU</h3>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Elige uno de la biblioteca para ver y editar su desglose, o crea uno nuevo.
              </p>
            </SurfaceCard>
          ) : (
            <ApuEditor
              apu={selected}
              items={selectedItems}
              breakdown={breakdown}
              resources={resources}
              canEdit={canEdit}
              onUpdateApu={updateApu}
              onAddItem={addApuItem}
              onUpdateItem={updateApuItem}
              onDeleteItem={deleteApuItem}
              onDuplicate={() => handleDuplicate(selected)}
              onDelete={() => handleDelete(selected)}
            />
          )}
        </div>
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo APU</DialogTitle>
            <DialogDescription>
              La unidad es la de la partida que vas a valorizar (m2 de muro, m3 de hormigón...).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="a-name">Nombre *</Label>
              <Input id="a-name" required autoFocus value={newApu.name}
                placeholder="Ej: Muro de albañilería e=14cm"
                onChange={e => setNewApu(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="a-unit">Unidad</Label>
                <Select value={newApu.unit} onValueChange={v => setNewApu(f => ({ ...f, unit: v }))}>
                  <SelectTrigger id="a-unit"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-code">Código</Label>
                <Input id="a-code" value={newApu.code} placeholder="Opcional"
                  onChange={e => setNewApu(f => ({ ...f, code: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={!newApu.name.trim()}>Crear APU</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Editor del APU ───────────────────────────────────────────────────── */

function ApuEditor({
  apu, items, breakdown, resources, canEdit,
  onUpdateApu, onAddItem, onUpdateItem, onDeleteItem, onDuplicate, onDelete,
}: {
  apu: Apu;
  items: ApuItem[];
  breakdown: ReturnType<typeof computeApu>;
  resources: Resource[];
  canEdit: boolean;
  onUpdateApu: (id: string, data: Partial<Apu>) => Promise<void>;
  onAddItem: (data: Partial<ApuItem>) => Promise<void>;
  onUpdateItem: (id: string, data: Partial<ApuItem>) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { toast } = useToast();
  const [addingKind, setAddingKind] = React.useState<ApuKind | null>(null);

  const addResourceLine = async (kind: ApuKind, resourceId: string) => {
    const r = resources.find(x => x.id === resourceId);
    if (!r) return;
    try {
      await onAddItem({
        apuId: apu.id, resourceId: r.id, name: r.name, kind,
        unit: r.unit, calcMode: 'quantity', quantity: 1, unitPrice: r.unitPrice,
        sortOrder: items.length,
      });
      setAddingKind(null);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
  };

  const addManualLine = async (kind: ApuKind) => {
    try {
      await onAddItem({
        apuId: apu.id, name: 'Nuevo ítem', kind, unit: 'un',
        calcMode: 'quantity', quantity: 0, unitPrice: 0, sortOrder: items.length,
      });
      setAddingKind(null);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
  };

  const addPercentLine = async (kind: ApuKind) => {
    try {
      await onAddItem({
        apuId: apu.id, name: 'Herramienta menor', kind, unit: '%',
        calcMode: 'percent', percentValue: 5, percentOf: 'labor',
        quantity: 0, unitPrice: 0, sortOrder: items.length,
      });
      setAddingKind(null);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
  };

  return (
    <div className="space-y-4">
      <PanelCard
        title={apu.name}
        icon={Calculator}
        description={`Precio unitario por ${apu.unit}`}
        actions={canEdit && (
          <>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Duplicar" onClick={onDuplicate}>
              <Copy className="h-4 w-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar &ldquo;{apu.name}&rdquo;?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se elimina de la biblioteca junto con sus líneas. Los APU ya aplicados a
                    partidas no se tocan: son copias independientes.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={onDelete}>
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      >
        <div className="space-y-5">
          {KIND_ORDER.map(kind => {
            const kindItems = items.filter(i => i.kind === kind);
            const Icon = KINDS[kind].icon;
            if (kindItems.length === 0 && !canEdit) return null;
            return (
              <div key={kind}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {KINDS[kind].label}
                    </h3>
                  </div>
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {formatCLP(breakdown[kind])}
                  </span>
                </div>

                {kindItems.length > 0 && (
                  <div className="space-y-1.5">
                    {kindItems.map(item => (
                      <ApuLine
                        key={item.id}
                        item={item}
                        value={breakdown.lineTotals.get(item.id) ?? 0}
                        canEdit={canEdit}
                        onUpdate={onUpdateItem}
                        onDelete={onDeleteItem}
                      />
                    ))}
                  </div>
                )}

                {canEdit && (
                  <div className="mt-2">
                    {addingKind === kind ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-2">
                        <Select onValueChange={v => addResourceLine(kind, v)}>
                          <SelectTrigger className="h-8 w-full sm:w-[240px]">
                            <SelectValue placeholder="Elegir del catálogo..." />
                          </SelectTrigger>
                          <SelectContent>
                            {resources.filter(r => r.type === kind || kind === 'other').map(r => (
                              <SelectItem key={r.id} value={r.id}>
                                {r.name} — {formatCLP(r.unitPrice)}/{r.unit}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="outline" size="sm" onClick={() => addManualLine(kind)}>
                          Línea manual
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => addPercentLine(kind)}>
                          Línea por %
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setAddingKind(null)}>
                          Cancelar
                        </Button>
                      </div>
                    ) : (
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground"
                        onClick={() => setAddingKind(kind)}>
                        <Plus className="mr-1 h-3 w-3" /> Agregar a {KINDS[kind].label.toLowerCase()}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex items-center justify-between rounded-xl bg-sidebar px-4 py-3">
            <span className="text-sm font-semibold uppercase tracking-wider text-sidebar-foreground">
              Precio unitario / {apu.unit}
            </span>
            <span className="font-mono text-xl font-bold tabular-nums text-cta">
              {formatCLP(breakdown.total)}
            </span>
          </div>
        </div>
      </PanelCard>
    </div>
  );
}

/* ── Una línea del APU ────────────────────────────────────────────────── */

function ApuLine({
  item, value, canEdit, onUpdate, onDelete,
}: {
  item: ApuItem;
  value: number;
  canEdit: boolean;
  onUpdate: (id: string, data: Partial<ApuItem>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const isPercent = item.calcMode === 'percent';

  // Se escribe al salir del campo (onBlur) y no en cada tecla: si no, cada
  // pulsación sería un viaje a la base y un recálculo del APU completo.
  const commit = (data: Partial<ApuItem>) => { void onUpdate(item.id, data); };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-2">
      <Input
        className="h-8 min-w-0 flex-1 border-transparent bg-transparent text-sm focus:border-input"
        defaultValue={item.name}
        disabled={!canEdit}
        onBlur={e => { if (e.target.value !== item.name) commit({ name: e.target.value }); }}
      />

      {isPercent ? (
        <>
          <Input
            type="number" step="any" className="h-8 w-[80px] text-right font-mono text-sm"
            defaultValue={item.percentValue ?? 0}
            disabled={!canEdit}
            onBlur={e => commit({ percentValue: Number(e.target.value) })}
          />
          <span className="text-xs text-muted-foreground">% de</span>
          <Select
            value={item.percentOf ?? 'labor'}
            disabled={!canEdit}
            onValueChange={v => commit({ percentOf: v as ApuItem['percentOf'] })}
          >
            <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="material">Materiales</SelectItem>
              <SelectItem value="labor">Mano de obra</SelectItem>
              <SelectItem value="equipment">Equipos</SelectItem>
              <SelectItem value="direct">Costo directo</SelectItem>
            </SelectContent>
          </Select>
        </>
      ) : (
        <>
          <Input
            type="number" step="any" className="h-8 w-[90px] text-right font-mono text-sm"
            defaultValue={item.quantity}
            disabled={!canEdit}
            title="Rendimiento por unidad de partida"
            onBlur={e => commit({ quantity: Number(e.target.value) })}
          />
          <span className="w-[42px] text-center font-mono text-xs text-muted-foreground">{item.unit}</span>
          <Input
            type="number" step="any" className="h-8 w-[110px] text-right font-mono text-sm"
            defaultValue={item.unitPrice}
            disabled={!canEdit}
            title="Precio unitario del recurso"
            onBlur={e => commit({ unitPrice: Number(e.target.value) })}
          />
        </>
      )}

      <span className="w-[110px] text-right font-mono text-sm font-semibold tabular-nums">
        {formatCLP(value)}
      </span>

      {canEdit && (
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
          onClick={() => onDelete(item.id)} aria-label="Eliminar línea">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
