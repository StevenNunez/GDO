"use client";

/**
 * Calendario de la obra: contratos, garantías, documentos de contratista,
 * órdenes de pago, RDI y restricciones, todo en la misma grilla.
 *
 * No calcula nada: consume `construirAgenda()`. Esa es la razón de que el
 * número que muestra el dashboard y el que muestra esta pantalla no puedan
 * discrepar — salen de la misma lista.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays, ChevronLeft, ChevronRight, Download, ListFilter,
} from 'lucide-react';
import { useAppState, useAuth } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/date-utils';
import {
  EVENTO_LABEL, HORIZONTE_PROXIMO, URGENCIA_TONO, agendaDelMes, agendaPorDia,
  agendaUrgente, claveDia, construirAgenda, grillaDelMes, resumenAgenda,
  type EventoAgenda, type EventoTipo,
} from '@/lib/agenda';
import { generateAgendaPDF } from '@/lib/agenda-pdf-generator';
import { useToast } from '@/modules/core/hooks/use-toast';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export default function CalendarioPage() {
  const {
    contracts, amendments, guarantees, subcontracts, suppliers,
    contractorDocumentTypes, contractorDocuments, paymentOrders,
    rdis, taskConstraints, receptions, equipmentRentals, projects,
    currentProjectId, can,
  } = useAppState();
  const { getTenantId } = useAuth();
  const { toast } = useToast();

  const hoy = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [filtro, setFiltro] = useState<EventoTipo | 'todos'>('todos');

  const agenda = useMemo(
    () => construirAgenda({
      contracts, amendments, guarantees, subcontracts, suppliers,
      contractorDocumentTypes, contractorDocuments, paymentOrders,
      rdis, taskConstraints, receptions, equipmentRentals,
    }, { projectId: currentProjectId, hoy }),
    [
      contracts, amendments, guarantees, subcontracts, suppliers,
      contractorDocumentTypes, contractorDocuments, paymentOrders,
      rdis, taskConstraints, receptions, equipmentRentals, currentProjectId, hoy,
    ],
  );

  const filtrada = useMemo(
    () => (filtro === 'todos' ? agenda : agenda.filter((e) => e.tipo === filtro)),
    [agenda, filtro],
  );

  const resumen = useMemo(() => resumenAgenda(agenda), [agenda]);
  const urgentes = useMemo(() => agendaUrgente(filtrada), [filtrada]);

  const anio = cursor.getFullYear();
  const mes = cursor.getMonth();
  const celdas = useMemo(() => grillaDelMes(anio, mes), [anio, mes]);
  const delMes = useMemo(() => agendaDelMes(filtrada, anio, mes), [filtrada, anio, mes]);
  const porDia = useMemo(() => agendaPorDia(delMes), [delMes]);

  const tiposPresentes = useMemo(() => {
    const s = new Set(agenda.map((e) => e.tipo));
    return [...s];
  }, [agenda]);

  if (!can('module_technical_office:view')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Calendario" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No tienes permiso para ver este módulo.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendario de la obra"
        description="Todo lo que tiene fecha, en un solo lugar. Las fechas salen de cada documento: no hay una copia que se pueda desactualizar."
        actions={
          <Button
            variant="outline"
            onClick={async () => {
              const tenantId = getTenantId();
              if (!tenantId) return;
              try {
                await generateAgendaPDF({
                  tenantId,
                  eventos: urgentes,
                  projectName: projects.find((p) => p.id === currentProjectId)?.name ?? null,
                  horizonte: HORIZONTE_PROXIMO,
                });
              } catch (e: any) {
                toast({ variant: 'destructive', title: 'No se pudo generar', description: e.message });
              }
            }}
          >
            <Download className="mr-2 h-4 w-4" /> Descargar resumen
          </Button>
        }
      />

      {/* Resumen — los mismos números que ve el dashboard */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Contador label="Vencidos" valor={resumen.vencidos} tono="danger" />
        <Contador label="Vencen hoy" valor={resumen.hoy} tono="danger" />
        <Contador label={`Próximos 15 días`} valor={resumen.proximos} tono="warning" />
      </div>

      {/* Filtro por tipo */}
      {tiposPresentes.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <ListFilter className="h-4 w-4 text-muted-foreground" />
          <Button
            size="sm" variant={filtro === 'todos' ? 'default' : 'outline'}
            onClick={() => setFiltro('todos')}
          >
            Todos
          </Button>
          {tiposPresentes.map((t) => (
            <Button
              key={t} size="sm" variant={filtro === t ? 'default' : 'outline'}
              onClick={() => setFiltro(t)}
            >
              {EVENTO_LABEL[t]}
            </Button>
          ))}
        </div>
      )}

      {/* Grilla mensual */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost" size="icon" aria-label="Mes anterior"
              onClick={() => setCursor(new Date(anio, mes - 1, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-3">
              <span className="font-semibold text-foreground">
                {MESES[mes]} {anio}
              </span>
              <Button
                variant="outline" size="sm"
                onClick={() => setCursor(new Date(hoy.getFullYear(), hoy.getMonth(), 1))}
              >
                Hoy
              </Button>
            </div>
            <Button
              variant="ghost" size="icon" aria-label="Mes siguiente"
              onClick={() => setCursor(new Date(anio, mes + 1, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-7 gap-1 pb-1">
                {DIAS.map((d) => (
                  <div key={d} className="text-center text-xs font-medium uppercase text-muted-foreground">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {celdas.map((dia) => {
                  const clave = claveDia(dia);
                  const eventos = porDia.get(clave) ?? [];
                  const esDelMes = dia.getMonth() === mes;
                  const esHoy = clave === claveDia(hoy);

                  return (
                    <div
                      key={clave}
                      className={[
                        'min-h-20 rounded-md border p-1.5',
                        esDelMes ? 'border-border' : 'border-transparent bg-muted/30',
                        esHoy ? 'ring-2 ring-primary' : '',
                      ].join(' ')}
                    >
                      <div className={`text-xs ${esDelMes ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {dia.getDate()}
                      </div>
                      <div className="mt-1 space-y-1">
                        {eventos.slice(0, 3).map((e) => (
                          <Link
                            key={e.id}
                            href={e.href}
                            title={e.titulo}
                            className={[
                              'block truncate rounded px-1 py-0.5 text-[11px] leading-tight',
                              e.urgencia === 'vencido' || e.urgencia === 'hoy'
                                ? 'bg-danger-subtle text-danger'
                                : e.urgencia === 'proximo'
                                  ? 'bg-warning-subtle text-warning'
                                  : 'bg-muted text-muted-foreground',
                            ].join(' ')}
                          >
                            {e.titulo}
                          </Link>
                        ))}
                        {eventos.length > 3 && (
                          <div className="px-1 text-[10px] text-muted-foreground">
                            +{eventos.length - 3} más
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lo accionable, en lista */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CalendarDays className="h-4 w-4" />
            Vencido y por vencer
          </div>

          {urgentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay nada vencido ni venciendo en los próximos 15 días.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {urgentes.map((e) => <Fila key={e.id} evento={e} />)}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Fila({ evento: e }: { evento: EventoAgenda }) {
  return (
    <li>
      <Link href={e.href} className="flex flex-wrap items-center gap-3 py-2 text-sm hover:opacity-80">
        <div className="min-w-0 flex-1">
          <div className="truncate text-foreground">{e.titulo}</div>
          <div className="text-xs text-muted-foreground">
            {EVENTO_LABEL[e.tipo]} · {formatDate(e.fecha)}
            {e.detalle ? ` · ${e.detalle}` : ''}
          </div>
        </div>
        <StatusBadge tone={URGENCIA_TONO[e.urgencia]}>
          {e.dias < 0
            ? `Venció hace ${Math.abs(e.dias)} día(s)`
            : e.dias === 0 ? 'Hoy' : `En ${e.dias} día(s)`}
        </StatusBadge>
      </Link>
    </li>
  );
}

function Contador({
  label, valor, tono,
}: {
  label: string;
  valor: number;
  tono: 'danger' | 'warning';
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="text-2xl font-bold text-foreground">{valor}</div>
        {valor > 0 && <StatusBadge tone={tono}>Requiere atención</StatusBadge>}
      </CardContent>
    </Card>
  );
}
