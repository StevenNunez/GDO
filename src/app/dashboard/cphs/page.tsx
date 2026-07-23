"use client";

import React from "react";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/modules/core/contexts/app-provider";
import { ModuleCard } from "@/components/ui/module-card";
import { FileUp, ListChecks, ShieldCheck, ShieldAlert } from "lucide-react";

export default function CphsDashboardPage() {
  const { user } = useAuth();

  return (
    <div className="flex flex-col gap-8 pb-10">
      <PageHeader
        title="Panel del Comité Paritario"
        description={`Bienvenido, ${user?.name}. Accede a las herramientas de gestión de seguridad.`}
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <ModuleCard
          href="/dashboard/safety/templates"
          icon={FileUp}
          title="Gestión de Plantillas"
          description="Crea y edita las plantillas para checklists e inspecciones."
        />
        <ModuleCard
          href="/dashboard/safety/templates"
          icon={ListChecks}
          title="Asignar Checklists"
          description="Asigna plantillas a los supervisores para que las completen."
        />
        <ModuleCard
          href="/dashboard/safety/review-checklists"
          icon={ShieldCheck}
          title="Revisar Checklists"
          description="Aprueba o rechaza los formularios completados."
        />
        <ModuleCard
          href="/dashboard/safety/inspection"
          icon={ShieldAlert}
          title="Crear Inspección"
          description="Registra una nueva observación de seguridad en terreno."
        />
        <ModuleCard
          href="/dashboard/safety/review-inspections"
          icon={ShieldCheck}
          title="Revisar Inspecciones"
          description="Da seguimiento a las soluciones de las inspecciones."
        />
      </div>
    </div>
  );
}