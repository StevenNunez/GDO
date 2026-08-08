"use client";

/**
 * Lo vencido y lo que vence pronto, para el dashboard.
 *
 * **Esta tarjeta no calcula nada**: consume `construirAgenda()`, la misma
 * función que alimenta el calendario. Antes cada pantalla armaba su propio «lo
 * que vence» con criterios levemente distintos —una miraba el plazo original,
 * otra el vigente— y dos pantallas podían discrepar sobre el mismo hecho. Ese
 * fue el punto de ordenar las capas: eventos → calendario → dashboard.
 *
 * No se muestra si no hay nada urgente: una tarjeta vacía permanente enseña a
 * ignorarla.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/date-utils';
import {
  EVENTO_LABEL, URGENCIA_TONO, agendaUrgente, construirAgenda,
} from '@/lib/agenda';

export function AgendaCard({ limite = 6 }: { limite?: number }) {
  const {
    contracts, amendments, guarantees, subcontracts, suppliers,
    contractorDocumentTypes, contractorDocuments, paymentOrders,
    rdis, taskConstraints, receptions, equipmentRentals, currentProjectId,
  } = useAppState();

  const urgentes = useMemo(
    () => agendaUrgente(construirAgenda({
      contracts, amendments, guarantees, subcontracts, suppliers,
      contractorDocumentTypes, contractorDocuments, paymentOrders,
      rdis, taskConstraints, receptions, equipmentRentals,
    }, { projectId: currentProjectId })),
    [
      contracts, amendments, guarantees, subcontracts, suppliers,
      contractorDocumentTypes, contractorDocuments, paymentOrders,
      rdis, taskConstraints, receptions, equipmentRentals, currentProjectId,
    ],
  );

  if (urgentes.length === 0) return null;

  const vencidos = urgentes.filter((e) => e.dias < 0).length;

  return (
    <Card className={vencidos > 0 ? 'border-danger/40' : 'border-warning/40'}>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CalendarClock className={`h-4 w-4 ${vencidos > 0 ? 'text-danger' : 'text-warning'}`} />
            Vencido y por vencer
          </span>
          <div className="flex items-center gap-2">
            {vencidos > 0 && <StatusBadge tone="danger">{vencidos} vencido(s)</StatusBadge>}
            <StatusBadge tone="warning">{urgentes.length}</StatusBadge>
          </div>
        </div>

        <ul className="divide-y divide-border">
          {urgentes.slice(0, limite).map((e) => (
            <li key={e.id}>
              <Link href={e.href} className="flex items-center gap-3 py-2 text-sm hover:opacity-80">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-foreground">{e.titulo}</div>
                  <div className="text-xs text-muted-foreground">
                    {EVENTO_LABEL[e.tipo]} · {formatDate(e.fecha)}
                  </div>
                </div>
                <StatusBadge tone={URGENCIA_TONO[e.urgencia]}>
                  {e.dias < 0
                    ? `hace ${Math.abs(e.dias)}d`
                    : e.dias === 0 ? 'hoy' : `en ${e.dias}d`}
                </StatusBadge>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>

        <Link
          href="/dashboard/oficina-tecnica/calendario"
          className="inline-block text-sm font-medium text-primary hover:underline"
        >
          {urgentes.length > limite
            ? `Ver el calendario completo (${urgentes.length - limite} más)`
            : 'Ver el calendario'}
        </Link>
      </CardContent>
    </Card>
  );
}
