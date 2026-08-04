'use client';

import React from 'react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { formatCLP } from '@/lib/format';
import { PanelCard } from '@/components/ui/panel-card';
import { StatTile } from '@/components/ui/stat-tile';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
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
import { useToast } from '@/modules/core/hooks/use-toast';
import {
  Package, HardHat, Truck, Boxes, Plus, Edit, Trash2, Search, RefreshCw, AlertCircle,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { Resource } from '@/modules/core/lib/data';

const TYPES = {
  material: { label: 'Material', icon: Package, tone: 'neutral' as const },
  labor: { label: 'Mano de obra', icon: HardHat, tone: 'info' as const },
  equipment: { label: 'Equipo', icon: Truck, tone: 'warning' as const },
  other: { label: 'Otro', icon: Boxes, tone: 'neutral' as const },
};

type ResourceType = keyof typeof TYPES;

// Unidades típicas: HH = hora hombre, HM = hora máquina.
const UNITS = ['un', 'm', 'm2', 'm3', 'kg', 'ton', 'sc', 'lt', 'gl', 'HH', 'HM', 'global'];

const EMPTY = { name: '', type: 'material' as ResourceType, unit: 'un', unitPrice: '', code: '' };

export default function ResourcesPage() {
  const { resources, apuItems, addResource, updateResource, deleteResource, refreshApuPricesFromResource, can } = useAppState();
  const { toast } = useToast();

  const canEdit = can('construction_control:edit_structure');

  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState<'all' | ResourceType>('all');
  const [isOpen, setIsOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Resource | null>(null);
  const [form, setForm] = React.useState(EMPTY);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Cuántas líneas de APU usan cada recurso: sirve para avisar antes de borrar
  // y para saber a cuántos APU afectaría un cambio de precio.
  const usageByResource = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const item of apuItems) {
      if (!item.resourceId) continue;
      map.set(item.resourceId, (map.get(item.resourceId) ?? 0) + 1);
    }
    return map;
  }, [apuItems]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return resources.filter(r => {
      const matchType = typeFilter === 'all' || r.type === typeFilter;
      const matchName = !q || r.name.toLowerCase().includes(q) || (r.code ?? '').toLowerCase().includes(q);
      return matchType && matchName;
    });
  }, [resources, search, typeFilter]);

  const counts = React.useMemo(() => ({
    material: resources.filter(r => r.type === 'material').length,
    labor: resources.filter(r => r.type === 'labor').length,
    equipment: resources.filter(r => r.type === 'equipment').length,
  }), [resources]);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setIsOpen(true); };

  const openEdit = (r: Resource) => {
    setEditing(r);
    setForm({
      name: r.name, type: r.type, unit: r.unit,
      unitPrice: String(r.unitPrice ?? ''), code: r.code ?? '',
    });
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = Number(form.unitPrice);
    if (!form.name.trim() || Number.isNaN(price)) return;
    setIsSubmitting(true);
    const payload = {
      name: form.name.trim(),
      type: form.type,
      unit: form.unit,
      unitPrice: price,
      code: form.code.trim() || null,
    };
    try {
      if (editing) {
        await updateResource(editing.id, payload);
        const uses = usageByResource.get(editing.id) ?? 0;
        toast({
          title: 'Recurso actualizado',
          description: uses > 0
            ? `${uses} línea(s) de APU usan este recurso. Usa "Propagar precio" si quieres actualizarlas.`
            : undefined,
        });
      } else {
        await addResource(payload);
        toast({ title: 'Recurso creado', description: `"${payload.name}" ya se puede usar en los APU.` });
      }
      setIsOpen(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message || 'No se pudo guardar.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefreshPrices = async (r: Resource) => {
    try {
      const updated = await refreshApuPricesFromResource(r.id);
      toast({
        title: 'Precios propagados',
        description: `Se actualizaron ${updated} línea(s) de APU con ${formatCLP(r.unitPrice)}.`,
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message || 'No se pudo propagar.' });
    }
  };

  const handleDelete = async (r: Resource) => {
    try {
      await deleteResource(r.id);
      toast({ title: 'Recurso eliminado', description: `"${r.name}" fue eliminado del catálogo.` });
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
        title="Catálogo de Recursos"
        description="Materiales, mano de obra y equipos con su precio. Es la base de los APU: cambias un precio acá y lo propagas a todos los análisis que lo usan."
        actions={canEdit && (
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo Recurso
          </Button>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Materiales" value={counts.material} icon={Package} />
        <StatTile label="Mano de obra" value={counts.labor} icon={HardHat} tone="info" />
        <StatTile label="Equipos" value={counts.equipment} icon={Truck} tone="warning" />
      </div>

      <PanelCard
        title="Recursos"
        icon={Boxes}
        description={`${filtered.length} de ${resources.length} recurso(s)`}
        contentClassName="px-0 pb-0"
      >
        <div className="flex flex-col gap-3 px-6 pb-4 sm:flex-row">
          <div className="relative flex-grow">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="h-9 pl-9" placeholder="Buscar por nombre o código..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={typeFilter} onValueChange={v => setTypeFilter(v as any)}>
            <SelectTrigger className="h-9 w-full sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {(Object.keys(TYPES) as ResourceType[]).map(t => (
                <SelectItem key={t} value={t}>{TYPES[t].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-6">Recurso</TableHead>
                <TableHead className="w-[140px]">Tipo</TableHead>
                <TableHead className="w-[80px]">Unidad</TableHead>
                <TableHead className="w-[140px] text-right">Precio</TableHead>
                <TableHead className="w-[90px] text-center">En APU</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-sm text-muted-foreground">
                    {resources.length === 0
                      ? 'Aún no hay recursos. Crea el primero para empezar a armar APU.'
                      : 'Ningún recurso coincide con el filtro.'}
                  </TableCell>
                </TableRow>
              ) : filtered.map(r => {
                const cfg = TYPES[r.type as ResourceType] ?? TYPES.other;
                const uses = usageByResource.get(r.id) ?? 0;
                return (
                  <TableRow key={r.id} className="group">
                    <TableCell className="pl-6">
                      <p className="text-sm font-medium">{r.name}</p>
                      {r.code && <p className="font-mono text-xs text-muted-foreground">{r.code}</p>}
                    </TableCell>
                    <TableCell><StatusBadge tone={cfg.tone}>{cfg.label}</StatusBadge></TableCell>
                    <TableCell className="font-mono text-xs">{r.unit}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                      {formatCLP(r.unitPrice)}
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">{uses || '—'}</TableCell>
                    <TableCell>
                      {canEdit && (
                        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          {uses > 0 && (
                            <Button variant="ghost" size="icon" className="h-8 w-8"
                              title="Propagar este precio a los APU que lo usan"
                              onClick={() => handleRefreshPrices(r)}>
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>¿Eliminar &ldquo;{r.name}&rdquo;?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {uses > 0
                                    ? `${uses} línea(s) de APU usan este recurso. No se borran: quedan con el precio y el nombre que ya tenían, pero pierden el vínculo con el catálogo.`
                                    : 'Esta acción no se puede deshacer.'}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction className="bg-destructive hover:bg-destructive/90"
                                  onClick={() => handleDelete(r)}>
                                  Eliminar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </PanelCard>

      <Dialog open={isOpen} onOpenChange={o => { if (!isSubmitting) setIsOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Recurso' : 'Nuevo Recurso'}</DialogTitle>
            <DialogDescription>
              La mano de obra se cobra por HH (hora hombre) y los equipos por HM (hora máquina).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="r-name">Nombre *</Label>
              <Input id="r-name" required autoFocus value={form.name}
                placeholder="Ej: Cemento Portland / Maestro albañil"
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="r-type">Tipo</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as ResourceType }))}>
                  <SelectTrigger id="r-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPES) as ResourceType[]).map(t => (
                      <SelectItem key={t} value={t}>{TYPES[t].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-unit">Unidad</Label>
                <Select value={form.unit} onValueChange={v => setForm(f => ({ ...f, unit: v }))}>
                  <SelectTrigger id="r-unit"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-price">Precio unitario *</Label>
                <Input id="r-price" type="number" step="any" required value={form.unitPrice}
                  onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-code">Código</Label>
                <Input id="r-code" value={form.code} placeholder="Opcional"
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setIsOpen(false)} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting || !form.name.trim()}>
                {isSubmitting ? 'Guardando...' : editing ? 'Guardar' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
