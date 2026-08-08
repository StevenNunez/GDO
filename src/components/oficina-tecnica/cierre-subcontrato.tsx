"use client";

/**
 * Cierre (liquidación) del subcontrato — el último eslabón del proceso.
 *
 * Liquidar es decir «con este contratista no queda nada pendiente». Cerrarlo
 * con retención sin devolver o con estados de pago sin pagar deja plata
 * colgando que después nadie reclama: la retención, en particular, se queda en
 * la planilla para siempre.
 */

import { useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, Lock, RotateCcw } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/modules/core/hooks/use-toast';
import { formatCLP } from '@/lib/format';
import { formatDate } from '@/lib/date-utils';
import { estadoCierre, liquidacionFinal } from '@/lib/payment-order';
import { adendasDeSubcontrato, enTramite, impactoSubcontrato } from '@/lib/amendment';
import type {
  Reception, Subcontract, SubcontractCertificate,
} from '@/modules/core/lib/data';

interface Props {
  subcontract: Subcontract;
  eepps: SubcontractCertificate[];
  recepciones: Reception[];
  retencionPorDevolver: number;
  editable: boolean;
}

export function CierreSubcontrato({
  subcontract: sc, eepps, recepciones, retencionPorDevolver, editable,
}: Props) {
  const { amendments, closeSubcontract, reopenSubcontract } = useAppState();
  const { toast } = useToast();
  const [cerrando, setCerrando] = useState(false);
  const [notas, setNotas] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const adendas = useMemo(
    () => adendasDeSubcontrato(amendments, sc.id),
    [amendments, sc.id],
  );

  const cierre = useMemo(
    () => estadoCierre(eepps, {
      retencionPorDevolver,
      recepciones,
      adendasEnTramite: adendas.filter(enTramite).length,
    }),
    [eepps, retencionPorDevolver, recepciones, adendas],
  );

  const impacto = useMemo(() => impactoSubcontrato(sc, adendas), [sc, adendas]);

  const liquidacion = useMemo(
    () => liquidacionFinal(impacto.montoOriginal, impacto.montoVigente, cierre.totalPagado),
    [impacto, cierre.totalPagado],
  );

  const cerrado = sc.status === 'liquidado';

  // Mientras el contrato está lejos del final, esta tarjeta solo estorba.
  if (!cerrado && cierre.eeppPendientes > 0 && cierre.totalPagado === 0) return null;

  return (
    <Card className={cerrado ? 'border-success/40' : undefined}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">
          {cerrado ? <Lock className="mr-2 inline h-4 w-4" /> : null}
          Cierre del contrato
        </CardTitle>
        <StatusBadge tone={cerrado ? 'success' : cierre.puede ? 'info' : 'neutral'}>
          {cerrado
            ? `Liquidado${sc.closedAt ? ` el ${formatDate(sc.closedAt)}` : ''}`
            : cierre.puede ? 'Listo para liquidar' : 'En ejecución'}
        </StatusBadge>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* La liquidación: lo pactado contra lo pagado */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Dato label="Contratado (vigente)" valor={formatCLP(liquidacion.montoVigente)} />
          <Dato label="Pagado" valor={formatCLP(liquidacion.totalPagado)} />
          <Dato
            label="Diferencia"
            valor={`${liquidacion.diferencia >= 0 ? '+' : '−'}${formatCLP(Math.abs(liquidacion.diferencia))}`}
            detalle={liquidacion.diferenciaPct !== null
              ? `${liquidacion.diferenciaPct.toFixed(1)}% del contrato`
              : undefined}
            tono={liquidacion.diferencia > 0 ? 'danger' : undefined}
          />
        </div>

        {cerrado ? (
          <>
            {sc.closureNotes && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Observaciones del cierre: </span>
                {sc.closureNotes}
              </p>
            )}
            {editable && (
              <Button
                variant="outline" size="sm" disabled={ocupado}
                onClick={async () => {
                  setOcupado(true);
                  try {
                    await reopenSubcontract(sc.id);
                    toast({ title: 'Contrato reabierto' });
                  } catch (e: any) {
                    toast({ variant: 'destructive', title: 'No se pudo reabrir', description: e.message });
                  } finally { setOcupado(false); }
                }}
              >
                <RotateCcw className="mr-2 h-4 w-4" /> Reabrir
              </Button>
            )}
          </>
        ) : (
          <>
            {cierre.pendientes.length > 0 ? (
              <div className="space-y-2 rounded-md border border-warning/40 bg-warning-subtle p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <CircleAlert className="h-4 w-4 text-warning" />
                  Falta para poder liquidar
                </div>
                <ul className="ml-6 list-disc text-sm text-muted-foreground">
                  {cierre.pendientes.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" />
                No queda nada pendiente con este contratista.
              </p>
            )}

            {editable && (
              <Button disabled={!cierre.puede} onClick={() => setCerrando(true)}>
                Liquidar contrato
              </Button>
            )}
          </>
        )}
      </CardContent>

      <Dialog open={cerrando} onOpenChange={(o) => !o && setCerrando(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Liquidar el contrato</DialogTitle>
            <DialogDescription>
              Queda cerrado con fecha de hoy. Se le pagaron{' '}
              {formatCLP(liquidacion.totalPagado)} de {formatCLP(liquidacion.montoVigente)}{' '}
              contratados. Se puede reabrir si fue un error.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={notas} onChange={(e) => setNotas(e.target.value)} rows={3}
            placeholder="Observaciones del cierre (opcional): saldos, acuerdos, pendientes menores."
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setCerrando(false)}>Cancelar</Button>
            <Button
              disabled={ocupado}
              onClick={async () => {
                setOcupado(true);
                try {
                  await closeSubcontract(sc.id, notas);
                  toast({ title: 'Contrato liquidado' });
                  setCerrando(false);
                } catch (e: any) {
                  toast({ variant: 'destructive', title: 'No se pudo liquidar', description: e.message });
                } finally { setOcupado(false); }
              }}
            >
              Liquidar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Dato({
  label, valor, detalle, tono,
}: {
  label: string;
  valor: string;
  detalle?: string;
  tono?: 'danger';
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 font-semibold ${tono === 'danger' ? 'text-danger' : 'text-foreground'}`}>
        {valor}
      </div>
      {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
    </div>
  );
}
