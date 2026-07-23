
"use client";

import React, { useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import { Construction, Inbox, Clock, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useAppState, useAuth } from '@/modules/core/contexts/app-provider';
import { SurfaceCard } from '@/components/ui/surface-card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WorkItem } from '@/modules/core/lib/data';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { toDate } from '@/lib/date-utils';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


const getStatusInfo = (status: string): { label: string; icon: React.ElementType; tone: StatusTone } => {
    switch (status) {
        case 'pending-quality-review': return { label: 'Pendiente de Revisión', icon: Clock, tone: 'warning' };
        case 'completed': return { label: 'Aprobado', icon: ThumbsUp, tone: 'success' };
        case 'rejected': return { label: 'Rechazado', icon: ThumbsDown, tone: 'danger' };
        default: return { label: 'En Progreso', icon: Construction, tone: 'neutral' };
    }
};

const formatDate = (date: Date | string | undefined | null) => {
    const jsDate = toDate(date);
    if (!jsDate) return 'N/A';
    return formatDistanceToNow(jsDate, { addSuffix: true, locale: es });
};

export default function MisProtocolosPage() {
  const { user } = useAuth();
  const { workItems } = useAppState();

  const mySubmittedProtocols = useMemo(() => {
    if (!user || !workItems) return [];
    return workItems
      .filter((item: WorkItem) =>
          item.status === 'pending-quality-review' ||
          item.status === 'completed' ||
          item.status === 'rejected'
      )
      .sort((a,b) => (b.actualEndDate?.getTime() || 0) - (a.actualEndDate?.getTime() || 0));
  }, [workItems, user]);

  const filterByStatus = (status: string) => {
      return mySubmittedProtocols.filter(p => p.status === status);
  }

  return (
    <div className="flex flex-col gap-8 pb-10">
      <PageHeader
        title="Mis Protocolos Enviados"
        description="Aquí verás el historial y estado de las partidas que has finalizado y enviado a revisión."
      />

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="all">Todos ({mySubmittedProtocols.length})</TabsTrigger>
            <TabsTrigger value="pending-quality-review">Pendientes ({filterByStatus('pending-quality-review').length})</TabsTrigger>
            <TabsTrigger value="completed">Aprobados ({filterByStatus('completed').length})</TabsTrigger>
            <TabsTrigger value="rejected">Rechazados ({filterByStatus('rejected').length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
            <ProtocolList protocols={mySubmittedProtocols} />
        </TabsContent>
        <TabsContent value="pending-quality-review">
             <ProtocolList protocols={filterByStatus('pending-quality-review')} />
        </TabsContent>
        <TabsContent value="completed">
             <ProtocolList protocols={filterByStatus('completed')} />
        </TabsContent>
        <TabsContent value="rejected">
             <ProtocolList protocols={filterByStatus('rejected')} />
        </TabsContent>
      </Tabs>
    </div>
  );
}


function ProtocolList({ protocols }: { protocols: WorkItem[] }) {
    if (protocols.length === 0) {
        return (
             <div className="mt-4 flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border bg-card p-12 text-center text-muted-foreground">
                <Inbox className="mb-4 h-16 w-16 opacity-50"/>
                <h3 className="text-xl font-bold tracking-tight">Sin Protocolos</h3>
                <p className="mt-2">No hay partidas en esta categoría.</p>
            </div>
        );
    }

    return (
        <SurfaceCard interactive={false} className="mt-4">
            <ScrollArea className="h-[calc(80vh-16rem)]">
                <div className="space-y-3 p-4">
                    {protocols.map(item => {
                        const statusInfo = getStatusInfo(item.status);
                        return (
                            <div key={item.id} className="flex flex-col gap-4 rounded-xl border border-border bg-muted/40 p-4 transition-colors hover:bg-muted sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0 flex-grow">
                                    <p className="font-semibold text-foreground">{item.path} - {item.name}</p>
                                    <p className="text-sm text-muted-foreground">Enviado {formatDate(item.actualEndDate)}</p>
                                </div>
                                <StatusBadge tone={statusInfo.tone} icon={statusInfo.icon} className="w-fit shrink-0">
                                    {statusInfo.label}
                                </StatusBadge>
                            </div>
                        );
                    })}
                </div>
            </ScrollArea>
        </SurfaceCard>
    );
}
