"use client";

import React, { useMemo } from 'react';
import { PanelCard } from '@/components/ui/panel-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Hammer, PackageCheck, Wrench } from 'lucide-react';
import { useAuth, useAppState } from '@/modules/core/contexts/app-provider';
import { formatDistanceToNow, isToday, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toDate } from '@/lib/date-utils';

const formatRelative = (date: any) => {
  const d = toDate(date);
  if (!d) return 'N/A';
  if (isToday(d)) return 'Hoy';
  return formatDistanceToNow(d, { addSuffix: true, locale: es });
};

const formatShortDate = (date: any) => {
  const d = toDate(date);
  if (!d) return 'N/A';
  return format(d, 'd MMM', { locale: es });
};

export default function WorkerHerramientasPage() {
  const { user } = useAuth();
  const { toolLogs, tools } = useAppState();

  const myActiveTools = useMemo(() => {
    if (!user || !toolLogs) return [];
    return toolLogs
      .filter(log => log.userId === user.id && !log.returnDate)
      .sort((a, b) => (b.checkoutDate as any) - (a.checkoutDate as any));
  }, [toolLogs, user]);

  const myToolHistory = useMemo(() => {
    if (!user || !toolLogs) return [];
    return toolLogs
      .filter(log => log.userId === user.id && !!log.returnDate)
      .sort((a, b) => {
        const da = toDate(b.returnDate)?.getTime() ?? 0;
        const db = toDate(a.returnDate)?.getTime() ?? 0;
        return da - db;
      })
      .slice(0, 15);
  }, [toolLogs, user]);

  return (
    <div className="max-w-md mx-auto space-y-5 pb-10">
      <div className="pt-4">
        <h2 className="text-2xl font-bold tracking-tight">Mis Herramientas</h2>
        <p className="text-muted-foreground text-sm">Equipos actualmente asignados a ti</p>
      </div>

      <PanelCard
        title="En mi poder"
        description="Herramientas actualmente asignadas a ti"
        icon={Hammer}
        actions={myActiveTools.length > 0 ? <StatusBadge tone="neutral" className="font-mono">{myActiveTools.length}</StatusBadge> : undefined}
      >
          {myActiveTools.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <PackageCheck className="h-8 w-8" />
              <p className="text-sm">Sin herramientas asignadas actualmente</p>
            </div>
          ) : (
            <div className="space-y-2">
              {myActiveTools.map(log => {
                const tool = (tools ?? []).find(t => t.id === log.toolId);
                return (
                  <div key={log.id} className="flex items-center gap-3 p-3 rounded-lg border bg-primary/5">
                    <div className="h-9 w-9 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
                      <Wrench className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{log.toolName}</p>
                      {tool?.brand && (
                        <p className="text-[11px] text-muted-foreground">
                          {tool.brand}{tool.model ? ` · ${tool.model}` : ''}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        Entregado {formatRelative(log.checkoutDate)} · {log.checkoutSupervisorName}
                      </p>
                    </div>
                    <StatusBadge tone="success" className="shrink-0 text-[10px]">En uso</StatusBadge>
                  </div>
                );
              })}
            </div>
          )}
      </PanelCard>

      {myToolHistory.length > 0 && (
        <PanelCard
          title="Historial de devoluciones"
          description="Equipos devueltos anteriormente"
          icon={Wrench}
          contentClassName="space-y-1"
        >
            {myToolHistory.map(log => (
              <div key={log.id} className="flex items-center gap-2 py-1.5 border-b last:border-0">
                <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm flex-1 truncate">{log.toolName}</span>
                <span className="text-[11px] text-muted-foreground shrink-0">{formatShortDate(log.returnDate)}</span>
                {log.returnStatus === 'damaged' && (
                  <StatusBadge tone="danger" className="shrink-0 text-[10px]">Dañada</StatusBadge>
                )}
              </div>
            ))}
        </PanelCard>
      )}
    </div>
  );
}
