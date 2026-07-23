"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { useAppState } from "@/modules/core/contexts/app-provider";
import { PanelCard } from "@/components/ui/panel-card";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Trash2,
  MoreHorizontal,
  Edit,
  QrCode,
  ArrowLeftRight,
  PlusCircle,
  Wrench,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  Loader2,
  ArrowUpRight,
  ArrowDownLeft,
  PackagePlus,
} from "lucide-react";
import QRCode from "react-qr-code";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import { EditToolForm } from "@/components/admin/edit-tool-form";
import { GenerateToolForm } from "@/components/admin/generate-tool-form";
import { ToolCheckoutCard } from "@/components/admin/tool-checkout-card";
import { useToast } from "@/modules/core/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toDate } from "@/lib/date-utils";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import type { Tool as ToolType, ToolLog } from "@/modules/core/lib/data";

const ITEMS_PER_PAGE = 12;

// Fila de las tres listas de actividad. El color va en el dato, no en el fondo.
const ACTIVITY_ROW =
  "flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3";

export default function AdminToolsPage() {
  const {
    tools: allTools,
    toolLogs,
    users,
    projects,
    deleteTool,
    transferToolToProject,
    isLoading,
    can,
  } = useAppState();
  const { toast } = useToast();

  const [editingTool, setEditingTool]     = useState<ToolType | null>(null);
  const [transferTarget, setTransferTarget] = useState<ToolType | null>(null);
  const [destProjectId, setDestProjectId]  = useState("");
  const [isCreateOpen, setIsCreateOpen]    = useState(false);
  const [searchTerm, setSearchTerm]        = useState("");
  const [statusFilter, setStatusFilter]    = useState<"all" | "Disponible" | "Ocupado">("all");
  const [page, setPage]                    = useState(1);

  const tools    = allTools    || [];
  const logs     = toolLogs    || [];
  const allUsers = users       || [];
  const allProj  = projects    || [];

  const canDelete = can("tools:delete");
  const canCreate = can("tools:create");

  // ── Derived maps ──
  const checkedOutMap = useMemo(() => {
    const map = new Map<string, ToolLog>();
    logs
      .filter(l => l.returnDate === null)
      .forEach(l => map.set(l.toolId, l));
    return map;
  }, [logs]);

  const userNameMap = useMemo(() => {
    const map = new Map<string, string>();
    allUsers.forEach(u => map.set(u.id, u.name));
    return map;
  }, [allUsers]);

  const getInfo = useCallback((toolId: string) => {
    const log = checkedOutMap.get(toolId);
    if (!log) return { status: "Disponible" as const, workerName: null };
    return {
      status: "Ocupado" as const,
      workerName: userNameMap.get(log.userId) ?? log.userName ?? "Desconocido",
    };
  }, [checkedOutMap, userNameMap]);

  // ── Stats ──
  const stats = useMemo(() => ({
    total:      tools.length,
    available:  tools.filter(t => !checkedOutMap.has(t.id)).length,
    checkedOut: checkedOutMap.size,
  }), [tools, checkedOutMap]);

  // ── Filtering & pagination ──
  const filtered = useMemo(() => {
    return tools.filter(t => {
      const matchName   = !searchTerm || t.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === "all" || getInfo(t.id).status === statusFilter;
      return matchName && matchStatus;
    });
  }, [tools, searchTerm, statusFilter, getInfo]);

  useEffect(() => { setPage(1); }, [searchTerm, statusFilter]);

  const totalPages    = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated     = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // ── Recent activity ──
  const recentCheckouts = useMemo(() =>
    [...logs]
      .filter(l => l.checkoutDate)
      .sort((a, b) => (toDate(b.checkoutDate)?.getTime() || 0) - (toDate(a.checkoutDate)?.getTime() || 0))
      .slice(0, 6),
    [logs]
  );

  const recentReturns = useMemo(() =>
    [...logs]
      .filter(l => l.returnDate)
      .sort((a, b) => (toDate(b.returnDate)?.getTime() || 0) - (toDate(a.returnDate)?.getTime() || 0))
      .slice(0, 5),
    [logs]
  );

  const recentAdded = useMemo(() =>
    [...tools]
      .filter(t => t.createdAt)
      .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0))
      .slice(0, 5),
    [tools]
  );

  const getRelative = (date: any) => {
    const d = toDate(date);
    if (!d) return "—";
    return formatDistanceToNow(d, { addSuffix: true, locale: es });
  };

  // ── Handlers ──
  const handleDelete = async (toolId: string, toolName: string) => {
    try {
      await deleteTool(toolId);
      toast({ title: "Herramienta eliminada", description: `${toolName} ha sido eliminada.` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message || "No se pudo eliminar." });
    }
  };

  const handleTransfer = async () => {
    if (!transferTarget || !destProjectId) return;
    try {
      await transferToolToProject(transferTarget.id, destProjectId);
      toast({ title: "Transferida", description: `${transferTarget.name} fue movida a la obra seleccionada.` });
      setTransferTarget(null);
      setDestProjectId("");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-10 fade-in">
      <PageHeader
        title="Gestión de Herramientas"
        description="Inventario, préstamos y códigos QR de todas las herramientas."
      />

      {/* Dialogs */}
      <EditToolForm
        tool={editingTool}
        isOpen={!!editingTool}
        onClose={() => setEditingTool(null)}
      />

      <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-primary" /> Nueva Herramienta
            </SheetTitle>
            <SheetDescription>
              Registra una herramienta en el inventario de la obra activa. Se generará un código QR automáticamente.
            </SheetDescription>
          </SheetHeader>
          <GenerateToolForm />
        </SheetContent>
      </Sheet>

      <Dialog open={!!transferTarget} onOpenChange={open => !open && setTransferTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir &ldquo;{transferTarget?.name}&rdquo;</DialogTitle>
            <DialogDescription>Elige la obra de destino para esta herramienta.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <label className="text-sm font-medium">Obra de destino</label>
            <Select value={destProjectId} onValueChange={setDestProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar obra..." />
              </SelectTrigger>
              <SelectContent>
                {allProj
                  .filter(p => p.id !== transferTarget?.projectId)
                  .map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferTarget(null)}>Cancelar</Button>
            <Button disabled={!destProjectId} onClick={handleTransfer}>Confirmar transferencia</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile label="Total herramientas" value={stats.total} icon={Wrench} />
        <StatTile label="Disponibles" value={stats.available} icon={CheckCircle2} tone="success" />
        <StatTile
          label="En préstamo"
          value={stats.checkedOut}
          icon={Clock}
          tone={stats.checkedOut > 0 ? "warning" : "neutral"}
        />
      </div>

      {/* ── Checkout card (full width) ── */}
      <ToolCheckoutCard />

      {/* ── Inventory table (full width) ── */}
      <PanelCard
        title="Inventario de Herramientas"
        icon={Wrench}
        description={
          <>
            {filtered.length} herramienta{filtered.length !== 1 ? "s" : ""} encontrada{filtered.length !== 1 ? "s" : ""}
            {filtered.length !== tools.length && ` de ${tools.length} en total`}
          </>
        }
        actions={
          <>
            {canCreate && (
              <Button onClick={() => setIsCreateOpen(true)}>
                <PlusCircle className="mr-2 h-4 w-4" /> Nueva Herramienta
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href="/dashboard/bodega/tools/print-qrs">
                <QrCode className="mr-2 h-4 w-4" /> Imprimir QRs
              </Link>
            </Button>
          </>
        }
        contentClassName="px-0 pb-0"
        footer={
          totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                Página {page} de {totalPages} · {filtered.length} resultados
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                  Anterior
                </Button>
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
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
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
              <SelectTrigger className="w-full sm:w-44 h-9">
                <div className="flex items-center gap-2">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue placeholder="Estado" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="Disponible">Disponibles</SelectItem>
                <SelectItem value="Ocupado">En préstamo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-6 min-w-[200px]">Herramienta</TableHead>
                  <TableHead className="w-[110px] text-center">QR</TableHead>
                  <TableHead className="w-[130px]">Estado</TableHead>
                  <TableHead className="w-[160px]">En posesión de</TableHead>
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
                ) : paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-40 text-center text-muted-foreground text-sm">
                      {searchTerm || statusFilter !== "all"
                        ? "No se encontraron herramientas con esos filtros."
                        : "Aún no hay herramientas. Haz clic en \"Nueva Herramienta\" para comenzar."}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map(tool => {
                    const info        = getInfo(tool.id);
                    const isCheckedOut = info.status === "Ocupado";

                    return (
                      <TableRow key={tool.id} className="group transition-colors">
                        <TableCell className="pl-6">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-sm">{tool.name}</span>
                            {(tool.brand || tool.model) && (
                              <span className="text-xs text-muted-foreground">
                                {[tool.brand, tool.model].filter(Boolean).join(" · ")}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {/* El fondo blanco es obligatorio: un QR sobre superficie
                              teñida pierde contraste y deja de escanearse. */}
                          <div className="mx-auto w-fit rounded border border-border bg-white p-1.5 shadow-sm">
                            <QRCode value={tool.qrCode} size={40} />
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={isCheckedOut ? "warning" : "success"}>
                            {isCheckedOut ? "En préstamo" : "Disponible"}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {info.workerName ?? "—"}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Acciones</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setEditingTool(tool)}>
                                <Edit className="mr-2 h-4 w-4" /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => { setTransferTarget(tool); setDestProjectId(""); }}>
                                <ArrowLeftRight className="mr-2 h-4 w-4" /> Transferir a otra obra
                              </DropdownMenuItem>
                              {canDelete && (
                                <>
                                  <DropdownMenuSeparator />
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <DropdownMenuItem
                                        className="text-destructive focus:text-destructive"
                                        disabled={isCheckedOut}
                                        onSelect={e => e.preventDefault()}
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                      </DropdownMenuItem>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>¿Eliminar &ldquo;{tool.name}&rdquo;?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Esta acción es permanente y no se puede deshacer.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction
                                          className="bg-destructive hover:bg-destructive/90"
                                          onClick={() => handleDelete(tool.id, tool.name)}
                                        >
                                          Sí, eliminar
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </>
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

        {/* Préstamos recientes */}
        <PanelCard title="Préstamos Recientes" icon={ArrowUpRight} tone="warning">
          {recentCheckouts.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Sin préstamos registrados.</p>
          ) : (
            <div className="space-y-2">
              {recentCheckouts.map(log => (
                <div key={log.id} className={ACTIVITY_ROW}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{log.toolName}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {log.userName} · {log.checkoutSupervisorName?.split(" ")[0]}
                    </p>
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
                    {getRelative(log.checkoutDate)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </PanelCard>

        {/* Devoluciones recientes */}
        <PanelCard title="Devoluciones Recientes" icon={ArrowDownLeft} tone="success">
          {recentReturns.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Sin devoluciones registradas.</p>
          ) : (
            <div className="space-y-2">
              {recentReturns.map(log => (
                <div key={`${log.id}-ret`} className={ACTIVITY_ROW}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{log.toolName}</p>
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      {log.userName}
                      {log.returnStatus === "damaged" && (
                        <StatusBadge tone="danger" className="px-1.5 py-0 text-[10px]">Dañada</StatusBadge>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
                    {getRelative(log.returnDate)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </PanelCard>

        {/* Altas recientes */}
        <PanelCard title="Altas Recientes" icon={PackagePlus} tone="info">
          {recentAdded.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Sin herramientas ingresadas.</p>
          ) : (
            <div className="space-y-2">
              {recentAdded.map(tool => (
                <div key={tool.id} className={ACTIVITY_ROW}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{tool.name}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      {(tool.brand || tool.model) && (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {[tool.brand, tool.model].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {tool.invoiceNumber && (
                        <StatusBadge tone="info" className="shrink-0 px-1.5 py-0 text-[10px]">
                          #{tool.invoiceNumber}
                        </StatusBadge>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
                    {getRelative(tool.createdAt)}
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
