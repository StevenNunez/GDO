"use client";

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Plus, MessageCircleQuestion, AlertTriangle, Clock } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { PlanLocked } from '@/components/plan-locked';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/date-utils';
import {
  estadoRdi, diasParaResponder, resumenRdi, promedioRespuesta,
  rdisConImpactoSinAdicional, PRIORIDADES_RDI,
} from '@/lib/rdi';
import { DISCIPLINAS } from '@/lib/documents';
import { ESTADO_RDI, textoPlazo } from '@/components/operations/rdi-estado';

type Filtro = 'pendientes' | 'todas' | 'respondidas';

export default function RdiPage() {
  const { rdis, currentProjectId, can, lockedFeature } = useAppState();
  const [filtro, setFiltro] = useState<Filtro>('pendientes');

  const deLaObra = useMemo(
    () => rdis.filter((r) => r.projectId === currentProjectId),
    [rdis, currentProjectId],
  );

  const resumen = useMemo(() => resumenRdi(deLaObra), [deLaObra]);
  const promedio = useMemo(() => promedioRespuesta(deLaObra), [deLaObra]);
  const sinCobrar = useMemo(() => rdisConImpactoSinAdicional(deLaObra), [deLaObra]);

  const listadas = useMemo(() => {
    const base = deLaObra.filter((r) => {
      if (filtro === 'pendientes') return r.status === 'abierta';
      if (filtro === 'respondidas') return r.status === 'respondida' || r.status === 'cerrada';
      return true;
    });
    // Las pendientes se ordenan por urgencia; el resto, por correlativo.
    if (filtro === 'pendientes') {
      return [...base].sort((a, b) => {
        const da = diasParaResponder(a);
        const db = diasParaResponder(b);
        if (da === null && db === null) return b.number - a.number;
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      });
    }
    return [...base].sort((a, b) => b.number - a.number);
  }, [deLaObra, filtro]);

  const bloqueoDePlan = lockedFeature('rdi:create');
  if (bloqueoDePlan) return <PlanLocked feature={bloqueoDePlan} title="RDI" />;

  if (!currentProjectId) {
    return (
      <div className="space-y-6">
        <PageHeader title="RDI" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Selecciona una obra para ver sus requerimientos de información.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="RDI · Requerimientos de información"
        description="Las consultas al mandante y al proyectista, con su plazo. Una RDI sin responder es la prueba de por qué una partida se atrasó."
        actions={can('rdi:create') && (
          <Link href="/dashboard/oficina-tecnica/rdi/nueva">
            <Button><Plus className="mr-2 h-4 w-4" /> Nueva RDI</Button>
          </Link>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Sin responder" value={`${resumen.pendientes}`} />
        <Kpi
          label="Vencidas"
          value={`${resumen.vencidas}`}
          tone={resumen.vencidas > 0 ? 'danger' : undefined}
        />
        <Kpi
          label="Por vencer"
          value={`${resumen.porVencer}`}
          tone={resumen.porVencer > 0 ? 'warning' : undefined}
        />
        <Kpi
          label="Demora promedio"
          value={promedio !== null ? `${promedio.toFixed(0)} días` : '—'}
          hint={promedio !== null ? 'en responder' : 'sin respuestas medibles'}
        />
      </div>

      {/* El hallazgo que hay que gritar: obra reconocida y sin cobrar */}
      {sinCobrar.length > 0 && (
        <Card className="border-warning/40">
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <AlertTriangle className="h-4 w-4 text-warning" />
              {sinCobrar.length} RDI respondida(s) con impacto declarado y sin adicional
            </div>
            <p className="text-sm text-muted-foreground">
              Alguien contestó por escrito que hay obra o plazo extra, y todavía no se generó el
              adicional. Es lo primero que se pierde cuando la obra avanza.
            </p>
            <ul className="space-y-1">
              {sinCobrar.slice(0, 5).map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/dashboard/oficina-tecnica/rdi/${r.id}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    RDI N° {r.number} · {r.subject}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-4 p-0">
          <div className="flex flex-wrap items-center gap-3 px-6 pt-6">
            <Select value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
              <SelectTrigger className="w-[14rem]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendientes">Sin responder</SelectItem>
                <SelectItem value="respondidas">Respondidas</SelectItem>
                <SelectItem value="todas">Todas</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">
              {listadas.length} de {deLaObra.length}
            </span>
          </div>

          {listadas.length === 0 ? (
            <div className="flex flex-col items-start gap-2 p-6">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <MessageCircleQuestion className="h-4 w-4" />
                {deLaObra.length === 0
                  ? 'Todavía no hay requerimientos de información'
                  : 'Nada que mostrar con este filtro'}
              </div>
              {deLaObra.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Cuando el proyecto no alcance para construir, pregunta por acá: queda la fecha, el
                  plazo y la respuesta, que es lo que después respalda un adicional.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N°</TableHead>
                    <TableHead>Asunto</TableHead>
                    <TableHead>Especialidad</TableHead>
                    <TableHead>Dirigida a</TableHead>
                    <TableHead>Plazo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listadas.map((r) => {
                    const estado = estadoRdi(r);
                    const est = ESTADO_RDI[estado];
                    const dias = diasParaResponder(r);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.number}</TableCell>
                        <TableCell>
                          <div className="font-medium text-foreground">{r.subject}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.priority !== 'normal' ? `Prioridad ${PRIORIDADES_RDI[r.priority].toLowerCase()} · ` : ''}
                            {r.askedAt ? `Preguntada ${formatDate(r.askedAt)}` : 'Sin fecha'}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {DISCIPLINAS[r.discipline]}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{r.askedTo ?? '—'}</TableCell>
                        <TableCell>
                          {r.status === 'abierta' ? (
                            <span className={`flex items-center gap-1.5 text-sm ${
                              dias !== null && dias < 0 ? 'text-danger' : 'text-muted-foreground'
                            }`}>
                              <Clock className="h-3.5 w-3.5" />
                              {textoPlazo(dias)}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {r.answeredAt ? formatDate(r.answeredAt) : '—'}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <StatusBadge tone={est.tone}>{est.label}</StatusBadge>
                            {(r.impactCost || r.impactTime) && !r.amendmentId && (
                              <StatusBadge tone="warning">Sin cobrar</StatusBadge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/dashboard/oficina-tecnica/rdi/${r.id}`}>
                            <Button variant="ghost" size="sm">Ver</Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, hint, tone }: {
  label: string; value: string; hint?: string; tone?: 'warning' | 'danger';
}) {
  return (
    <Card className={tone === 'danger' ? 'border-danger/40' : undefined}>
      <CardContent className="space-y-1 p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className={`text-xl font-bold ${
          tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-foreground'
        }`}>
          {value}
        </div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
