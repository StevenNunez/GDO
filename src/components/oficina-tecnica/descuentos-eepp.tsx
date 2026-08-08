"use client";

/**
 * Descuentos de un estado de pago (migración 034).
 *
 * Convierte el «otros descuentos: $200.000» en una liquidación que se puede
 * explicar renglón por renglón. Cada línea tiene su tipo, su glosa y —cuando
 * salió de otro módulo— de dónde salió.
 *
 * Las líneas son la fuente: al agregar o quitar una, la base recalcula el
 * total, el neto y el IVA del estado de pago. Por eso este panel solo aparece
 * mientras está en borrador.
 */

import { useMemo, useState } from 'react';
import { Hammer, Plus, Receipt, Trash2 } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/modules/core/hooks/use-toast';
import { formatCLP } from '@/lib/format';
import {
  TIPOS_DESCUENTO, TIPOS_DESCUENTO_ORDEN, descuentosDe, descuentosPorTipo,
  herramientasPendientesDe, totalDescuentos, validarDescuento, yaSeDesconto,
} from '@/lib/deductions';
import type { DeductionKind } from '@/modules/core/lib/data';

interface Props {
  certificateType: 'subcontract' | 'contract';
  certificateId: string;
  /**
   * Neto ANTES de otros descuentos: avance − amortización − retención − multa.
   * Es el techo de lo que se puede descontar sin dejar el pago en negativo.
   */
  netoAntesDeDescuentos: number;
  /** Usuario del contratista, si tiene portal: habilita sugerir herramientas. */
  contactUserId?: string | null;
  editable: boolean;
}

export function DescuentosEepp({
  certificateType, certificateId, netoAntesDeDescuentos, contactUserId, editable,
}: Props) {
  const { certificateDeductions, toolLogs, deleteCertificateDeduction } = useAppState();
  const { toast } = useToast();
  const [agregando, setAgregando] = useState(false);

  const lineas = useMemo(
    () => descuentosDe(certificateDeductions, certificateType, certificateId),
    [certificateDeductions, certificateType, certificateId],
  );

  const total = useMemo(() => totalDescuentos(lineas), [lineas]);
  const porTipo = useMemo(() => descuentosPorTipo(lineas), [lineas]);

  // Herramientas que el contratista tiene sin devolver. Solo hay algo que
  // sugerir si tiene usuario en la app: las herramientas se prestan a una
  // persona, no a una empresa.
  const pendientes = useMemo(
    () => herramientasPendientesDe(toolLogs, contactUserId)
      .filter((h) => !yaSeDesconto(certificateDeductions, 'tool_log', h.log.id)),
    [toolLogs, contactUserId, certificateDeductions],
  );

  if (!editable && lineas.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">
          Descuentos
          {total > 0 && (
            <span className="ml-2 text-sm font-normal text-danger">
              −{formatCLP(total)}
            </span>
          )}
        </CardTitle>
        {editable && (
          <Button size="sm" variant="outline" onClick={() => setAgregando(true)}>
            <Plus className="mr-2 h-4 w-4" /> Agregar descuento
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {lineas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin descuentos. Herramientas no devueltas, EPP, combustible o materiales de
            bodega se cargan acá, uno por uno, en vez de un «otros» sin explicación.
          </p>
        ) : (
          <>
            {porTipo.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {porTipo.map((t) => (
                  <StatusBadge key={t.kind} tone="neutral">
                    {t.label}: {formatCLP(t.monto)}
                  </StatusBadge>
                ))}
              </div>
            )}

            <ul className="divide-y divide-border rounded-md border border-border">
              {lineas.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="text-foreground">{d.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {TIPOS_DESCUENTO[d.kind]}
                      {d.sourceType === 'tool_log' && ' · desde Bodega'}
                      {d.notes ? ` · ${d.notes}` : ''}
                    </div>
                  </div>
                  <span className="font-medium text-danger">−{formatCLP(d.amount)}</span>
                  {editable && (
                    <Button
                      variant="ghost" size="icon" aria-label="Quitar"
                      onClick={async () => {
                        try { await deleteCertificateDeduction(d.id); }
                        catch (e: any) {
                          toast({ variant: 'destructive', title: 'No se pudo quitar', description: e.message });
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-danger" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Sugerencia desde Bodega */}
        {editable && pendientes.length > 0 && (
          <div className="space-y-2 rounded-md border border-warning/40 bg-warning-subtle p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Hammer className="h-4 w-4 text-warning" />
              Herramientas sin devolver de este contratista
            </div>
            <ul className="space-y-1 text-sm">
              {pendientes.slice(0, 5).map((h) => (
                <li key={h.log.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-foreground">{h.log.toolName}</span>
                  <span className="text-xs text-muted-foreground">
                    {h.dias} día(s) fuera
                  </span>
                  <Button
                    size="sm" variant="outline" className="ml-auto"
                    onClick={() => setAgregando(true)}
                  >
                    Descontar
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      {agregando && (
        <DialogoDescuento
          certificateType={certificateType}
          certificateId={certificateId}
          netoAntesDeDescuentos={netoAntesDeDescuentos}
          yaDescontado={total}
          herramientas={pendientes}
          onCerrar={() => setAgregando(false)}
        />
      )}
    </Card>
  );
}

/* ── Alta de un descuento ──────────────────────────────────────────────── */

const SIN_ORIGEN = '__manual__';

function DialogoDescuento({
  certificateType, certificateId, netoAntesDeDescuentos, yaDescontado,
  herramientas, onCerrar,
}: {
  certificateType: 'subcontract' | 'contract';
  certificateId: string;
  netoAntesDeDescuentos: number;
  yaDescontado: number;
  herramientas: { log: { id: string; toolName: string }; dias: number }[];
  onCerrar: () => void;
}) {
  const { addCertificateDeduction } = useAppState();
  const { toast } = useToast();

  const [kind, setKind] = useState<DeductionKind>('herramienta');
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState(0);
  const [origen, setOrigen] = useState(SIN_ORIGEN);
  const [ocupado, setOcupado] = useState(false);

  const disponible = netoAntesDeDescuentos - yaDescontado;

  async function guardar() {
    const errores = validarDescuento(
      { description: descripcion, amount: monto, kind },
      { netoAntesDeDescuentos, yaDescontado },
    );
    if (errores.length > 0) {
      toast({ variant: 'destructive', title: 'Revisa el descuento', description: errores[0] });
      return;
    }

    setOcupado(true);
    try {
      await addCertificateDeduction({
        certificateType,
        certificateId,
        kind,
        description: descripcion.trim(),
        amount: monto,
        ...(origen !== SIN_ORIGEN
          ? { sourceType: 'tool_log' as const, sourceId: origen }
          : {}),
      });
      onCerrar();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo agregar', description: e.message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <Receipt className="mr-2 inline h-4 w-4" /> Nuevo descuento
          </DialogTitle>
          <DialogDescription>
            Saldo disponible para descontar: {formatCLP(Math.max(0, disponible))}.
            Más que eso dejaría el estado de pago en negativo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as DeductionKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS_DESCUENTO_ORDEN.map((k) => (
                  <SelectItem key={k} value={k}>{TIPOS_DESCUENTO[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              El tipo es lo que después permite responder «cuánto le he descontado en
              herramientas este año».
            </p>
          </div>

          {kind === 'herramienta' && herramientas.length > 0 && (
            <div className="space-y-2">
              <Label>¿Cuál herramienta?</Label>
              <Select
                value={origen}
                onValueChange={(v) => {
                  setOrigen(v);
                  const h = herramientas.find((x) => x.log.id === v);
                  if (h) setDescripcion(`${h.log.toolName} no devuelta (${h.dias} días)`);
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_ORIGEN}>Escribirlo a mano</SelectItem>
                  {herramientas.map((h) => (
                    <SelectItem key={h.log.id} value={h.log.id}>
                      {h.log.toolName} · {h.dias} días fuera
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Enlazarla evita que la misma herramienta se descuente dos veces en
                períodos distintos.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="de-desc">Qué se descuenta</Label>
            <Input id="de-desc" value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: taladro percutor Bosch no devuelto" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="de-monto">Monto</Label>
            <Input id="de-monto" type="number" min={0} value={monto || ''}
              onChange={(e) => setMonto(Number(e.target.value) || 0)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={ocupado}>Agregar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
