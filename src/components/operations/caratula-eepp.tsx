'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { formatCLP } from '@/lib/format';
import type { Contract } from '@/modules/core/lib/data';
import type { Caratula } from '@/lib/payment-certificate';

interface Props {
  contrato: Contract;
  caratula: Caratula;
  /** En un EEPP ya emitido los montos se muestran, no se editan. */
  editable?: boolean;
  multaSugerida?: number;
  multa?: number;
  onMulta?: (v: number) => void;
  otros?: number;
  onOtros?: (v: number) => void;
  otrosNota?: string;
  onOtrosNota?: (v: string) => void;
  reajusteManual?: number | null;
  onReajusteManual?: (v: number) => void;
  /** El contrato se reajusta pero falta el valor del índice. */
  faltaIndice?: boolean;
}

/**
 * La carátula del estado de pago: la cascada de montos tal como se lee en un
 * EEPP chileno, desde el avance del período hasta el total a pagar.
 */
export function CaratulaEepp({
  contrato, caratula, editable = false,
  multaSugerida = 0, multa = 0, onMulta,
  otros = 0, onOtros, otrosNota = '', onOtrosNota,
  reajusteManual, onReajusteManual,
  faltaIndice = false,
}: Props) {
  const esDelegada = contrato.type === 'administracion_delegada';
  const esPolinomico = contrato.reajusteType === 'polinomico';

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Carátula</CardTitle></CardHeader>
      <CardContent className="space-y-1">
        <Fila label="Avance del período" value={caratula.periodAmount} />

        {esDelegada && (
          <Fila label={`Honorario (${contrato.feePercent}%)`} value={caratula.feeAmount} />
        )}

        {/* Reajuste */}
        {contrato.reajusteType !== 'none' && (
          editable && esPolinomico ? (
            <FilaEditable
              label="Reajuste (fórmula polinómica)"
              hint="La fórmula la define el contrato: se ingresa a mano."
              value={reajusteManual ?? 0}
              onChange={(v) => onReajusteManual?.(v)}
            />
          ) : (
            <Fila
              label={`Reajuste (${contrato.reajusteType.toUpperCase()})`}
              value={caratula.reajusteAmount}
              warn={faltaIndice ? 'Falta el valor del índice: se está calculando sin reajuste.' : undefined}
            />
          )
        )}

        <Separador />

        {contrato.advancePercent > 0 && (
          <Fila
            label={`Amortización del anticipo (${contrato.advancePercent}%)`}
            value={-caratula.advanceAmortization}
          />
        )}
        {contrato.retentionPercent > 0 && (
          <Fila
            label={`Retención (${contrato.retentionPercent}%)`}
            value={-caratula.retentionAmount}
          />
        )}

        {editable ? (
          <FilaEditable
            label="Multa por atraso"
            hint={multaSugerida > 0
              ? `Según el contrato correspondería ${formatCLP(multaSugerida)}. La decide el mandante: escribe lo que efectivamente se descuenta.`
              : 'Sin atraso a la fecha de corte.'}
            value={multa}
            negativo
            onChange={(v) => onMulta?.(v)}
            accion={multaSugerida > 0 && onMulta
              ? { label: 'Usar sugerida', onClick: () => onMulta(multaSugerida) }
              : undefined}
          />
        ) : caratula.penaltyAmount > 0 && (
          <Fila label="Multa por atraso" value={-caratula.penaltyAmount} />
        )}

        {editable ? (
          <>
            <FilaEditable
              label="Otros descuentos"
              value={otros}
              negativo
              onChange={(v) => onOtros?.(v)}
            />
            {otros > 0 && (
              <div className="py-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  ¿Por qué se descuenta?
                </Label>
                <Input
                  className="mt-1"
                  value={otrosNota}
                  onChange={(e) => onOtrosNota?.(e.target.value)}
                  placeholder="Ej: consumo de energía a cargo del contratista"
                />
              </div>
            )}
          </>
        ) : caratula.otherDeductions > 0 && (
          <Fila label="Otros descuentos" value={-caratula.otherDeductions} />
        )}

        <Separador />

        <Fila label="Neto a facturar" value={caratula.netAmount} bold />
        <Fila label={`IVA (${contrato.taxPercent}%)`} value={caratula.taxAmount} />
        <Fila label="Total a pagar" value={caratula.totalAmount} destacado />

        <p className="pt-3 text-xs text-muted-foreground">
          Avance acumulado incluyendo este estado de pago: {formatCLP(caratula.accumulatedAmount)}.
        </p>
      </CardContent>
    </Card>
  );
}

function Separador() {
  return <div className="my-2 border-t border-border" />;
}

function Fila({
  label, value, bold, destacado, warn,
}: {
  label: string; value: number; bold?: boolean; destacado?: boolean; warn?: string;
}) {
  return (
    <div className="py-1">
      <div className="flex items-baseline justify-between gap-4">
        <span className={destacado || bold ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
          {label}
        </span>
        <span className={
          destacado ? 'text-lg font-bold text-foreground'
            : bold ? 'font-semibold text-foreground'
              : value < 0 ? 'text-danger' : 'text-foreground'
        }>
          {value < 0 ? `−${formatCLP(Math.abs(value))}` : formatCLP(value)}
        </span>
      </div>
      {warn && <p className="mt-0.5 text-xs text-warning">{warn}</p>}
    </div>
  );
}

function FilaEditable({
  label, hint, value, onChange, negativo, accion,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  negativo?: boolean;
  accion?: { label: string; onClick: () => void };
}) {
  return (
    <div className="py-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2">
          {accion && (
            <Button variant="ghost" size="sm" onClick={accion.onClick}>{accion.label}</Button>
          )}
          {negativo && value > 0 && <span className="text-danger">−</span>}
          <Input
            type="number"
            className="h-8 w-36 text-right"
            value={value || ''}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        </div>
      </div>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
