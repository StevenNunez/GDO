"use client";

import React, { useState, useMemo } from "react";
import dynamic from 'next/dynamic';
import { useAppState } from "@/modules/core/contexts/app-provider";
import { useToast } from "@/modules/core/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { formatCLP } from '@/lib/format';
import { PanelCard } from "@/components/ui/panel-card";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  CalendarIcon,
  CheckCircle,
  XCircle,
  FilePlus,
  Clock,
  Edit,
  Receipt,
  Wallet,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { format, differenceInDays, startOfDay, startOfMonth, isWithinInterval, addDays } from "date-fns";
import { toDate } from "@/lib/date-utils";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { SupplierPayment, Supplier, WorkItem } from "@/modules/core/lib/data";
import { MarkAsPaidDialog } from "@/components/admin/mark-as-paid-dialog";
import { EditPaymentForm } from "@/components/admin/edit-payment-form";

const Calendar = dynamic(() => import('@/components/ui/calendar').then(mod => mod.Calendar), { ssr: false });

type PaymentStatus = "pending" | "paid" | "overdue";

// === Subcomponente para crear factura ===
const CreatePaymentForm = ({
  suppliers,
  projects,
  workItems,
  defaultProjectId,
  addPayment,
}: {
  suppliers: Supplier[];
  projects: { id: string; name: string }[];
  workItems: WorkItem[];
  defaultProjectId: string | null;
  addPayment: (data: any) => Promise<void>;
}) => {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [dueDate, setDueDate] = useState<Date | undefined>();
    const [issueDate, setIssueDate] = useState<Date | undefined>();
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState("");
  // La obra deja de ser texto libre: es la obra real a la que se imputa el
  // gasto. Sin esto la factura no suma al control por cliente.
  const [projectId, setProjectId] = useState<string>(defaultProjectId ?? "");
  // A qué partida o fase de la EDT se carga el gasto. Sin esto no hay control de
  // costos: la factura solo diría de qué obra es, no en qué se gastó.
  const [workItemId, setWorkItemId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  /** Partidas de la obra elegida, en orden de árbol y con su nivel de sangría. */
  const partidasDeLaObra = useMemo(() => {
    if (!projectId) return [];
    const items = workItems.filter((w) => w.projectId === projectId);
    const porPadre = new Map<string | null, WorkItem[]>();
    for (const i of items) {
      const k = i.parentId ?? null;
      if (!porPadre.has(k)) porPadre.set(k, []);
      porPadre.get(k)!.push(i);
    }
    const salida: (WorkItem & { depth: number })[] = [];
    const recorrer = (padre: string | null, depth: number) => {
      for (const i of porPadre.get(padre) ?? []) {
        salida.push({ ...i, depth });
        recorrer(i.id, depth + 1);
      }
    };
    recorrer(null, 0);
    return salida;
  }, [workItems, projectId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceNumber || !supplierId || !amount || !dueDate || !projectId || !issueDate) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Por favor, completa todos los campos requeridos.",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      await addPayment({
        invoiceNumber,
        supplierId,
        amount,
        issueDate,
        dueDate,
        purchaseOrderNumber,
        projectId,
        workItemId: workItemId || null,
        // Se sigue guardando el nombre en `work` porque los filtros y las
        // facturas antiguas lo usan; la fuente de verdad es `projectId`.
        work: projects.find((p) => p.id === projectId)?.name ?? "",
      });
      setInvoiceNumber("");
      setSupplierId("");
      setAmount("");
      setIssueDate(undefined);
      setDueDate(undefined);
      setPurchaseOrderNumber("");
      setProjectId(defaultProjectId ?? "");
      setWorkItemId("");
      toast({
        title: "Éxito",
        description: "Factura registrada correctamente.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
         <div className="space-y-2">
            <Label htmlFor="supplierId">Proveedor</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un proveedor..." />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="projectId">Obra *</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id="projectId">
                <SelectValue placeholder="Selecciona la obra..." />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {projects.length === 0 && (
              <p className="text-xs text-warning">
                No hay obras creadas. Crea una obra antes de registrar facturas.
              </p>
            )}
          </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="workItemId">Partida o fase (opcional)</Label>
        <Select
          value={workItemId || 'none'}
          onValueChange={(v) => setWorkItemId(v === 'none' ? '' : v)}
          disabled={!projectId}
        >
          <SelectTrigger id="workItemId">
            <SelectValue placeholder="Sin imputar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin imputar</SelectItem>
            {partidasDeLaObra.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {' '.repeat(w.depth * 3)}{w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Puedes cargarla a una fase completa (ej. «Obra Gruesa») o a una partida puntual. Lo que
          quede sin imputar no aparece en el control de costos.
        </p>
      </div>


      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label htmlFor="invoiceNumber">Nº Factura</Label>
          <Input
            id="invoiceNumber"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="Ej: F-12345"
          />
        </div>
         <div className="space-y-2">
          <Label htmlFor="amount">Monto</Label>
          <Input
            id="amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            placeholder="Ej: 30000"
          />
        </div>
        <div className="space-y-2">
            <Label htmlFor="issueDate">Fecha de Emisión</Label>
             <Popover>
                <PopoverTrigger asChild>
                <Button
                    variant={"outline"}
                    className={cn(
                    "w-full justify-start text-left font-normal",
                    !issueDate && "text-muted-foreground"
                    )}
                >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {issueDate ? format(issueDate, "PPP", { locale: es }) : "Selecciona una fecha"}
                </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={issueDate} onSelect={setIssueDate} initialFocus />
                </PopoverContent>
            </Popover>
        </div>
        <div className="space-y-2">
          <Label htmlFor="dueDate">Fecha de Vencimiento</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !dueDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dueDate
                  ? format(dueDate, "PPP", { locale: es })
                  : "Selecciona una fecha"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={dueDate}
                onSelect={setDueDate}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>
      
       <div className="space-y-2">
          <Label htmlFor="purchaseOrderNumber">Orden de Compra (Opcional)</Label>
          <Input
            id="purchaseOrderNumber"
            value={purchaseOrderNumber}
            onChange={(e) => setPurchaseOrderNumber(e.target.value)}
            placeholder="Ej: OC-001"
          />
        </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <FilePlus className="mr-2 h-4 w-4" />
        )}
        Registrar Factura
      </Button>
    </form>
  );
};

// === Badge de estado ===
const PaymentStatusBadge = ({ status }: { status: PaymentStatus }) => {
  switch (status) {
    case "pending":
      return <StatusBadge tone="warning" icon={Clock}>Por Vencer</StatusBadge>;
    case "overdue":
      return <StatusBadge tone="danger" icon={XCircle}>Vencida</StatusBadge>;
    case "paid":
      return <StatusBadge tone="success" icon={CheckCircle}>Pagada</StatusBadge>;
    default:
      return <StatusBadge tone="neutral">Desconocido</StatusBadge>;
  }
};

// === Página principal ===
export default function PaymentManagementPage() {
  const {
    supplierPayments,
    suppliers,
    markPaymentAsPaid,
    addSupplierPayment,
    isLoading: loading,
    projects,
    workItems,
    currentProjectId,
    updateSupplierPayment,
    can,
  } = useAppState();

  const [filter, setFilter] = useState<"all" | PaymentStatus>("all");
  const [ocFilter, setOcFilter] = useState("");
  const [workFilter, setWorkFilter] = useState("all");
  const [payingPayment, setPayingPayment] = useState<SupplierPayment | null>(null);
  const [editingPayment, setEditingPayment] = useState<SupplierPayment | null>(null);
  const { toast } = useToast();
  

  const canAssign = can('payments:edit');

  const handleAssignPaymentProject = async (p: SupplierPayment, projectId: string | null) => {
    if ((p.projectId || null) === projectId) return;
    try {
      await updateSupplierPayment(p.id, {
        projectId,
        work: projects.find((pr) => pr.id === projectId)?.name ?? '',
      });
      toast({
        title: 'Factura imputada',
        description: projectId
          ? `La factura ${p.invoiceNumber} se cargo a ${projects.find((pr) => pr.id === projectId)?.name}.`
          : `La factura ${p.invoiceNumber} quedo sin obra.`,
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message || 'No se pudo imputar la factura.' });
    }
  };

  const processedPayments = useMemo(() => {
    const today = startOfDay(new Date());
    return (supplierPayments || [])
      .map((p) => {
        const dueDate = toDate(p.dueDate) || new Date(p.dueDate as any);
        let currentStatus: PaymentStatus = p.status as PaymentStatus;

        if (p.status === "pending") {
          currentStatus = differenceInDays(dueDate, today) < 0 ? "overdue" : "pending";
        }

        return {
          ...p,
          dueDate,
          calculatedStatus: currentStatus,
        };
      })
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }, [supplierPayments]);

  const filteredPayments = useMemo(() => {
    return processedPayments.filter(p => {
        const statusMatch = filter === 'all' || p.calculatedStatus === filter;
        const ocMatch = !ocFilter || (p.purchaseOrderNumber && p.purchaseOrderNumber.includes(ocFilter));
        // El filtro va por la obra real. 'none' junta las que quedaron sin
        // imputar, que son justo las que hay que revisar.
        const workMatch =
          workFilter === 'all' ||
          (workFilter === 'none' ? !p.projectId : p.projectId === workFilter);
        return statusMatch && ocMatch && workMatch;
    });
  }, [processedPayments, filter, ocFilter, workFilter]);

  // Indicadores del módulo para el panel de resumen.
  const financeStats = useMemo(() => {
    const today = startOfDay(new Date());
    const in7 = addDays(today, 7);
    const monthStart = startOfMonth(today);
    let owed = 0;
    let overdueCount = 0;
    let overdueAmount = 0;
    let dueSoonCount = 0;
    let dueSoonAmount = 0;
    let paidThisMonth = 0;

    processedPayments.forEach((p) => {
      if (p.calculatedStatus === 'paid') {
        const pd = toDate(p.paymentDate);
        if (pd && pd >= monthStart) paidThisMonth += p.amount;
        return;
      }
      owed += p.amount;
      if (p.calculatedStatus === 'overdue') {
        overdueCount += 1;
        overdueAmount += p.amount;
      } else if (isWithinInterval(p.dueDate, { start: today, end: in7 })) {
        dueSoonCount += 1;
        dueSoonAmount += p.amount;
      }
    });

    return { owed, overdueCount, overdueAmount, dueSoonCount, dueSoonAmount, paidThisMonth };
  }, [processedPayments]);

  const handleMarkAsPaid = async (details: { paymentDate: Date; paymentMethod: string }) => {
    if (!payingPayment) return;
    await markPaymentAsPaid(payingPayment.id, details);
    setPayingPayment(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));
  const unassignedCount = supplierPayments.filter(p => !p.projectId).length;

  return (
    <div className="flex flex-col gap-8 pb-10">
       <PageHeader
        title="Finanzas"
        description="Resumen de pagos a proveedores: por pagar, vencidas y estado de las facturas."
      />

      {/* Panel de resumen del módulo */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Por Pagar"
          value={formatCLP(financeStats.owed)}
          icon={Wallet}
          tone="info"
          sub={`${financeStats.overdueCount + financeStats.dueSoonCount} requieren atención`}
        />
        <StatTile
          label="Vencidas"
          value={financeStats.overdueCount}
          icon={AlertTriangle}
          tone="danger"
          sub={formatCLP(financeStats.overdueAmount)}
        />
        <StatTile
          label="Por Vencer (7 días)"
          value={financeStats.dueSoonCount}
          icon={Clock}
          tone="warning"
          sub={formatCLP(financeStats.dueSoonAmount)}
        />
        <StatTile
          label="Pagado este mes"
          value={formatCLP(financeStats.paidThisMonth)}
          icon={CheckCircle}
          tone="success"
        />
      </div>

      {/* Alertas accionables (filtran el listado) */}
      {(financeStats.overdueCount > 0 || unassignedCount > 0) && (
        <div className="flex flex-col gap-3 sm:flex-row">
          {financeStats.overdueCount > 0 && (
            <button
              type="button"
              onClick={() => setFilter('overdue')}
              className="flex flex-1 items-center justify-between gap-3 rounded-2xl border border-danger/30 bg-danger-subtle p-4 text-left transition-colors hover:border-danger/50"
            >
              <span className="flex items-center gap-2 font-semibold text-danger">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {financeStats.overdueCount} factura{financeStats.overdueCount > 1 ? 's' : ''} vencida{financeStats.overdueCount > 1 ? 's' : ''} · {formatCLP(financeStats.overdueAmount)}
              </span>
              <span className="flex items-center gap-1 text-xs font-medium text-danger">Ver <ArrowRight className="h-3 w-3" /></span>
            </button>
          )}
          {canAssign && unassignedCount > 0 && (
            <button
              type="button"
              onClick={() => setWorkFilter('none')}
              className="flex flex-1 items-center justify-between gap-3 rounded-2xl border border-warning/30 bg-warning-subtle p-4 text-left transition-colors hover:border-warning/50"
            >
              <span className="flex items-center gap-2 font-semibold text-warning">
                <Receipt className="h-4 w-4 shrink-0" />
                {unassignedCount} factura{unassignedCount > 1 ? 's' : ''} sin obra asignada
              </span>
              <span className="flex items-center gap-1 text-xs font-medium text-warning">Ver <ArrowRight className="h-3 w-3" /></span>
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-8">
        <PanelCard
            title="Registrar Nueva Factura"
            description="Añade una nueva factura de proveedor para seguimiento."
            icon={FilePlus}
        >
            <CreatePaymentForm
              suppliers={suppliers}
              projects={projects}
              workItems={workItems}
              defaultProjectId={currentProjectId}
              addPayment={addSupplierPayment}
            />
        </PanelCard>

        <PanelCard
            title="Listado de Facturas"
            description={`${filteredPayments.length} factura${filteredPayments.length === 1 ? '' : 's'} con los filtros actuales`}
            icon={Receipt}
            contentClassName="px-0 pb-0"
        >
                <div className="grid grid-cols-1 gap-4 px-6 pb-4 sm:grid-cols-2 md:grid-cols-3">
                    <Input placeholder="Filtrar por Nº de OC..." value={ocFilter} onChange={e => setOcFilter(e.target.value)} />
                    <Select value={workFilter} onValueChange={setWorkFilter}>
                        <SelectTrigger><SelectValue placeholder="Filtrar por obra..." /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todas las Obras</SelectItem>
                            {unassignedCount > 0 && (
                                <SelectItem value="none">Sin obra asignada ({unassignedCount})</SelectItem>
                            )}
                            {projects.map(pr => <SelectItem key={pr.id} value={pr.id}>{pr.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
                        <SelectTrigger><SelectValue placeholder="Filtrar por estado..." /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos los Estados</SelectItem>
                            <SelectItem value="pending">Por Vencer</SelectItem>
                            <SelectItem value="overdue">Vencidas</SelectItem>
                            <SelectItem value="paid">Pagadas</SelectItem>
                    </SelectContent>
                    </Select>
                </div>

                <div className="overflow-x-auto border-t border-border">
                <Table>
                    <TableHeader className="bg-muted">
                    <TableRow>
                        <TableHead>Estado</TableHead>
                        <TableHead>Monto</TableHead>
                        <TableHead>Vencimiento</TableHead>
                        <TableHead>Proveedor</TableHead>
                        <TableHead>Factura / OC</TableHead>
                        <TableHead>Obra</TableHead>
                        <TableHead className="text-right">Acción</TableHead>
                    </TableRow>
                    </TableHeader>

                    <TableBody>
                    {filteredPayments.length > 0 ? (
                        filteredPayments.map((p) => (
                        <TableRow
                            key={p.id}
                            className={cn(
                            // Tinte por estado con los tokens semánticos: en alfa
                            // baja para no competir con el badge de la fila.
                            p.calculatedStatus === "pending" && "bg-warning/10 hover:bg-warning/20",
                            p.calculatedStatus === "overdue" && "bg-danger/10 hover:bg-danger/20",
                            p.calculatedStatus === "paid" && "bg-success/5 text-muted-foreground"
                            )}
                        >
                            <TableCell><PaymentStatusBadge status={p.calculatedStatus} /></TableCell>
                            <TableCell className="font-mono">{formatCLP(p.amount)}</TableCell>
                            <TableCell>{format(p.dueDate, "dd-MM-yyyy")}</TableCell>
                            <TableCell className="font-medium">{supplierMap.get(p.supplierId) || "Desconocido"}</TableCell>
                            <TableCell>
                                <div>{p.invoiceNumber}</div>
                                {p.purchaseOrderNumber && <div className="text-xs text-muted-foreground">OC: {p.purchaseOrderNumber}</div>}
                            </TableCell>
                             <TableCell className="min-w-[190px]">
                                {/* Selector en linea: las facturas antiguas quedaron sin obra y
                                    sin esto no habria forma de imputarlas desde la app. */}
                                <Select
                                    value={p.projectId || 'none'}
                                    disabled={!canAssign}
                                    onValueChange={(v) => handleAssignPaymentProject(p, v === 'none' ? null : v)}
                                >
                                    <SelectTrigger className={cn('h-8 w-full', !p.projectId && 'border-warning text-warning')}>
                                        <SelectValue placeholder="Sin obra" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Sin obra asignada</SelectItem>
                                        {projects.map((pr) => (
                                            <SelectItem key={pr.id} value={pr.id}>{pr.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {!p.projectId && p.work && (
                                    <div className="mt-1 text-[11px] text-muted-foreground">Texto antiguo: {p.work}</div>
                                )}
                                {p.status === 'paid' && p.paymentDate && (
                                    <div className="text-xs text-muted-foreground">Pagado: {format(new Date(p.paymentDate), "dd-MM-yy")} ({p.paymentMethod})</div>
                                )}
                            </TableCell>
                            <TableCell className="text-right flex justify-end gap-2">
                                <Button size="sm" variant="outline" onClick={() => setEditingPayment(p)}>
                                    <Edit className="h-4 w-4" />
                                </Button>
                                {p.status !== "paid" && (
                                    <Button size="sm" onClick={() => setPayingPayment(p)}>
                                        Marcar como Pagada
                                    </Button>
                                )}
                            </TableCell>
                        </TableRow>
                        ))
                    ) : (
                        <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center">No hay facturas que coincidan con los filtros.</TableCell>
                        </TableRow>
                    )}
                    </TableBody>
                </Table>
                </div>
        </PanelCard>
      </div>

     <MarkAsPaidDialog
        isOpen={!!payingPayment}
        onClose={() => setPayingPayment(null)}
        payment={payingPayment}
        onConfirm={handleMarkAsPaid}
      />
      
      {editingPayment && (
        <EditPaymentForm
            isOpen={!!editingPayment}
            onClose={() => setEditingPayment(null)}
            payment={editingPayment}
        />
      )}
    </div>
  );
}
