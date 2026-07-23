
"use client";

import React, { useState, useMemo } from 'react';
import { PageHeader } from "@/components/page-header";
import { useAppState, useAuth } from "@/modules/core/contexts/app-provider";
import { PanelCard } from "@/components/ui/panel-card";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/modules/core/hooks/use-toast";
import {
  Send,
  Loader2,
  Clock,
  Check,
  X,
  PackageCheck,
  Box,
  FileText,
  Plus,
  Trash2,
  ShoppingCart,
  ChevronsUpDown,
  Search,
  AlertTriangle,
  FolderOpen
} from "lucide-react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Material } from "@/modules/core/lib/data";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { toDate } from "@/lib/date-utils";

// --- Constantes y Tipos ---
const PURCHASE_UNITS_FALLBACK = ["unidad", "caja", "m2", "m3", "litro", "kg", "tonelada", "metro", "paquete", "global"];

interface CartItem {
  tempId: string;
  materialId?: string; // Opcional, si es material nuevo no tiene ID
  materialName: string;
  category: string;
  quantity: number;
  unit: string;
}

export default function PurchaseRequestFormPage() {
  const { purchaseRequests, materials, addPurchaseRequest, materialCategories, units, currentProjectId, projects } = useAppState();
  const { user: authUser } = useAuth();
  const { toast } = useToast();

  // --- Estados del Formulario (Carrito) ---
  const [cart, setCart] = useState<CartItem[]>([]);
  const [commonArea, setCommonArea] = useState("");
  const [commonJustification, setCommonJustification] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Estados de Item Individual (Input) ---
  const [currentMaterialId, setCurrentMaterialId] = useState<string | null>(null);
  const [currentName, setCurrentName] = useState("");
  const [currentCategory, setCurrentCategory] = useState("");
  const [currentQuantity, setCurrentQuantity] = useState("");
  const [currentUnit, setCurrentUnit] = useState("");
  
  // --- Estados de UI ---
  const [materialPopoverOpen, setMaterialPopoverOpen] = useState(false);
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [unitPopoverOpen, setUnitPopoverOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // --- Helpers & Memos ---

  // Unidades: primero las del DB, luego los fallback que no estén ya
  const allUnits = useMemo(() => {
    const fromDb = (units || []).map(u => u.name);
    const extras = PURCHASE_UNITS_FALLBACK.filter(u => !fromDb.map(n => n.toLowerCase()).includes(u.toLowerCase()));
    return [...fromDb, ...extras];
  }, [units]);

  // Agrupar materiales por categoría, deduplicando por nombre
  const groupedMaterials = useMemo(() => {
    const seen = new Set<string>();
    const groups: Record<string, Material[]> = {};
    (materials || []).forEach((m) => {
      const key = m.name.toLowerCase().trim();
      if (seen.has(key)) return;
      seen.add(key);
      const cat = m.category || "Otros";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(m);
    });
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => a.name.localeCompare(b.name));
    });
    return groups;
  }, [materials]);

  const getDate = (date: Date | string | null | undefined): Date | null => toDate(date);

  const formatDate = (date: any) => {
      const d = getDate(date);
      return d ? d.toLocaleDateString("es-CL", { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';
  }

  // --- Lógica del Carrito ---

  const handleSelectMaterial = (material: Material) => {
      setCurrentMaterialId(material.id);
      setCurrentName(material.name);
      setCurrentCategory(material.category || "");
      setCurrentUnit(material.unit || ""); 
      setMaterialPopoverOpen(false);
  };

  const handleAddItem = () => {
      // Validaciones
      if (!currentName.trim()) {
          toast({ variant: "destructive", title: "Falta Nombre", description: "Debes seleccionar o escribir un nombre de material." });
          return;
      }
      if (!currentQuantity || Number(currentQuantity) <= 0) {
          toast({ variant: "destructive", title: "Cantidad Inválida", description: "Ingresa una cantidad positiva." });
          return;
      }
      if (!currentUnit) {
          toast({ variant: "destructive", title: "Falta Unidad", description: "Selecciona una unidad de medida." });
          return;
      }

      const newItem: CartItem = {
          tempId: Math.random().toString(36).substr(2, 9),
          materialId: currentMaterialId || undefined,
          materialName: currentName,
          category: currentCategory || "General",
          quantity: Number(currentQuantity),
          unit: currentUnit
      };

      setCart([...cart, newItem]);
      
      // Reset inputs parciales para el siguiente item
      setCurrentMaterialId(null);
      setCurrentName("");
      setCurrentQuantity("");
      // Mantenemos la unidad y categoría por si quiere agregar algo similar, es mejor UX
  };

  const handleRemoveItem = (id: string) => {
      setCart(cart.filter(i => i.tempId !== id));
  };

  const handleSubmitAll = async () => {
      if (!authUser) return;
      if (cart.length === 0) {
          toast({ variant: "destructive", title: "Carrito vacío", description: "Agrega al menos un ítem a la lista." });
          return;
      }
      if (!commonArea.trim() || !commonJustification.trim()) {
          toast({ variant: "destructive", title: "Faltan datos generales", description: "Debes especificar el área y la justificación." });
          return;
      }

      setIsSubmitting(true);
      try {
          const promises = cart.map(item => {
              return addPurchaseRequest({
                  materialName: item.materialName,
                  quantity: item.quantity,
                  unit: item.unit,
                  category: item.category,
                  area: commonArea,
                  justification: commonJustification,
                  supervisorId: authUser.id,
              });
          });

          await Promise.all(promises);

          toast({ 
              title: "Solicitud Enviada", 
              description: `Se enviaron ${cart.length} ítems correctamente a aprobación.` 
          });

          // Limpiar todo
          setCart([]);
          setCommonArea("");
          setCommonJustification("");
          setCurrentName("");
          setCurrentQuantity("");

      } catch (error: any) {
          console.error(error);
          toast({ variant: "destructive", title: "Error", description: error?.message || "Hubo un problema al procesar la solicitud." });
      } finally {
          setIsSubmitting(false);
      }
  };

  // --- Historial y Filtros ---

  const myRequests = useMemo(() => {
    if (!purchaseRequests || !authUser) return [];
    let reqs = purchaseRequests.filter(r => r.supervisorId === authUser.id);
    
    if (statusFilter !== 'all') {
        reqs = reqs.filter(r => r.status === statusFilter);
    }

    return reqs.sort((a, b) => (getDate(b.createdAt)?.getTime() || 0) - (getDate(a.createdAt)?.getTime() || 0));
  }, [purchaseRequests, authUser, statusFilter]);

  const paginatedRequests = myRequests.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil(myRequests.length / itemsPerPage);

  const getStatusBadge = (status: string) => {
    const cfg: Record<string, { tone: StatusTone; label: string; icon: React.ElementType }> = {
        pending:  { tone: "warning", label: "Pendiente", icon: Clock },
        approved: { tone: "success", label: "Aprobado",  icon: Check },
        rejected: { tone: "danger",  label: "Rechazado", icon: X },
        received: { tone: "info",    label: "Recibido",  icon: PackageCheck },
        ordered:  { tone: "info",    label: "Ordenado",  icon: FileText },
        batched:  { tone: "neutral", label: "En Lote",   icon: Box },
    };
    const c = cfg[status];
    if (!c) return <StatusBadge tone="neutral">{status}</StatusBadge>;
    return <StatusBadge tone={c.tone} icon={c.icon} className="w-fit whitespace-nowrap">{c.label}</StatusBadge>;
  };

  return (
    <div className="flex flex-col gap-8 pb-12 fade-in">
      <PageHeader
        title="Solicitud de Compra"
        description="Gestiona la adquisición de materiales externos o sin stock en bodega."
      />

      {(projects || []).length === 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning-subtle p-4 text-warning">
          <FolderOpen className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Sin obras creadas</p>
            <p className="text-warning/80">Debes crear una obra antes de realizar solicitudes de compra.{" "}
              <Link href="/dashboard/projects" className="font-medium underline underline-offset-2">Crear primera obra</Link>
            </p>
          </div>
        </div>
      )}
      {(projects || []).length > 0 && !currentProjectId && (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning-subtle p-4 text-warning">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">Selecciona una obra activa en el selector superior para poder enviar solicitudes.</p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">

        {/* --- COLUMNA IZQUIERDA: FORMULARIO CARRITO (5/12) --- */}
        <div className="xl:col-span-5 space-y-6">
            <PanelCard
                title="Nueva Compra"
                description="Agrega múltiples ítems y envíalos en una sola orden."
                icon={ShoppingCart}
                contentClassName="space-y-6"
            >
                    
                    {/* 1. Agregar Ítems */}
                    <div className="p-4 bg-muted/30 rounded-lg border border-border/50 space-y-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-muted-foreground flex justify-between">
                                <span>1. Detalle del ítem</span>
                                <span className="font-normal normal-case text-[10px] text-primary cursor-pointer hover:underline" onClick={() => { setCurrentName(""); setCurrentMaterialId(null); }}>Limpiar</span>
                            </Label>
                            
                            {/* Selector de Material */}
                            <Popover open={materialPopoverOpen} onOpenChange={setMaterialPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" role="combobox" className={cn("w-full justify-between font-normal", !currentName && "text-muted-foreground")}>
                                        <span className="truncate">{currentName || "Buscar o escribir material..."}</span>
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                    <Command>
                                        <CommandInput
                                            placeholder="Buscar o escribir nombre..."
                                            onValueChange={(val) => {
                                                setCurrentName(val);
                                                setCurrentMaterialId(null);
                                            }}
                                        />
                                        <CommandList>
                                            <CommandEmpty>
                                                <div className="p-2 space-y-1">
                                                    <p className="text-xs text-muted-foreground">No encontrado en inventario.</p>
                                                    {currentName && (
                                                        <Button variant="ghost" size="sm" className="w-full justify-start text-xs h-7" onClick={() => setMaterialPopoverOpen(false)}>
                                                            Pedir: &quot;{currentName}&quot;
                                                        </Button>
                                                    )}
                                                </div>
                                            </CommandEmpty>
                                            {Object.entries(groupedMaterials).map(([cat, items]) => (
                                                <CommandGroup key={cat} heading={cat}>
                                                    {items.map(m => (
                                                        <CommandItem key={m.id} value={m.name} onSelect={() => handleSelectMaterial(m)}>
                                                            <Check className={cn("mr-2 h-3 w-3 shrink-0", currentMaterialId === m.id ? "opacity-100" : "opacity-0")} />
                                                            {m.name}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            ))}
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-[10px] text-muted-foreground">Cantidad</Label>
                                    <Input
                                        type="number"
                                        className="h-9"
                                        placeholder="Ej: 10"
                                        value={currentQuantity}
                                        onChange={e => setCurrentQuantity(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleAddItem()}
                                    />
                                </div>
                                <div>
                                    <Label className="text-[10px] text-muted-foreground">Unidad</Label>
                                    <Popover open={unitPopoverOpen} onOpenChange={setUnitPopoverOpen}>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" role="combobox" className={cn("w-full justify-between h-9 font-normal", !currentUnit && "text-muted-foreground")}>
                                                <span className="truncate">{currentUnit || "Unidad..."}</span>
                                                <ChevronsUpDown className="ml-2 h-3 w-3 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                            <Command>
                                                <CommandInput
                                                    placeholder="Buscar o escribir..."
                                                    onValueChange={(val) => setCurrentUnit(val)}
                                                />
                                                <CommandList>
                                                    <CommandEmpty>
                                                        {currentUnit && (
                                                            <div className="p-1">
                                                                <Button variant="ghost" size="sm" className="w-full justify-start text-xs h-7" onClick={() => setUnitPopoverOpen(false)}>
                                                                    Usar &quot;{currentUnit}&quot;
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </CommandEmpty>
                                                    <CommandGroup>
                                                        {allUnits.map(u => (
                                                            <CommandItem key={u} value={u} onSelect={() => { setCurrentUnit(u); setUnitPopoverOpen(false); }}>
                                                                <Check className={cn("mr-2 h-3 w-3 shrink-0", currentUnit === u ? "opacity-100" : "opacity-0")} />
                                                                {u}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>

                            <div>
                                <Label className="text-[10px] text-muted-foreground">Categoría (Opcional)</Label>
                                <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" size="sm" role="combobox" className="w-full justify-between h-9 font-normal">
                                            <span className="truncate">{currentCategory || "Seleccionar o escribir categoría..."}</span>
                                            <ChevronsUpDown className="ml-2 h-3 w-3 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                        <Command>
                                            <CommandInput
                                                placeholder="Buscar o escribir..."
                                                onValueChange={(val) => setCurrentCategory(val)}
                                                value={currentCategory}
                                            />
                                            <CommandList>
                                                <CommandEmpty>
                                                    <div className="p-1">
                                                        <Button variant="ghost" size="sm" className="w-full justify-start text-xs h-7" onClick={() => setCategoryPopoverOpen(false)}>
                                                            Usar &quot;{currentCategory}&quot;
                                                        </Button>
                                                    </div>
                                                </CommandEmpty>
                                                <CommandGroup>
                                                    {(materialCategories || []).map(cat => (
                                                        <CommandItem key={cat.id} value={cat.name} onSelect={() => { setCurrentCategory(cat.name); setCategoryPopoverOpen(false); }}>
                                                            <Check className={cn("mr-2 h-3 w-3 shrink-0", currentCategory === cat.name ? "opacity-100" : "opacity-0")} />
                                                            {cat.name}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>
                            
                            <Button className="w-full mt-2 gap-2" variant="secondary" onClick={handleAddItem} disabled={!currentName}>
                                <Plus className="h-4 w-4" /> Agregar a la lista
                            </Button>
                        </div>
                    </div>

                    {/* 2. Lista del Carrito */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-end">
                            <Label className="text-xs font-bold uppercase text-muted-foreground">2. Lista de Pedido ({cart.length})</Label>
                            {cart.length > 0 && <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive hover:text-destructive/80 hover:bg-destructive/10" onClick={() => setCart([])}>Borrar todo</Button>}
                        </div>
                        
                        <ScrollArea className="h-[220px] border rounded-md bg-background p-2">
                            {cart.length > 0 ? (
                                <div className="space-y-2">
                                    {cart.map((item, idx) => (
                                        <div key={item.tempId} className="flex items-center justify-between p-2.5 rounded-md bg-muted/40 border border-transparent hover:border-muted-foreground/20 transition-all group">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <StatusBadge tone="neutral" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full p-0">
                                                    {idx + 1}
                                                </StatusBadge>
                                                <div className="min-w-0">
                                                    <p className="font-medium text-sm truncate">{item.materialName}</p>
                                                    <p className="text-[10px] text-muted-foreground">{item.category} • <span className="font-semibold text-foreground">{item.quantity} {item.unit}</span></p>
                                                </div>
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleRemoveItem(item.tempId)}>
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-muted-foreground/40 gap-2">
                                    <ShoppingCart className="h-8 w-8" />
                                    <p className="text-xs">La lista está vacía.</p>
                                </div>
                            )}
                        </ScrollArea>
                    </div>

                    {/* 3. Datos Comunes y Envío */}
                    <div className="space-y-4 pt-4 border-t">
                        <div className="space-y-3">
                            <Label className="text-xs font-bold uppercase text-muted-foreground mb-1.5 block">3. Información General</Label>
                            <div>
                                <Input 
                                    placeholder="Área / Proyecto de destino (Ej: Torre A, Obra Gruesa)" 
                                    value={commonArea}
                                    onChange={e => setCommonArea(e.target.value)}
                                    className="mb-2 bg-background"
                                />
                                <Textarea 
                                    placeholder="Justificación de la compra (Ej: Stock agotado para fase 2)" 
                                    className="resize-none h-20 bg-background"
                                    value={commonJustification}
                                    onChange={e => setCommonJustification(e.target.value)}
                                />
                            </div>
                        </div>

                        <Button
                            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-11 shadow-md text-base"
                            onClick={handleSubmitAll}
                            disabled={isSubmitting || cart.length === 0 || !commonArea || !commonJustification || !currentProjectId}
                        >
                            {isSubmitting ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando Pedido...</>
                            ) : (
                                <><Send className="mr-2 h-4 w-4" /> Enviar Solicitud de Compra</>
                            )}
                        </Button>
                    </div>

            </PanelCard>
        </div>

        {/* --- COLUMNA DERECHA: HISTORIAL (7/12) --- */}
        <div className="xl:col-span-7">
                    <div className="mb-4 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                        <div>
                            <h2 className="text-xl font-bold tracking-tight">Historial de Compras</h2>
                            <p className="text-sm text-muted-foreground">Seguimiento de tus solicitudes externas.</p>
                        </div>
                        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Filtrar Estado" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas</SelectItem>
                                <SelectItem value="pending">Pendientes</SelectItem>
                                <SelectItem value="approved">Aprobadas</SelectItem>
                                <SelectItem value="ordered">Ordenados</SelectItem>
                                <SelectItem value="received">Recibidos</SelectItem>
                                <SelectItem value="rejected">Rechazadas</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-border bg-card">
                        <Table>
                            <TableHeader className="bg-muted">
                                <TableRow>
                                    <TableHead className="w-[35%]">Material</TableHead>
                                    <TableHead className="w-[20%]">Cantidad</TableHead>
                                    <TableHead className="w-[25%]">Fecha</TableHead>
                                    <TableHead className="w-[20%] text-right">Estado</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paginatedRequests.length > 0 ? (
                                    paginatedRequests.map((req) => (
                                        <TableRow key={req.id} className="hover:bg-muted/20 transition-colors">
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-foreground text-sm">{req.materialName}</span>
                                                    <span className="text-[10px] text-muted-foreground uppercase">{req.category || 'General'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-sm font-mono text-muted-foreground">
                                                    <span className="font-bold text-foreground">{req.quantity}</span> {req.unit}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                <div className="flex flex-col">
                                                    <span>{formatDate(req.createdAt)}</span>
                                                    <span className="text-[10px] opacity-70 truncate max-w-[120px]" title={req.area}>{req.area}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {getStatusBadge(req.status)}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-40 text-center text-muted-foreground">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <Search className="h-8 w-8 opacity-20" />
                                                <p>No se encontraron solicitudes.</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Paginación */}
                    {totalPages > 1 && (
                        <div className="flex justify-center items-center gap-2 mt-4">
                            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                                Anterior
                            </Button>
                            <span className="text-xs text-muted-foreground px-2">
                                Página {currentPage} de {totalPages}
                            </span>
                            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                                Siguiente
                            </Button>
                        </div>
                    )}
        </div>
      </div>
    </div>
  );
}
