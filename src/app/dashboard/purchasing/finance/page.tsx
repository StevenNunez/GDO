
"use client";

import React from "react";
import { PageHeader } from "@/components/page-header";
import { useAppState, useAuth } from "@/modules/core/contexts/app-provider";
import { SurfaceCard } from "@/components/ui/surface-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/modules/core/hooks/use-toast";
import { FileText, Upload, Loader2, AlertCircle, RefreshCcw, ArrowRight, X, Check, FileCheck } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toDate } from "@/lib/date-utils";
import { PurchaseLot } from "@/modules/core/lib/data";
import { generateOCPDF, buildOCData } from "@/lib/pdf-oc-generator";

// --- Tipos internos ---
type ProcessingItem = {
  requestId: string;
  price: number;
  confirmed: boolean; // ¿Viene en la cotización?
  quantity: number;
};

export default function FinanceQuoteProcessor() {
  const {
    purchaseLots, purchaseRequests, users, suppliers,
    projects, currentProjectId, createPurchaseOrder, returnToPool, can,
  } = useAppState();
  const { user } = useAuth();
  const { toast } = useToast();

  const currentProject = React.useMemo(
    () => projects.find((p) => p.id === currentProjectId) ?? null,
    [projects, currentProjectId]
  );

  const [selectedLot, setSelectedLot] = React.useState<(PurchaseLot & { requestIds: string[] }) | null>(null);
  const [fileUrl, setFileUrl] = React.useState<string | null>(null);
  const [ocNumber, setOcNumber] = React.useState("");
  const [itemsState, setItemsState] = React.useState<Record<string, ProcessingItem>>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const pendingLots = React.useMemo(() => {
    return (purchaseLots || []).filter(l => l.status === 'open').map(lot => {
        const requestsInLot = (purchaseRequests || []).filter(r => r.lotId === lot.id);
        return {
            ...lot,
            requestIds: requestsInLot.map(r => r.id)
        }
    });
  }, [purchaseLots, purchaseRequests]);

  const handleSelectLot = (lot: PurchaseLot & { requestIds: string[] }) => {
    setSelectedLot(lot);
    setFileUrl(null);
    setOcNumber("");
    
    const requestsInLot = (purchaseRequests || []).filter(r => lot.requestIds.includes(r.id));
    const initialItems: Record<string, ProcessingItem> = {};
    
    requestsInLot.forEach(req => {
      initialItems[req.id] = {
        requestId: req.id,
        price: 0,
        confirmed: true,
        quantity: req.quantity
      };
    });
    setItemsState(initialItems);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.includes("pdf") && !file.type.includes("image")) {
      toast({ variant: "destructive", title: "Formato no válido", description: "Solo PDF o imágenes" });
      return;
    }

    const url = URL.createObjectURL(file);
    setFileUrl(url);
    toast({ title: "Documento cargado", description: "Ahora valida los precios y confirma los items." });
  };

  const toggleItem = (id: string) => {
    setItemsState((prev) => ({
      ...prev,
      [id]: { ...prev[id], confirmed: !prev[id].confirmed },
    }));
  };

  const updateItem = (id: string, field: 'price' | 'quantity', value: string) => {
    const num = parseFloat(value) || 0;
    setItemsState(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: num }
    }));
  };

  const calculateTotal = () => {
    return Object.values(itemsState).reduce((total, item) => {
        if (item.confirmed) {
            return total + item.price * item.quantity;
        }
        return total;
    }, 0);
  };

  const handleGenerateOrder = async () => {
    if (!selectedLot) {
      toast({ variant: "destructive", title: "Faltan datos", description: "No se ha seleccionado un lote." });
      return;
    }
     if (!ocNumber.trim()) {
      toast({ variant: "destructive", title: "Faltan datos", description: "Debes ingresar el número de OC." });
      return;
    }

    const confirmedItems = Object.values(itemsState).filter(i => i.confirmed && i.quantity > 0);
    if (confirmedItems.length === 0) {
      toast({ variant: "destructive", title: "Sin items", description: "Confirma al menos un material con cantidad mayor a cero." });
      return;
    }

    setIsSubmitting(true);
    
    try {
      const rejectedItems = Object.values(itemsState).filter(i => !i.confirmed || i.quantity <= 0);
      
      const itemsForMutation = confirmedItems.map(item => {
        const req = (purchaseRequests || []).find(r => r.id === item.requestId);
        return {
          ...item,
          name: req?.materialName || 'Desconocido',
          unit: req?.unit || 'und',
        };
      });

      await createPurchaseOrder({
        lotId: selectedLot.id,
        ocNumber: ocNumber.trim(),
        items: itemsForMutation,
        totalAmount: calculateTotal(),
      });
        
      if (rejectedItems.length > 0) {
        await returnToPool(rejectedItems.map(i => i.requestId));
      }

      toast({
        title: "✅ Orden de Compra Generada",
        description: `Se procesaron ${confirmedItems.length} items y ${rejectedItems.length} ítems devueltos.`,
        duration: 10000,
      });

      // ---- PDF ----
      // A partir de aquí la orden YA está creada. Si el PDF falla, se avisa
      // pero NO se propaga como error crítico (antes se lanzaba, y el usuario
      // veía "no se pudo generar la orden" cuando en realidad sí se había
      // creado). El PDF siempre se puede volver a bajar desde Historial de OCs.
      try {
        const supplier = suppliers.find(s => s.id === selectedLot.supplierId);
        if (!supplier) {
          throw new Error("El lote no tiene un proveedor válido asociado.");
        }

        const { blob, filename } = await generateOCPDF(buildOCData({
          ocNumber: ocNumber.trim(),
          date: new Date(),
          supplier,
          project: currentProject,
          items: itemsForMutation.map((item, index) => ({
            item: index + 1,
            code: item.requestId.slice(0, 8).toUpperCase(),
            description: item.name,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: item.price,
            netValue: item.quantity * item.price,
          })),
          totalNet: calculateTotal(),
          createdByName: user?.name || 'Usuario del Sistema',
        }));

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (pdfError: any) {
        console.error(pdfError);
        toast({
          variant: "destructive",
          title: "La orden se creó, pero no se pudo generar el PDF",
          description: `${pdfError?.message ?? 'Error desconocido'}. Puedes descargarlo desde Historial de OCs.`,
          duration: 10000,
        });
      }

      setSelectedLot(null);

    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Error crítico",
        description: error.message || "No se pudo generar la orden.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };


  if (!can("finance:manage_purchase_orders")) {
    return (
      <div className="p-12 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <h2 className="mt-4 text-xl font-semibold">Acceso Denegado</h2>
        <p className="mt-2 text-muted-foreground">No tienes permisos para acceder a esta sección.</p>
      </div>
    );
  }

  if (!selectedLot) {
    return (
      <>
        <PageHeader
          title="Finanzas – Procesar Cotizaciones"
          description="Valida la cotización del proveedor y genera la Orden de Compra real"
        />

        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-5 pb-10 md:grid-cols-2 lg:grid-cols-3">
          {pendingLots.length === 0 ? (
            <SurfaceCard interactive={false} className="col-span-full items-center py-20 text-center">
              <Check className="mb-4 h-16 w-16 text-success opacity-60" />
              <p className="text-xl font-bold tracking-tight">¡Todo al día!</p>
              <p className="text-muted-foreground">No hay cotizaciones pendientes de procesar.</p>
            </SurfaceCard>
          ) : (
            pendingLots.map((lot) => {
              const count = lot.requestIds.length;
              const creator = users?.find((u) => u.id === lot.creatorId)?.name || "Admin Obra";
              const createdAt = toDate(lot.createdAt) || new Date(lot.createdAt as any);

              return (
                <SurfaceCard
                  key={lot.id}
                  decorIcon={FileText}
                  className="cursor-pointer p-6"
                  onClick={() => handleSelectLot(lot)}
                >
                  <div className="relative z-10 flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-bold tracking-tight transition-colors group-hover:text-cta">{lot.name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {createdAt ? format(createdAt, "dd MMM yyyy", { locale: es }) : ''}
                      </p>
                    </div>
                    <StatusBadge tone="info">Nuevo</StatusBadge>
                  </div>
                  <div className="relative z-10 mt-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Items:</span>
                      <span className="font-bold">{count}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Creado por:</span>
                      <span className="font-medium">{creator}</span>
                    </div>
                  </div>
                  <Button className="relative z-10 mt-6 w-full">
                    Procesar Cotización <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </SurfaceCard>
              );
            })
          )}
        </div>
      </>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header fijo */}
      <div className="flex h-16 items-center justify-between border-b border-border bg-card px-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setSelectedLot(null)}>
            <X className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Procesando lote: {selectedLot.name}</h2>
            <p className="text-sm text-muted-foreground">Valida precios y confirma items</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Total Orden de Compra</p>
            <p className="text-3xl font-bold tracking-tighter text-success">
              ${calculateTotal().toLocaleString("es-CL")}
            </p>
          </div>
          <Button
            size="lg"
            onClick={handleGenerateOrder}
            disabled={!ocNumber.trim() || isSubmitting}
            className="bg-success text-background hover:bg-success/90"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Generando...
              </>
            ) : (
              <>
                <FileCheck className="mr-2 h-5 w-5" /> Generar OC Real
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* IZQUIERDA: PDF */}
        <div className="flex w-1/2 flex-col border-r border-border bg-muted/40">
          <div className="flex items-center justify-between border-b border-border p-4">
            <h3 className="flex items-center gap-2 font-semibold">
              <FileText className="h-4 w-4" /> Cotización del Proveedor
            </h3>
            <label htmlFor="quote-upload">
              <Input
                id="quote-upload"
                type="file"
                accept=".pdf,image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button asChild variant="outline" size="sm">
                <span>
                    <Upload className="h-4 w-4 mr-2" />
                    {fileUrl ? "Cambiar" : "Subir documento"}
                </span>
              </Button>
            </label>
          </div>
          {/* Fondo blanco fijo: es el visor del PDF del proveedor, que viene en blanco. */}
          <div className="m-4 flex-1 overflow-hidden rounded-xl bg-white shadow-inner">
            {fileUrl ? (
              <iframe src={fileUrl} className="h-full w-full" title="Cotización PDF" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                <Upload className="mb-4 h-16 w-16 opacity-40" />
                <p className="text-lg">Sube el PDF o foto de la cotización</p>
              </div>
            )}
          </div>
        </div>

        {/* DERECHA: Formulario */}
        <div className="w-1/2 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-6">
            <SurfaceCard interactive={false} className="p-6">
              <Label className="text-base">Número de Orden de Compra o Cotización</Label>
              <Input
                placeholder="Ej: OC-2025-089 o COT-4451"
                value={ocNumber}
                onChange={(e) => setOcNumber(e.target.value)}
                className="mt-2 font-mono text-lg"
              />
            </SurfaceCard>

            <div>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold tracking-tight">
                <Check className="h-5 w-5 text-success" /> Validación de Items
              </h3>
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-subtle p-3 text-xs text-warning">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Ajusta las cantidades confirmadas y los precios unitarios según el documento del proveedor. Desmarca los ítems que no serán comprados.</p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead className="w-28 text-right">Cant. Confirmada</TableHead>
                    <TableHead className="w-32 text-right">Precio Unitario</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(purchaseRequests || [])
                    .filter((r) => selectedLot?.requestIds.includes(r.id))
                    .map((req) => {
                      const state = itemsState[req.id];
                      if (!state) return null;

                      return (
                        <TableRow
                          key={req.id}
                          className={!state.confirmed ? "opacity-50" : ""}
                        >
                          <TableCell>
                            <Checkbox
                              checked={state.confirmed}
                              onCheckedChange={() => toggleItem(req.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className={state.confirmed ? "font-medium" : "line-through"}>
                                {req.materialName}
                              </p>
                              <span className="text-xs text-muted-foreground">
                                Solicitado: {req.quantity} {req.unit}
                              </span>
                              {!state.confirmed && (
                                <p className="flex items-center gap-1 text-xs text-danger">
                                  <RefreshCcw className="h-3 w-3" /> Volverá a pendientes
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              placeholder="0"
                              value={state.quantity || ""}
                              onChange={(e) => updateItem(req.id, 'quantity', e.target.value)}
                              disabled={!state.confirmed}
                              className="text-right font-mono"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              placeholder="0"
                              value={state.price || ""}
                              onChange={(e) => updateItem(req.id, 'price', e.target.value)}
                              disabled={!state.confirmed}
                              className="text-right font-mono"
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
