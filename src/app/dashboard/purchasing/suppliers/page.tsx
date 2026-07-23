"use client";

import { PageHeader } from "@/components/page-header";
import { SuppliersManager } from "@/components/admin/suppliers-manager";

export default function SuppliersPage() {
  return (
    <div className="flex flex-col gap-8 pb-10">
      <PageHeader
        title="Gestión de Proveedores"
        description="Crea nuevos proveedores y visualiza todos los perfiles registrados en el sistema."
      />
      <SuppliersManager />
    </div>
  );
}
