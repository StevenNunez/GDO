
"use client";

import React, { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { useAppState, useAuth } from "@/modules/core/contexts/app-provider";
import { PanelCard } from "@/components/ui/panel-card";
import { SurfaceCard } from "@/components/ui/surface-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/modules/core/hooks/use-toast";
import {
  Send,
  Loader2,
  ChevronsUpDown,
  Check,
  Clock,
  Package,
  X,
  Plus,
  Trash2,
  AlertCircle,
  ShoppingCart,
  Search,
  AlertTriangle,
  FolderOpen
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Material, MaterialRequest } from "@/modules/core/lib/data";
import { toDate } from "@/lib/date-utils";

interface CartItem {
  materialId: string;
  materialName: string;
  quantity: number;
  unit: string;
  stock: number;
  category: string;
}

// Extend the MaterialRequest type to include old format for compatibility
type CompatibleMaterialRequest = MaterialRequest & {
  materialId?: string;
  quantity?: number;
  items?: { materialId: string; quantity: number }[];
};

export default function SupervisorRequestPage() {
  const { materials, addMaterialRequest, requests, isLoading, currentProjectId, projects } = useAppState();
  const { user: authUser } = useAuth();
  const { toast } = useToast();

  // State for the new multi-item request form
  const [cart, setCart] = useState<CartItem[]>([]);
  const [area, setArea] = useState("");
  const [phase, setPhase] = useState("");
  const [activity, setActivity] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State for the temporary item being added
  const [currentMaterialId, setCurrentMaterialId] = useState<string | null>(null);
  const [currentQuantity, setCurrentQuantity] = useState<number | string>("");
  const [popoverOpen, setPopoverOpen] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [page, setPage] = useState(1);
  const itemsPerPage = 5;

  // --- Memos & Helpers ---

  const materialMap = useMemo(() => new Map((materials || []).map((m: Material) => [m.id, m])), [materials]);

  // Group materials by category for better UX in the Command component
  const groupedMaterials = useMemo(() => {
    const groups: Record<string, Material[]> = {};
    (materials || []).forEach((m) => {
      if (m.archived) return;
      const cat = m.category || "Otros";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(m);
    });
    // Sort items within groups
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => a.name.localeCompare(b.name));
    });
    return groups;
  }, [materials]);

  const myRequests = useMemo(() =>
    ((requests || []) as CompatibleMaterialRequest[])
      .filter((r) => r.supervisorId === authUser?.id)
      .sort((a, b) => {
        const dateA = toDate(a.createdAt)?.getTime() || 0;
        const dateB = toDate(b.createdAt)?.getTime() || 0;
        return dateB - dateA;
      }),
    [requests, authUser]);

  const filteredRequests = useMemo(() => {
    if (statusFilter === "all") return myRequests;
    return myRequests.filter((r) => r.status === statusFilter);
  }, [myRequests, statusFilter]);

  const paginatedRequests = filteredRequests.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );
  const totalPages = Math.ceil(filteredRequests.length / itemsPerPage);

  const formatDate = (date: Date | string | null | undefined): string => {
    const jsDate = toDate(date);
    if (!jsDate) return "N/A";
    return jsDate.toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <StatusBadge tone="warning" icon={Clock}>Pendiente</StatusBadge>;
      case "approved":
        return <StatusBadge tone="success" icon={Check}>Aprobado</StatusBadge>;
      case "rejected":
        return <StatusBadge tone="danger" icon={X}>Rechazado</StatusBadge>;
      default:
        return <StatusBadge tone="neutral">{status}</StatusBadge>;
    }
  };

  // --- Handlers ---

  const handleAddItemToCart = useCallback(() => {
    if (!currentMaterialId || !currentQuantity) {
      toast({ variant: "destructive", title: "Datos incompletos", description: "Selecciona un material y una cantidad." });
      return;
    }
    const material = materialMap.get(currentMaterialId);
    if (!material) return;

    const quantity = Number(currentQuantity);
    if (isNaN(quantity) || quantity <= 0) {
      toast({ variant: "destructive", title: "Error", description: "La cantidad debe ser mayor a 0." });
      return;
    }
    if (quantity > material.stock) {
      toast({ variant: "destructive", title: "Stock insuficiente", description: `Solo hay ${material.stock} unidades disponibles.` });
      return;
    }

    // Check if exists to update or add
    setCart(prev => {
      const exists = prev.find(item => item.materialId === currentMaterialId);
      if (exists) {
        toast({ title: "Actualizado", description: "Se actualizó la cantidad del material en la lista." });
        return prev.map(item => item.materialId === currentMaterialId ? { ...item, quantity } : item);
      }
      return [...prev, {
        materialId: material.id,
        materialName: material.name,
        quantity,
        unit: material.unit,
        stock: material.stock,
        category: material.category || "General"
      }];
    });

    // Reset fields
    setCurrentMaterialId(null);
    setCurrentQuantity("");
    setPopoverOpen(false);
  }, [currentMaterialId, currentQuantity, materialMap, toast]);

  const handleRemoveItemFromCart = (materialId: string) => {
    setCart(cart.filter(item => item.materialId !== materialId));
  };

  const handleUpdateCartQuantity = (materialId: string, newQty: string) => {
    const qty = Number(newQty);
    if (isNaN(qty) || qty < 0) return;

    setCart(prev => prev.map(item => {
      if (item.materialId === materialId) {
        // Validar stock inline
        if (qty > item.stock) {
          toast({ variant: "destructive", title: "Stock límite", description: `Máximo ${item.stock} unidades.` });
          return { ...item, quantity: item.stock };
        }
        return { ...item, quantity: qty };
      }
      return item;
    }));
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0 || !area.trim() || !authUser) {
      toast({ variant: "destructive", title: "Error", description: "Añade materiales y define el área de destino." });
      return;
    }

    setIsSubmitting(true);
    try {
      await addMaterialRequest({
        items: cart.map(({ materialId, quantity }) => ({ materialId, quantity })),
        area,
        phase,
        activity,
        supervisorId: authUser.id,
      });
      toast({ title: "Solicitud Enviada", description: "El administrador revisará tu pedido." });
      setCart([]);
      setArea("");
      setPhase("");
      setActivity("");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error?.message || "No se pudo procesar la solicitud." });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-[50vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  // Helper para el material seleccionado actual
  const currentSelectedMaterial = currentMaterialId ? materialMap.get(currentMaterialId) : null;

  return (
    <div className="flex flex-col gap-8 pb-10 fade-in">
      <PageHeader
        title="Solicitud de Materiales"
        description="Genera pedidos de material a la bodega central para tus obras."
      />

      {/* Sin obra seleccionada */}
      {projects.length === 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning-subtle p-4">
          <FolderOpen className="h-5 w-5 shrink-0 text-warning" />
          <div className="flex-1">
            <p className="text-sm font-medium text-warning">No hay obras creadas</p>
            <p className="mt-0.5 text-xs text-warning/80">Crea una obra antes de enviar solicitudes.</p>
          </div>
          <Button asChild size="sm" variant="outline" className="shrink-0 border-warning/40 text-warning hover:bg-warning/10">
            <Link href="/dashboard/projects">Crear obra</Link>
          </Button>
        </div>
      )}
      {projects.length > 0 && !currentProjectId && (
        <div className="flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning-subtle p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
          <p className="text-sm font-medium text-warning">
            Selecciona una obra en la barra superior para poder enviar solicitudes.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* COLUMNA IZQUIERDA: FORMULARIO (5/12) */}
        <div className="lg:col-span-5 space-y-6">
          <PanelCard
            title="Nueva Solicitud"
            description="Agrega los ítems que necesitas."
            icon={ShoppingCart}
          >
              <form onSubmit={handleRequestSubmit} className="space-y-6">

                {/* Selector de Materiales */}
                <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase text-muted-foreground">1. Seleccionar Material</Label>
                    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" className="w-full justify-between h-10" disabled={isSubmitting}>
                          <span className="truncate">
                            {currentSelectedMaterial ? currentSelectedMaterial.name : "Buscar material..."}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[320px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Buscar por nombre..." />
                          <CommandList>
                            <CommandEmpty>No encontrado.</CommandEmpty>
                            {Object.entries(groupedMaterials).map(([category, items]) => (
                              <CommandGroup key={category} heading={category}>
                                {items.map(m => (
                                  <CommandItem
                                    key={m.id}
                                    value={m.name}
                                    disabled={m.stock <= 0}
                                    onSelect={() => {
                                      setCurrentMaterialId(m.id);
                                      setPopoverOpen(false);
                                      // Auto-focus quantity logic could go here
                                    }}
                                  >
                                    <div className="flex justify-between w-full items-center">
                                      <span className={cn(m.stock <= 0 && "text-muted-foreground line-through")}>{m.name}</span>
                                      <div className="flex items-center gap-2">
                                        <span className={cn("text-xs", m.stock < 10 ? "text-danger font-bold" : "text-muted-foreground")}>
                                          {m.stock} {m.unit}
                                        </span>
                                        {currentMaterialId === m.id && <Check className="h-4 w-4 text-primary" />}
                                      </div>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            ))}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="flex gap-3 items-end">
                    <div className="space-y-2 flex-grow">
                      <Label htmlFor="quantity" className="text-xs font-semibold uppercase text-muted-foreground">2. Cantidad</Label>
                      <div className="relative">
                        <Input
                          id="quantity"
                          type="number"
                          placeholder="0"
                          value={currentQuantity}
                          onChange={e => setCurrentQuantity(e.target.value)}
                          disabled={!currentMaterialId || isSubmitting}
                          className="pr-10"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddItemToCart();
                            }
                          }}
                        />
                        <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">
                          {currentSelectedMaterial?.unit || 'ud'}
                        </span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      onClick={handleAddItemToCart}
                      disabled={!currentMaterialId || !currentQuantity || isSubmitting}
                      className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    >
                      <Plus className="h-4 w-4 mr-1" /> Agregar
                    </Button>
                  </div>

                  {/* Stock Helper Text */}
                  {currentSelectedMaterial && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Disponible:</span>
                      <span className={cn("font-medium", currentSelectedMaterial.stock < 10 ? "text-danger" : "text-success")}>
                        {currentSelectedMaterial.stock} {currentSelectedMaterial.unit}
                      </span>
                      {Number(currentQuantity) > currentSelectedMaterial.stock && (
                        <span className="ml-auto flex items-center gap-1 font-bold text-danger">
                          <AlertCircle className="h-3 w-3" /> Excede stock
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Lista del Carrito */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label>Resumen del Pedido</Label>
                    <span className="text-xs text-muted-foreground">{cart.length} ítems</span>
                  </div>

                  <ScrollArea className="h-[200px] w-full rounded-md border bg-card p-1">
                    {cart.length > 0 ? (
                      <div className="space-y-1">
                        {cart.map(item => (
                          <div key={item.materialId} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 group transition-colors border border-transparent hover:border-muted">
                            <div className="flex-1 min-w-0 mr-3">
                              <p className="text-sm font-medium truncate">{item.materialName}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{item.category}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => handleUpdateCartQuantity(item.materialId, e.target.value)}
                                className="h-7 w-16 text-right text-xs px-1"
                              />
                              <span className="text-xs text-muted-foreground w-6">{item.unit}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => handleRemoveItemFromCart(item.materialId)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-2 opacity-50">
                        <Package className="h-8 w-8" />
                        <p className="text-xs">Tu lista está vacía</p>
                      </div>
                    )}
                  </ScrollArea>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phase">Fase / Partida</Label>
                      <Input
                        id="phase"
                        placeholder="Ej: Obra Gruesa"
                        value={phase}
                        onChange={(e) => setPhase(e.target.value)}
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="activity">Actividad</Label>
                      <Input
                        id="activity"
                        placeholder="Ej: Enfierradura"
                        value={activity}
                        onChange={(e) => setActivity(e.target.value)}
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="area">Ubicación Específica</Label>
                    <Input
                      id="area"
                      placeholder="Ej: Torre A, Piso 3"
                      value={area}
                      onChange={(e) => setArea(e.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>
                  <Button type="submit" className="w-full h-11 text-base shadow-md" disabled={isSubmitting || cart.length === 0 || !area.trim() || !currentProjectId}>
                    {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando...</> : <><Send className="mr-2 h-4 w-4" /> Enviar Solicitud</>}
                  </Button>
                </div>

              </form>
          </PanelCard>
        </div>

        {/* COLUMNA DERECHA: HISTORIAL (7/12) */}
        <div className="lg:col-span-7">
          <div className="mb-4 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-lg font-bold tracking-tight">Historial</h2>
                  <p className="text-sm text-muted-foreground">Tus solicitudes recientes.</p>
                </div>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => { setStatusFilter(v as any); setPage(1); }}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Filtrar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="pending">Pendientes</SelectItem>
                    <SelectItem value="approved">Aprobadas</SelectItem>
                    <SelectItem value="rejected">Rechazadas</SelectItem>
                  </SelectContent>
                </Select>
          </div>
              <div className="space-y-4">
                {paginatedRequests.length > 0 ? (
                  paginatedRequests.map((req) => (
                    <SurfaceCard key={req.id} interactive={false}>
                      <div className="flex flex-col gap-4 p-4 sm:flex-row">
                        {/* Info Principal */}
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            {getStatusBadge(req.status)}
                            <span className="text-xs text-muted-foreground flex items-center">
                              <Clock className="h-3 w-3 mr-1" /> {formatDate(req.createdAt)}
                            </span>
                          </div>
                          <div className="text-sm">
                            <span className="font-semibold text-muted-foreground">Destino:</span> {req.area}
                          </div>

                          {/* Lista de Ítems */}
                          <div className="mt-3 bg-muted/30 rounded-md p-2 text-sm space-y-1">
                            {req.items && req.items.length > 0 ? (
                              req.items.map((item, idx) => {
                                const mat = materialMap.get(item.materialId);
                                return (
                                  <div key={idx} className="flex justify-between items-center border-b border-muted/50 last:border-0 pb-1 last:pb-0">
                                    <span>{mat?.name || "Material desconocido"}</span>
                                    <span className="font-mono font-medium text-xs">{item.quantity} {mat?.unit || 'u'}</span>
                                  </div>
                                )
                              })
                            ) : (
                              <div className="flex justify-between items-center">
                                <span>{materialMap.get(req.materialId || '')?.name}</span>
                                <span className="font-mono font-medium">{req.quantity}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </SurfaceCard>
                  ))
                ) : (
                  <div className="rounded-2xl border-2 border-dashed border-border py-12 text-center">
                    <Search className="mx-auto mb-2 h-10 w-10 text-muted-foreground/50" />
                    <p className="text-muted-foreground">No se encontraron solicitudes.</p>
                  </div>
                )}
                {/* Paginación */}
                {totalPages > 1 && (
                  <div className="mt-4 flex justify-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Anterior</Button>
                    <span className="flex items-center px-2 text-sm text-muted-foreground">Página {page} de {totalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Siguiente</Button>
                  </div>
                )}
              </div>
        </div>
      </div>
    </div>
  );
}
