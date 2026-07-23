"use client";

import React, { useState } from "react";
import { useAppState } from "@/modules/core/contexts/app-provider";
import { PanelCard } from "@/components/ui/panel-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { CreateSupplierForm } from "@/components/admin/create-supplier-form";
import { EditSupplierForm } from "@/components/admin/edit-supplier-form";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Briefcase, MoreHorizontal, Edit, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/modules/core/hooks/use-toast";
import type { Supplier } from "@/modules/core/lib/data";

export interface SuppliersManagerProps {
  /** Solo lista, sin formulario de alta ni menú de acciones (vista del supervisor). */
  readOnly?: boolean;
  /** Texto bajo el título de la lista. */
  listDescription?: string;
}

/**
 * Gestión de proveedores: alta, listado, edición y borrado.
 *
 * Vivía copiado en tres rutas (`purchasing/suppliers`, `payments/suppliers` y
 * `supervisor/suppliers`) y las copias se habían desincronizado — una de ellas
 * mostraba Editar/Eliminar sin comprobar permisos. Ahora las tres montan este
 * componente; lo único que cambia entre ellas es la cabecera de la página.
 *
 * Las acciones se gatean con `can()` de `useAppState()` (permisos dinámicos),
 * así que la misma instancia sirve para cualquier rol.
 */
export function SuppliersManager({ readOnly = false, listDescription }: SuppliersManagerProps) {
  const { suppliers, deleteSupplier, can } = useAppState();
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const { toast } = useToast();

  const canCreate = !readOnly && can('suppliers:create');
  const canEdit = !readOnly && can('suppliers:edit');
  const canDelete = !readOnly && can('suppliers:delete');
  const hasActions = canEdit || canDelete;

  const handleDeleteSupplier = async (supplierId: string, supplierName: string) => {
    try {
      await deleteSupplier(supplierId);
      toast({
        title: "Proveedor Eliminado",
        description: `El proveedor ${supplierName} ha sido eliminado correctamente.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al eliminar",
        description: error?.message || "No se pudo eliminar el proveedor.",
      });
    }
  };

  return (
    <>
      {editingSupplier && (
        <EditSupplierForm
          supplier={editingSupplier}
          isOpen={!!editingSupplier}
          onClose={() => setEditingSupplier(null)}
        />
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {canCreate && (
          <div className="lg:col-span-1">
            <PanelCard
              title="Añadir Nuevo Proveedor"
              description="Aparecerán en las opciones de órdenes de compra."
              icon={Briefcase}
            >
              <CreateSupplierForm />
            </PanelCard>
          </div>
        )}

        <div className={canCreate ? "lg:col-span-2" : "lg:col-span-3"}>
          <PanelCard
            title="Lista de Proveedores"
            description={listDescription ?? "Todos los proveedores registrados en el sistema."}
            icon={Users}
            contentClassName="px-0 pb-0"
          >
            <ScrollArea className="h-[calc(80vh-10rem)] border-t border-border">
              <div className="space-y-4 p-4">
                {(suppliers || []).length === 0 && (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Todavía no hay proveedores registrados.
                  </p>
                )}
                {(suppliers || []).map((supplier: Supplier) => (
                  <div
                    key={supplier.id}
                    className="flex flex-col gap-4 rounded-xl border border-border bg-muted/40 p-4 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="flex flex-grow items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Briefcase className="h-6 w-6" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="font-semibold">{supplier.name}</p>
                        <div className="flex flex-wrap gap-1">
                          {supplier.categories.map((cat: string) => (
                            <StatusBadge key={cat} tone="neutral">{cat}</StatusBadge>
                          ))}
                        </div>
                      </div>
                    </div>

                    {hasActions && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Abrir menú</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canEdit && (
                            <DropdownMenuItem onClick={() => setEditingSupplier(supplier)}>
                              <Edit className="mr-2 h-4 w-4" />
                              <span>Editar</span>
                            </DropdownMenuItem>
                          )}
                          {canDelete && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  <span className="text-destructive">Eliminar</span>
                                </DropdownMenuItem>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>¿Seguro que quieres eliminar a {supplier.name}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta acción no se puede deshacer. Se eliminará permanentemente al proveedor.
                                    Si está asignado a algún material, la acción fallará.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive hover:bg-destructive/90"
                                    onClick={() => handleDeleteSupplier(supplier.id, supplier.name)}
                                  >
                                    Sí, eliminar proveedor
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                ))}
              </div>
              <ScrollBar orientation="vertical" />
            </ScrollArea>
          </PanelCard>
        </div>
      </div>
    </>
  );
}
