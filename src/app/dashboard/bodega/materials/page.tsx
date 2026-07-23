
"use client";

import React, { useState, useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { useAppState, useAuth } from "@/modules/core/contexts/app-provider";
import { PanelCard } from "@/components/ui/panel-card";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { CreateMaterialForm } from "@/components/admin/create-material-form";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Edit,
  Trash2,
  Archive,
  Search,
  Filter,
  MoreHorizontal,
  AlertTriangle,
  Package,
  ArrowUpRight,
  ArrowDownLeft,
  Undo2,
  Loader2,
  ArchiveRestore,
  PlusCircle,
  TrendingDown,
} from "lucide-react";
import { Material, MaterialRequest, ReturnRequest, StockMovement, User } from "@/modules/core/lib/data";
import { EditMaterialForm } from "@/components/admin/edit-material-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/modules/core/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { toDate } from "@/lib/date-utils";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

// Fila de las tres listas de actividad. El color va en el dato (+cantidad,
// badge de estado), no en el fondo: así no compiten tres bloques de color.
const ACTIVITY_ROW =
  "flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3";

type CompatibleMaterialRequest = MaterialRequest & {
  materialId?: string;
  quantity?: number;
  items?: { materialId: string; quantity: number }[];
};

export default function AdminMaterialsPage() {
  const { materials, stockMovements, returnRequests, users, requests, suppliers, isLoading, deleteMaterial, updateMaterial, can } = useAppState();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const itemsPerPage = 12;

  const canCreate = can('materials:create');
  const canEdit   = can('materials:edit');
  const canDelete = can('materials:delete');
  const canArchive = can('materials:archive');

  const supplierMap = useMemo(() => {
    const map = new Map<string, string>();
    (suppliers || []).forEach(s => { if (s.id) map.set(s.id, s.name); });
    return map;
  }, [suppliers]);

  const userMap = useMemo(() => {
    const map = new Map<string, User>();
    (users || []).forEach(u => map.set(u.id, u));
    return map;
  }, [users]);

  const materialMap = useMemo(
    () => new Map((materials || []).map((m: Material) => [m.id, m])),
    [materials]
  );

  const handleDeleteMaterial = async (materialId: string, materialName: string) => {
    try {
      await deleteMaterial(materialId);
      toast({ title: "Material eliminado", description: `${materialName} ha sido eliminado.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Error al eliminar", description: error instanceof Error ? error.message : "No se pudo eliminar el material." });
    }
  };

  const handleArchiveMaterial = async (material: Material) => {
    if (material.stock > 0 && !material.archived) {
      toast({ variant: "destructive", title: "Acción bloqueada", description: "No se puede archivar un material con stock físico." });
      return;
    }
    try {
      await updateMaterial(material.id, { archived: !material.archived });
      toast({ title: material.archived ? "Material restaurado" : "Material archivado" });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "No se pudo actualizar el estado." });
    }
  };

  const categories = useMemo(() => {
    if (!materials) return ["all"];
    const cats = materials.map((m: Material) => m.category).filter((c): c is string => typeof c === "string");
    return ["all", ...new Set(cats)].sort();
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    let list: Material[] = materials || [];
    if (!showArchived) list = list.filter(m => !m.archived);
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(m => m.name.toLowerCase().includes(q));
    }
    if (categoryFilter !== "all") list = list.filter(m => m.category === categoryFilter);
    return list;
  }, [materials, searchTerm, categoryFilter, showArchived]);

  const paginatedMaterials = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredMaterials.slice(start, start + itemsPerPage);
  }, [filteredMaterials, currentPage]);

  const totalPages = Math.ceil(filteredMaterials.length / itemsPerPage);

  const quickStats = useMemo(() => ({
    total:    (materials || []).filter(m => !m.archived).length,
    lowStock: (materials || []).filter(m => !m.archived && m.stock <= 10).length,
    archived: (materials || []).filter(m => m.archived).length,
  }), [materials]);

  const getRelativeTime = (date: any) => {
    const d = toDate(date);
    if (!d) return "—";
    return formatDistanceToNow(d, { addSuffix: true, locale: es });
  };

  const recentReceived = useMemo(() => {
    if (!stockMovements) return [];
    return [...(stockMovements as StockMovement[])]
      .filter(m => m.quantityChange > 0 && m.type !== 'return-reentry')
      .sort((a, b) => (toDate(b.date)?.getTime() || 0) - (toDate(a.date)?.getTime() || 0))
      .slice(0, 5);
  }, [stockMovements]);

  const recentApproved = useMemo(() => {
    if (!requests) return [];
    return [...(requests as CompatibleMaterialRequest[])]
      .filter(r => r.status === "approved" && r.createdAt)
      .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0))
      .slice(0, 5);
  }, [requests]);

  const recentReturns = useMemo(() => {
    if (!returnRequests) return [];
    return [...(returnRequests as ReturnRequest[])]
      .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0))
      .slice(0, 5);
  }, [returnRequests]);

  return (
    <div className="flex flex-col gap-6 pb-10 fade-in">
      <PageHeader
        title="Gestión de Materiales"
        description="Catálogo maestro de inventario, stock y proveedores."
      />

      {/* Edit sheet */}
      {editingMaterial && canEdit && (
        <EditMaterialForm
          material={editingMaterial}
          isOpen={true}
          onClose={() => setEditingMaterial(null)}
        />
      )}

      {/* Create sheet */}
      <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-primary" /> Nuevo Material
            </SheetTitle>
            <SheetDescription>
              Completa los datos para agregar un nuevo ítem al catálogo de la obra activa.
            </SheetDescription>
          </SheetHeader>
          <CreateMaterialForm />
        </SheetContent>
      </Sheet>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile label="Total activos" value={quickStats.total} icon={Package} />
        <StatTile
          label="Stock crítico (≤10)"
          value={quickStats.lowStock}
          icon={TrendingDown}
          tone={quickStats.lowStock > 0 ? "warning" : "neutral"}
        />
        <StatTile label="Archivados" value={quickStats.archived} icon={Archive} tone="neutral" />
      </div>

      {/* ── Inventory table (full width) ── */}
      <PanelCard
        title="Inventario Maestro"
        icon={Package}
        description={
          <>
            {filteredMaterials.length} material{filteredMaterials.length !== 1 ? "es" : ""} encontrado{filteredMaterials.length !== 1 ? "s" : ""}
            {filteredMaterials.length !== (materials || []).length && ` de ${(materials || []).length} en total`}
          </>
        }
        actions={
          canCreate && (
            <Button onClick={() => setIsCreateOpen(true)} className="shrink-0">
              <PlusCircle className="mr-2 h-4 w-4" /> Nuevo Material
            </Button>
          )
        }
        contentClassName="px-0 pb-0"
        footer={
          totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                Página {currentPage} de {totalPages} · {filteredMaterials.length} resultados
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                  Anterior
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                  Siguiente
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
          {/* Filters */}
          <div className="flex flex-col gap-3 px-6 pb-4 sm:flex-row">
            <div className="relative flex-grow">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre..."
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="pl-9 h-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={v => { setCategoryFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-full sm:w-48 h-9">
                <div className="flex items-center gap-2">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue placeholder="Categoría" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat, i) => (
                  <SelectItem key={`${cat}-${i}`} value={cat}>
                    {cat === "all" ? "Todas las categorías" : cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex h-9 shrink-0 items-center gap-2 rounded-md border border-border bg-background px-3">
              <Checkbox id="showArchived" checked={showArchived} onCheckedChange={c => setShowArchived(!!c)} />
              <Label htmlFor="showArchived" className="text-xs font-medium cursor-pointer whitespace-nowrap">
                Ver archivados
              </Label>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-6 min-w-[220px]">Material</TableHead>
                  <TableHead className="w-[160px]">Categoría</TableHead>
                  <TableHead className="w-[160px]">Proveedor</TableHead>
                  <TableHead className="w-[120px] text-right pr-6">Stock</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-40 text-center">
                      <Loader2 className="h-7 w-7 animate-spin mx-auto text-primary/40" />
                    </TableCell>
                  </TableRow>
                ) : paginatedMaterials.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-40 text-center text-muted-foreground text-sm">
                      {searchTerm || categoryFilter !== "all"
                        ? "No se encontraron materiales con esos filtros."
                        : "Aún no hay materiales. Haz clic en \"Nuevo Material\" para comenzar."}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedMaterials.map(material => {
                    const isLowStock = !material.archived && material.stock <= 10;
                    return (
                      <TableRow
                        key={material.id}
                        className={cn(
                          "group transition-colors",
                          material.archived && "opacity-50 grayscale"
                        )}
                      >
                        <TableCell className="pl-6">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-sm">{material.name}</span>
                            {material.archived && (
                              <Badge variant="outline" className="w-fit text-[10px] h-4 px-1.5">
                                Archivado
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {material.category ? (
                            <Badge variant="secondary" className="font-normal text-xs">
                              {material.category}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <span
                            className="truncate block max-w-[150px]"
                            title={material.supplierId ? supplierMap.get(material.supplierId) || "—" : "—"}
                          >
                            {material.supplierId ? supplierMap.get(material.supplierId) || "—" : "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <div className="inline-flex flex-col items-end">
                            <span className={cn(
                              "font-mono font-semibold text-sm tabular-nums",
                              isLowStock && "text-warning"
                            )}>
                              {isLowStock && <AlertTriangle className="inline h-3 w-3 mr-1 mb-0.5" />}
                              {material.stock.toLocaleString("es-CL")}
                            </span>
                            <span className="text-[11px] text-muted-foreground">{material.unit}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {canEdit && (
                                <DropdownMenuItem onClick={() => setEditingMaterial(material)}>
                                  <Edit className="mr-2 h-4 w-4" /> Editar
                                </DropdownMenuItem>
                              )}
                              {canArchive && (
                                <DropdownMenuItem onClick={() => handleArchiveMaterial(material)}>
                                  {material.archived
                                    ? <><ArchiveRestore className="mr-2 h-4 w-4" /> Restaurar</>
                                    : <><Archive className="mr-2 h-4 w-4" /> Archivar</>}
                                </DropdownMenuItem>
                              )}
                              {canDelete && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <DropdownMenuItem
                                      onSelect={e => e.preventDefault()}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                    </DropdownMenuItem>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>¿Eliminar este material?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Se eliminará <b>{material.name}</b> de forma permanente. Esta acción no se puede deshacer.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction
                                        className="bg-destructive hover:bg-destructive/90"
                                        onClick={() => handleDeleteMaterial(material.id, material.name)}
                                      >
                                        Eliminar
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
      </PanelCard>

      {/* ── Recent activity ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Salidas */}
        <PanelCard title="Salidas Recientes" icon={ArrowUpRight} tone="warning">
          {recentApproved.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Sin salidas recientes.</p>
          ) : (
            <div className="space-y-2">
              {recentApproved.map(req => (
                <div key={req.id} className={ACTIVITY_ROW}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      {req.items && req.items.length > 0
                        ? `${req.items.length} ítem${req.items.length > 1 ? "s" : ""}: ${req.items.map(i => materialMap.get(i.materialId)?.name || "—").join(", ")}`
                        : materialMap.get(req.materialId || "")?.name || "—"}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {req.area} · {userMap.get(req.supervisorId)?.name?.split(" ")[0] || "—"}
                    </p>
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
                    {getRelativeTime(req.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </PanelCard>

        {/* Ingresos */}
        <PanelCard title="Ingresos Recientes" icon={ArrowDownLeft} tone="success">
          {recentReceived.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Sin ingresos recientes.</p>
          ) : (
            <div className="space-y-2">
              {recentReceived.map(mov => {
                const typeLabel: Record<string, string> = {
                  'manual-entry': 'Manual',
                  'initial': 'Inicial',
                  'request-delivery': 'Compra',
                  'adjustment': 'Ajuste',
                };
                return (
                  <div key={mov.id} className={ACTIVITY_ROW}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">
                        {mov.materialName}{" "}
                        <span className="font-mono font-bold text-success">
                          +{mov.quantityChange}
                        </span>
                      </p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <StatusBadge tone="neutral" className="px-1.5 py-0 text-[10px]">
                          {typeLabel[mov.type] ?? mov.type}
                        </StatusBadge>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {mov.userName?.split(" ")[0]}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
                      {getRelativeTime(mov.date)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </PanelCard>

        {/* Devoluciones */}
        <PanelCard title="Devoluciones Recientes" icon={Undo2} tone="info">
          {recentReturns.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Sin devoluciones recientes.</p>
          ) : (
            <div className="space-y-2">
              {recentReturns.map(ret => (
                <div key={ret.id} className={ACTIVITY_ROW}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      {ret.materialName}{" "}
                      <span className="font-mono font-bold text-info">
                        +{ret.quantity} {ret.unit}
                      </span>
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <p className="truncate text-[11px] text-muted-foreground">
                        {ret.supervisorName?.split(" ")[0] || "—"}
                      </p>
                      <StatusBadge
                        tone={ret.status === "completed" ? "success" : ret.status === "rejected" ? "danger" : "warning"}
                        className="px-1.5 py-0 text-[10px]"
                      >
                        {ret.status === "completed" ? "Recibido" : ret.status === "rejected" ? "Rechazado" : "Pendiente"}
                      </StatusBadge>
                    </div>
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
                    {getRelativeTime(ret.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </PanelCard>

      </div>
    </div>
  );
}
