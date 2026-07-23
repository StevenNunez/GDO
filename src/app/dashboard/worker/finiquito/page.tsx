"use client";

import React from 'react';
import { PanelCard } from '@/components/ui/panel-card';
import { HandCoins, Info, FileText, Phone } from 'lucide-react';
import { useAuth } from '@/modules/core/contexts/app-provider';

export default function WorkerFiniquitoPage() {
  const { user } = useAuth();
  const initials = (user?.name ?? 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="max-w-md mx-auto space-y-5 pb-10">
      <div className="flex justify-between items-center pt-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Mi Finiquito</h2>
          <p className="text-muted-foreground text-sm">Documento de término de contrato</p>
        </div>
        <div className="h-11 w-11 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
          {initials}
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-card py-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <HandCoins className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="text-lg font-semibold">Sin finiquito generado</p>
            <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">
              Tu finiquito se genera al término de tu contrato laboral. Por el momento no tienes ninguno disponible.
            </p>
          </div>
      </div>

      <PanelCard title="¿Qué es un finiquito?" icon={Info} contentClassName="space-y-3">
          <p className="text-sm text-muted-foreground">
            El finiquito es el documento legal que formaliza el término de la relación laboral. Debe ser firmado por ambas partes y entregado al trabajador al momento del egreso.
          </p>
          <p className="text-sm text-muted-foreground">
            Incluye el pago de todos los haberes pendientes: indemnizaciones por años de servicio, feriado proporcional y otros beneficios según la causal de término.
          </p>
      </PanelCard>

      <PanelCard title="¿Qué incluye?" icon={FileText} contentClassName="space-y-2">
          {[
            'Indemnización por años de servicio (Art. 161)',
            'Indemnización sustitutiva del aviso previo',
            'Feriado proporcional no tomado',
            'Haberes pendientes del último período',
          ].map(item => (
            <div key={item} className="flex items-start gap-2.5 border-b border-border py-1.5 last:border-0">
              <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <p className="text-sm text-muted-foreground">{item}</p>
            </div>
          ))}
      </PanelCard>

      <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <Phone className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium">¿Necesitas tu finiquito?</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Contacta a tu supervisor o al área de administración para solicitar la generación de tu documento de finiquito.
          </p>
        </div>
      </div>
    </div>
  );
}
