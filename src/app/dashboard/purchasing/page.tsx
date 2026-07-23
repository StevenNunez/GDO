
"use client";

import * as React from "react";
import { useAppState, useAuth } from "@/modules/core/contexts/app-provider";
import {
  ShoppingCart,
  ThumbsUp,
  Box,
  FileText,
  Warehouse,
  Truck,
  PackageCheck,
  Search,
  User as UserIcon,
  ArrowRight,
  CheckCircle2,
  Loader2,
  FilePlus2,
  AlertTriangle,
  Filter,
  PackageMinus,
  ChevronsUpDown,
  Check,
  Package,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { PanelCard } from "@/components/ui/panel-card";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/page-header";
import { useLots } from "@/hooks/use-lots";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Material, PurchaseRequest, User } from "@/modules/core/lib/data";
import { Button } from "@/components/ui/button";
import { useToast } from "@/modules/core/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatDistanceToNow } from "date-fns";
import { toDate } from "@/lib/date-utils";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
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


// --- Receive Dialog Component ---
interface ReceiveRequestDialogProps {
  request: PurchaseRequest | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    requestId: string,
    quantity: number,
    materialId?: string
  ) => Promise<void>;
  materials: Material[];
}

function ReceiveRequestDialog({
  request,
  isOpen,
  onClose,
  onConfirm,
  materials,
}: ReceiveRequestDialogProps) {
  const [receivedQuantity, setReceivedQuantity] = React.useState<number | string>("");
  const [selectedMaterialId, setSelectedMaterialId] = React.useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [popoverOpen, setPopoverOpen] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    if (request) {
      setReceivedQuantity(request.quantity);
      // Intentar autoseleccionar material existente
      const existingMaterial = materials.find(
        (m) => m.name.toLowerCase().trim() === request.materialName.toLowerCase().trim()
      );
      setSelectedMaterialId(existingMaterial?.id);
    }
  }, [request, materials]);

  const handleConfirmClick = async () => {
    if (!request) return;
    const quantityNum = Number(receivedQuantity);
    if (isNaN(quantityNum) || quantityNum <= 0) {
      toast({
        variant: "destructive",
        title: "Cantidad inválida",
        description: "Por favor ingresa un número positivo.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm(request.id, quantityNum, selectedMaterialId);
      onClose();
    } catch {
      // el error ya fue mostrado en onConfirm, solo detenemos el spinner
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!request) return null;

  const existingMaterial = materials.find(
    (m) => m.name.toLowerCase().trim() === request.materialName.toLowerCase().trim()
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-success" />
            Recepción de Material
          </DialogTitle>
          <DialogDescription>
            Ingreso a bodega de: <span className="font-semibold text-foreground">{request.materialName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="receivedQuantity">Cantidad Recibida</Label>
              <span className="text-xs text-muted-foreground">Comprado: {request.quantity} {request.unit}</span>
            </div>
            <div className="relative">
              <Input
                id="receivedQuantity"
                type="number"
                min={0.01}
                max={request.quantity}
                step="any"
                value={receivedQuantity}
                onChange={(e) => setReceivedQuantity(e.target.value)}
                className="pr-12 font-mono text-lg"
              />
              <span className="absolute right-3 top-2.5 text-sm text-muted-foreground">{request.unit}</span>
            </div>
            {Number(receivedQuantity) > 0 && Number(receivedQuantity) < request.quantity && (
              <p className="flex items-center gap-1 text-xs text-warning">
                <AlertTriangle className="h-3 w-3" />
                Recepción parcial: quedarán {(request.quantity - Number(receivedQuantity)).toFixed(2)} {request.unit} pendientes de recibir.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Destino del Stock</Label>
            {existingMaterial ? (
              <div className="flex items-start gap-3 rounded-xl border border-success/25 bg-success-subtle p-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
                <div>
                  <p className="text-sm font-medium text-success">
                    Se sumará a: {existingMaterial.name}
                  </p>
                  <p className="mt-0.5 text-xs text-success/80">
                    Stock actual: {existingMaterial.stock} {existingMaterial.unit}
                  </p>
                </div>
              </div>
            ) : (
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between">
                    {selectedMaterialId
                      ? materials.find((m) => m.id === selectedMaterialId)?.name
                      : "Buscar o crear material..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                  <Command>
                    <CommandInput placeholder="Buscar material..." />
                    <CommandList>
                      <CommandEmpty>No se encontró material.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem onSelect={() => { setSelectedMaterialId("create_new"); setPopoverOpen(false); }}>
                          <Package className="mr-2 h-4 w-4" />
                          Crear como nuevo material
                        </CommandItem>
                        {materials.map((m) => (
                          <CommandItem
                            key={m.id}
                            value={m.name}
                            onSelect={() => {
                              setSelectedMaterialId(m.id);
                              setPopoverOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", m.id === selectedMaterialId ? "opacity-100" : "opacity-0")} />
                            {m.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
            <p className="text-[10px] text-muted-foreground mt-2">
              Si el material no coincide exactamente, búscalo para vincularlo, o elige crearlo como uno nuevo.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmClick} disabled={isSubmitting} className="bg-success text-background hover:bg-success/90">
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PackageCheck className="mr-2 h-4 w-4" />
            )}
            Confirmar Ingreso
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Pending Reception Card ---
const PendingReceptionCard = ({ requests, onReceiveClick, onCancelClick, users }: {
  requests: PurchaseRequest[];
  onReceiveClick: (request: PurchaseRequest) => void;
  onCancelClick: (request: PurchaseRequest) => void;
  users: User[];
}) => {
  const [materialSearch, setMaterialSearch] = React.useState("");
  const [applicantSearch, setApplicantSearch] = React.useState("");

  // Memoizar el mapa de supervisores para rendimiento O(1)
  const supervisorMap = React.useMemo(() => {
    const map = new Map<string, string>();
    users.forEach(u => map.set(u.id, u.name));
    return map;
  }, [users]);

  const filteredRequests = React.useMemo(() => {
    return requests.filter(req => {
      const materialMatch = materialSearch ? req.materialName.toLowerCase().includes(materialSearch.toLowerCase()) : true;
      const applicantName = supervisorMap.get(req.supervisorId) || '';
      const applicantMatch = applicantSearch ? applicantName.toLowerCase().includes(applicantSearch.toLowerCase()) : true;
      return materialMatch && applicantMatch;
    });
  }, [requests, materialSearch, applicantSearch, supervisorMap]);

  return (
    <PanelCard
      title="Recepción de Materiales"
      description="Gestiona el ingreso físico de materiales comprados."
      icon={Truck}
      contentClassName="px-0 pb-0"
      actions={
        requests.length > 0 ? (
          <StatusBadge tone="info">{requests.length} pendientes</StatusBadge>
        ) : undefined
      }
    >
        <div className="grid grid-cols-1 gap-4 px-6 pb-4 md:grid-cols-2">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar material..."
              value={materialSearch}
              onChange={(e) => setMaterialSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="relative">
            <UserIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filtrar por solicitante..."
              value={applicantSearch}
              onChange={(e) => setApplicantSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <ScrollArea className="h-[350px] border-t border-border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead>Material / Destino</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead className="hidden md:table-cell">Tiempo Espera</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRequests.length > 0 ? (
                filteredRequests.map((req) => {
                  // Calcular tiempo relativo
                  let timeAgo = "Reciente";
                  try {
                    if (req.approvalDate) {
                      const dateToCompare = toDate(req.approvalDate) || new Date(req.approvalDate as any);
                      timeAgo = formatDistanceToNow(dateToCompare, { locale: es, addSuffix: true });
                    }
                  } catch {
                    // Fallback for invalid dates
                    timeAgo = "Fecha inválida";
                  }

                  return (
                    <TableRow key={req.id} className="group">
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{req.materialName}</span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <UserIcon className="h-3 w-3" /> {supervisorMap.get(req.supervisorId)?.split(' ')[0] || 'N/A'} • {req.area}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone="neutral" className="font-mono">
                          {req.quantity} {req.unit}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {timeAgo}
                      </TableCell>
                      <TableCell className="text-right flex items-center justify-end gap-1">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 focus:opacity-100" title="Anular Solicitud">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Anular esta solicitud?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acción eliminará la solicitud de <strong>{req.quantity} {req.unit} de {req.materialName}</strong> permanentemente. Úsala si el material ya no se necesita o no llegará.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => onCancelClick(req)} className="bg-destructive hover:bg-destructive/90">
                                Sí, Anular
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        <Button size="sm" onClick={() => onReceiveClick(req)}>
                          Recibir <ArrowRight className="ml-1 h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-40 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <CheckCircle2 className="h-10 w-10 text-success opacity-60" />
                      <p>No hay recepciones pendientes con estos filtros.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
    </PanelCard>
  );
};

// --- Main Page Component ---
export default function PurchasingHubPage() {
  const {
    purchaseRequests,
    purchaseOrders,
    materials,
    isLoading,
    receivePurchaseRequest,
    deletePurchaseRequest,
    users,
    can,
    currentProjectId,
    projects,
  } = useAppState();
  const { user } = useAuth();
  const { batchedLots } = useLots();
  const { toast } = useToast();

  // Estados locales
  const [searchTerm, setSearchTerm] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [receivingRequest, setReceivingRequest] = React.useState<PurchaseRequest | null>(null);
  const [showLowStockOnly, setShowLowStockOnly] = React.useState(false);

  const canReceive = can('stock:receive_order');

  // --- Estadísticas ---
  const stats = React.useMemo(() => {
    const prs = purchaseRequests || [];
    return {
      pending: prs.filter((pr) => pr.status === "pending").length,
      approved: prs.filter((pr) => pr.status === "approved" && !pr.lotId).length,
      inLots: batchedLots.length, // Usamos la longitud de lotes activos
      ordered: (purchaseOrders || []).length,
    };
  }, [purchaseRequests, batchedLots, purchaseOrders]);

  const pendingReceptionRequests = React.useMemo(() => {
    return (purchaseRequests || [])
      .filter((pr) => ["approved", "batched", "ordered"].includes(pr.status))
      .sort((a, b) => {
        const dateA = a.approvalDate ? (toDate(a.approvalDate)?.getTime() ?? 0) : 0;
        const dateB = b.approvalDate ? (toDate(b.approvalDate)?.getTime() ?? 0) : 0;
        return dateB - dateA;
      });
  }, [purchaseRequests]);

  // --- Filtros de Materiales ---
  const categories = React.useMemo(() => {
    if (!materials) return [];
    const cats = new Set(materials.map((m) => m.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [materials]);

  const filteredMaterials = React.useMemo(() => {
    let result = (materials || []).filter((m) => !m.archived);

    // Filtro de texto
    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      result = result.filter((m) => m.name.toLowerCase().includes(lowerTerm));
    }

    // Filtro de categoría
    if (categoryFilter !== "all") {
      result = result.filter((m) => m.category === categoryFilter);
    }

    // Filtro de Stock Bajo (Nuevo)
    if (showLowStockOnly) {
      result = result.filter((m) => m.stock <= 10);
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [materials, searchTerm, categoryFilter, showLowStockOnly]);

  const handleReceiveConfirm = async (
    requestId: string,
    quantity: number,
    existingMaterialId?: string
  ) => {
    try {
      await receivePurchaseRequest(requestId, quantity, existingMaterialId);
      toast({
        title: "¡Recepción Exitosa!",
        description: "El stock ha sido actualizado en bodega correctamente.",
      });
      setReceivingRequest(null);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error al recibir",
        description: error instanceof Error ? error.message : "Error desconocido.",
      });
      throw error; // propagar para que el dialog no se cierre
    }
  };

  const handleCancelRequest = async (request: PurchaseRequest) => {
    try {
      await deletePurchaseRequest(request.id);
      toast({
        variant: "destructive",
        title: "Solicitud Anulada",
        description: `Se ha anulado la solicitud de ${request.materialName}.`
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo anular la solicitud."
      })
    }
  };

  return (
    <>
      {/* Dialogo Global de Recepción */}
      {canReceive && (
        <ReceiveRequestDialog
          request={receivingRequest}
          isOpen={!!receivingRequest}
          onClose={() => setReceivingRequest(null)}
          onConfirm={handleReceiveConfirm}
          materials={materials || []}
        />
      )}

      <div className="flex flex-col gap-8 pb-12 fade-in">
        <PageHeader
          title={`Hola, ${user?.name.split(" ")[0] || "Usuario"}`}
          description={
            <div className="flex flex-wrap items-center gap-2">
              <span>Centro de control de compras y gestión de inventario.</span>
              <StatusBadge tone={currentProjectId ? 'info' : 'warning'}>
                {currentProjectId ? `Obra: ${projects.find(p => p.id === currentProjectId)?.name}` : "Vista Global (Sin filtro)"}
              </StatusBadge>
            </div>
          }
          actions={
            can('purchase_requests:create') ? (
              <Button asChild variant="cta">
                <Link href="/dashboard/purchasing/purchase-request-form">
                  <FilePlus2 className="mr-2 h-4 w-4" />
                  Solicitar Material
                </Link>
              </Button>
            ) : undefined
          }
        />

        {/* --- VISTA DIFERENCIADA POR ROL --- */}

        {/* VISTA BODEGA/ADMIN: Tarjeta de Recepción Prioritaria */}
        {(user?.role === "bodega-admin" || user?.role === "admin" || user?.role === "operations") && (
          <PendingReceptionCard
            requests={pendingReceptionRequests}
            onReceiveClick={setReceivingRequest}
            onCancelClick={handleCancelRequest}
            users={users || []}
          />
        )}

        {/* --- 3. STATUS DEL FLUJO --- */}
        <div>
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold tracking-tight">
            <Filter className="h-5 w-5 text-muted-foreground" />
            Resumen del Flujo
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Pendientes" value={stats.pending} icon={ShoppingCart} tone="warning" />
            <StatTile label="Aprobadas" value={stats.approved} icon={ThumbsUp} tone="info" />
            <StatTile label="En Lote" value={stats.inLots} icon={Box} />
            <StatTile label="Ordenadas" value={stats.ordered} icon={FileText} tone="success" />
          </div>
        </div>

        {/* --- 4. CONSULTA DE STOCK (OPTIMIZADA) --- */}
        <PanelCard
          title="Consulta Rápida de Stock"
          description="Verifica disponibilidad actual en bodega para nuevas solicitudes."
          icon={Warehouse}
          contentClassName="px-0 pb-0"
        >
            {/* Filtros */}
            <div className="flex flex-col items-end justify-between gap-4 px-6 pb-4 md:flex-row md:items-center">
              <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
                <Input
                  placeholder="Buscar material..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full md:w-[250px]"
                />
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full md:w-[200px]">
                    <SelectValue placeholder="Categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2 rounded-xl border border-border bg-muted/40 p-2">
                <AlertTriangle className={cn("h-4 w-4", showLowStockOnly ? "text-danger" : "text-muted-foreground")} />
                <Label htmlFor="low-stock-mode" className="text-sm cursor-pointer">Ver Stock Crítico</Label>
                <Switch
                  id="low-stock-mode"
                  checked={showLowStockOnly}
                  onCheckedChange={setShowLowStockOnly}
                />
              </div>
            </div>

            {/* Tabla Stock */}
            <ScrollArea className="h-[400px] border-t border-border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted">
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Stock Disponible</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={3} className="h-32 text-center">
                        <div className="flex items-center justify-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> Cargando inventario...
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredMaterials.length > 0 ? (
                    filteredMaterials.map((material) => (
                      <TableRow key={material.id}>
                        <TableCell className="font-medium">
                          {material.name}
                          {material.stock <= 10 && (
                            <StatusBadge tone="danger" className="ml-2 h-5 text-[10px]">Bajo</StatusBadge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{material.category}</TableCell>
                        <TableCell className="text-right">
                          <span className={cn(
                            "font-mono font-bold",
                            material.stock <= 10 ? "text-danger" : "text-foreground"
                          )}>
                            {material.stock.toLocaleString()} {material.unit}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="h-32 text-center text-muted-foreground">
                        {searchTerm || showLowStockOnly ? (
                          <div className="flex flex-col items-center">
                            <PackageMinus className="h-8 w-8 mb-2 opacity-50" />
                            No se encontraron materiales con estos filtros.
                          </div>
                        ) : (
                          "Inventario vacío."
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
        </PanelCard>
      </div>
    </>
  );
}
