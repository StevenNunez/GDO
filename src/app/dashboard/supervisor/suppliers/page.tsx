"use client";

import { PageHeader } from "@/components/page-header";
import { SuppliersManager } from "@/components/admin/suppliers-manager";

export default function SupervisorSuppliersPage() {
  return (
    <div className="flex flex-col gap-8 pb-10">
      <PageHeader
        title="Proveedores Disponibles"
        description="Consulta los proveedores con los que trabajamos y las categorías de materiales que ofrecen."
      />
      {/* El supervisor solo consulta: sin alta ni menú de acciones. */}
      <SuppliersManager readOnly listDescription="Explora nuestros proveedores y sus especialidades." />
    </div>
  );
}
