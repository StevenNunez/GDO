"use client";

/**
 * Bandeja «pendientes de mi firma».
 *
 * Sin esto, la cadena de aprobación obliga a cada aprobador a entrar documento
 * por documento a ver si le toca. Acá ve de una todo lo que lo está esperando,
 * lo más viejo primero, con el link directo al documento.
 *
 * No se muestra si no hay nada pendiente: una tarjeta vacía permanente enseña
 * a ignorarla, que es justo lo contrario de lo que se busca.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { ChevronRight, Clock, PenLine } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { useAuth } from '@/modules/core/contexts/app-provider';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { TIPO_DOCUMENTO_LABEL, diasEsperando, pendientesDeFirma } from '@/lib/approval';
import type { ApprovalDocumentType, ApprovalRequest } from '@/modules/core/lib/data';

/** A dónde lleva el documento de cada tipo. */
function rutaDelDocumento(r: ApprovalRequest): string {
  const rutas: Record<ApprovalDocumentType, string> = {
    subcontract: `/dashboard/oficina-tecnica/subcontratos/${r.documentId}`,
    subcontract_certificate: `/dashboard/oficina-tecnica/subcontratos`,
    payment_certificate: `/dashboard/oficina-tecnica/estados-de-pago/${r.documentId}`,
    amendment: `/dashboard/oficina-tecnica/adicionales/${r.documentId}`,
  };
  return rutas[r.documentType];
}

export function BandejaAprobaciones({ limite = 6 }: { limite?: number }) {
  const { approvalRequests, approvalDelegations, users } = useAppState();
  const { user } = useAuth();

  const pendientes = useMemo(
    () => pendientesDeFirma(approvalRequests, {
      userId: user?.id,
      role: user?.role,
      // Con esto, lo que le delegaron también aparece en su bandeja. Sin ello,
      // el reemplazante tendría el permiso de firmar pero no sabría qué.
      delegaciones: approvalDelegations,
      rolPorUsuario: Object.fromEntries(users.map((u) => [u.id, u.role])),
    }),
    [approvalRequests, approvalDelegations, users, user?.id, user?.role],
  );

  if (pendientes.length === 0) return null;

  return (
    <Card className="border-warning/40">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <PenLine className="h-4 w-4 text-warning" />
            Pendientes de tu firma
          </span>
          <StatusBadge tone="warning">{pendientes.length}</StatusBadge>
        </div>

        <ul className="divide-y divide-border">
          {pendientes.slice(0, limite).map((r) => {
            const dias = diasEsperando(r);
            return (
              <li key={r.id}>
                <Link
                  href={rutaDelDocumento(r)}
                  className="flex items-center gap-3 py-2 text-sm hover:opacity-80"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-foreground">
                      {TIPO_DOCUMENTO_LABEL[r.documentType]}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {dias === 0 ? 'Presentado hoy' : `${dias} día(s) esperando`}
                      {' · '}
                      {r.stepsSnapshot[r.currentStep]?.name ?? 'Paso en curso'}
                    </div>
                  </div>
                  {dias >= 3 && <StatusBadge tone="danger">Atrasado</StatusBadge>}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>

        {pendientes.length > limite && (
          <p className="text-xs text-muted-foreground">
            y {pendientes.length - limite} más.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
