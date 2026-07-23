
"use client";

import React, { useState, useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { useAppState } from "@/modules/core/contexts/app-provider";
import { PanelCard } from "@/components/ui/panel-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Check, Clock, X, Loader2, Undo2 } from "lucide-react";
import { useToast } from "@/modules/core/hooks/use-toast";
import type { ReturnRequest } from "@/modules/core/lib/data";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toDate } from "@/lib/date-utils";


type Status = "pending" | "completed" | "rejected";

export default function AdminReturnRequestsPage() {
  const { returnRequests, updateReturnRequestStatus, isLoading } = useAppState();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Status>("pending");

  const formatDate = (date: Date | string | null | undefined): string => {
    const jsDate = toDate(date);
    return jsDate ? jsDate.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "N/A";
  };

  const handleStatusUpdate = async (requestId: string, status: 'completed' | 'rejected') => {
      try {
          await updateReturnRequestStatus(requestId, status);
          toast({
              title: status === 'completed' ? 'Devolución Aceptada' : 'Devolución Rechazada',
              description: 'El estado de la solicitud ha sido actualizado.'
          });
      } catch (error: any) {
          toast({
              variant: 'destructive',
              title: 'Error',
              description: error.message || 'No se pudo actualizar la solicitud.'
          });
      }
  }

  const filteredRequests = useMemo(() => {
    return (returnRequests || [])
      .filter((req: ReturnRequest) => req.status === activeTab)
      .sort((a: ReturnRequest, b: ReturnRequest) => {
        const dateA = toDate(a.createdAt)?.getTime() ?? 0;
        const dateB = toDate(b.createdAt)?.getTime() ?? 0;
        return dateB - dateA;
      });
  }, [returnRequests, activeTab]);
  
  const getStatusBadge = (status: Status) => {
    switch (status) {
      case "pending":
        return <StatusBadge tone="warning" icon={Clock}>Pendiente</StatusBadge>;
      case "completed":
        return <StatusBadge tone="success" icon={Check}>Completada</StatusBadge>;
      case "rejected":
        return <StatusBadge tone="danger" icon={X}>Rechazada</StatusBadge>;
      default:
        return <StatusBadge>Desconocido</StatusBadge>;
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Gestionar Devoluciones de Material"
        description="Aprueba o rechaza las devoluciones de material sobrante que los supervisores han registrado."
      />
      <PanelCard
        title="Solicitudes de Devolución"
        icon={Undo2}
        tone="info"
        description="Navega entre las pestañas para ver las solicitudes por estado."
      >
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as Status)}>
            <TabsList>
              <TabsTrigger value="pending">Pendientes</TabsTrigger>
              <TabsTrigger value="completed">Completadas</TabsTrigger>
              <TabsTrigger value="rejected">Rechazadas</TabsTrigger>
            </TabsList>
            <TabsContent value={activeTab} className="mt-4">
              <ScrollArea className="h-[calc(80vh-16rem)] rounded-xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha Solicitud</TableHead>
                      <TableHead>Supervisor</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead>Cantidad</TableHead>
                      <TableHead>Notas</TableHead>
                      <TableHead>Estado</TableHead>
                      {activeTab === 'pending' && <TableHead className="text-right">Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                        <TableRow>
                            <TableCell colSpan={activeTab === 'pending' ? 7 : 6} className="h-24 text-center">
                                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                            </TableCell>
                        </TableRow>
                    ) : filteredRequests.length > 0 ? (
                      filteredRequests.map((req: ReturnRequest) => (
                        <TableRow key={req.id}>
                          <TableCell>{formatDate(req.createdAt)}</TableCell>
                          <TableCell>{req.supervisorName}</TableCell>
                          <TableCell className="font-medium">{req.materialName}</TableCell>
                          <TableCell>{req.quantity} {req.unit}</TableCell>
                          <TableCell className="text-muted-foreground max-w-xs truncate">{req.notes || 'N/A'}</TableCell>
                          <TableCell>{getStatusBadge(req.status)}</TableCell>
                          {activeTab === 'pending' && (
                            <TableCell className="text-right space-x-2">
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button size="sm" variant="destructive">
                                            <X className="mr-2 h-4 w-4" /> Rechazar
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                        <AlertDialogTitle>¿Confirmar Rechazo?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Esta acción marcará la solicitud como rechazada y el stock no se modificará.
                                        </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleStatusUpdate(req.id, 'rejected')} className="bg-destructive hover:bg-destructive/90">
                                            Sí, Rechazar
                                        </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button size="sm" className="bg-success text-background hover:bg-success/90">
                                            <Check className="mr-2 h-4 w-4" /> Aprobar Ingreso
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                        <AlertDialogTitle>¿Confirmar Devolución?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Al confirmar, se añadirán <strong>{req.quantity} {req.unit} de {req.materialName}</strong> de vuelta al inventario.
                                        </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleStatusUpdate(req.id, 'completed')} className="bg-success text-background hover:bg-success/90">
                                            Sí, Confirmar Ingreso
                                        </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={activeTab === 'pending' ? 7 : 6} className="h-24 text-center">
                          No hay solicitudes en esta categoría.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </TabsContent>
          </Tabs>
      </PanelCard>
    </div>
  );
}
