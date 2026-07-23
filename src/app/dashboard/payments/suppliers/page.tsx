"use client";

import { PageHeader } from "@/components/page-header";
import { SuppliersManager } from "@/components/admin/suppliers-manager";

export default function AdminSuppliersPage() {
  return (
    <div className="flex flex-col gap-8 pb-10">
      <PageHeader
        title="Gestión de Proveedores"
        description="Crea, edita y gestiona todos los perfiles de proveedores registrados en el sistema."
      />
      <SuppliersManager />
    </div>
  );
}
