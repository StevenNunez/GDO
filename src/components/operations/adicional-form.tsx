"use client";

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatCLP } from '@/lib/format';
import { TIPOS_ADICIONAL, CAUSAS_ADICIONAL } from '@/lib/amendment';
import type { AmendmentCause, AmendmentType } from '@/modules/core/lib/data';

/**
 * Lo editable de un adicional. Lo comparten la pantalla de creación y la de
 * detalle (mientras es borrador) para no tener dos formularios que se
 * desincronizan — misma regla que `SuppliersManager`.
 */
export interface AdicionalFormValues {
  name: string;
  type: AmendmentType;
  cause: AmendmentCause;
  description: string;
  budgetId: string | null;
  amountNet: number;
  extraDays: number;
  detectedAt: string;
  reference: string;
  notes: string;
}

export interface PresupuestoOpcion {
  id: string;
  name: string;
  /** Σ cantidad × PU de sus partidas hoja. */
  monto: number;
}

export function AdicionalForm({
  value,
  onChange,
  presupuestos,
}: {
  value: AdicionalFormValues;
  onChange: (patch: Partial<AdicionalFormValues>) => void;
  presupuestos: PresupuestoOpcion[];
}) {
  const soloPlazo = value.type === 'aumento_plazo';
  const presupuesto = presupuestos.find((p) => p.id === value.budgetId) ?? null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs font-medium text-muted-foreground">Nombre del adicional</Label>
          <Input
            value={value.name}
            placeholder="Ej: Refuerzo de fundaciones sector norte"
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Tipo</Label>
          <Select
            value={value.type}
            onValueChange={(v) => onChange({ type: v as AmendmentType })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(TIPOS_ADICIONAL).map(([k, label]) => (
                <SelectItem key={k} value={k}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Origen</Label>
          <Select
            value={value.cause}
            onValueChange={(v) => onChange({ cause: v as AmendmentCause })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(CAUSAS_ADICIONAL).map(([k, label]) => (
                <SelectItem key={k} value={k}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs font-medium text-muted-foreground">
            Descripción de la obra extraordinaria
          </Label>
          <Textarea
            rows={3}
            value={value.description}
            placeholder="Qué hay que ejecutar y por qué no estaba contratado."
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </div>
      </div>

      {/* Valorización */}
      {!soloPlazo && (
        <div className="space-y-4 rounded-xl border border-border bg-muted/40 p-4">
          <div className="text-sm font-semibold text-foreground">Valorización</div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Presupuesto que lo valoriza (opcional)
              </Label>
              <Select
                value={value.budgetId ?? 'ninguno'}
                onValueChange={(v) => onChange({ budgetId: v === 'ninguno' ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="Sin presupuesto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguno">Sin presupuesto (solo el monto)</SelectItem>
                  {presupuestos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {formatCLP(p.monto)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Si lo cotizaste por partidas, vincula acá su presupuesto: al aprobarse, esas
                partidas se pueden cobrar en los estados de pago siguientes.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {value.type === 'disminucion_obra' ? 'Monto a descontar ($)' : 'Monto neto ($)'}
              </Label>
              <Input
                type="number"
                value={value.amountNet}
                onChange={(e) => onChange({ amountNet: Math.abs(Number(e.target.value)) })}
              />
              {presupuesto && presupuesto.monto !== value.amountNet && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => onChange({ amountNet: presupuesto.monto })}
                >
                  Usar el total del presupuesto ({formatCLP(presupuesto.monto)})
                </Button>
              )}
              {value.type === 'disminucion_obra' && (
                <p className="text-xs text-muted-foreground">
                  Escríbelo en positivo: al ser una disminución se resta solo.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Aumento de plazo (días)</Label>
          <Input
            type="number"
            value={value.extraDays}
            onChange={(e) => onChange({ extraDays: Math.max(0, Number(e.target.value)) })}
          />
          <p className="text-xs text-muted-foreground">
            Corren la fecha de término y, con ella, el cálculo de las multas.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Fecha de detección</Label>
          <Input
            type="date"
            value={value.detectedAt}
            onChange={(e) => onChange({ detectedAt: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            Referencia del mandante
          </Label>
          <Input
            value={value.reference}
            placeholder="N° de orden de cambio o carta"
            onChange={(e) => onChange({ reference: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Observaciones</Label>
        <Textarea
          rows={2}
          value={value.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </div>
    </div>
  );
}

/** Valores de un adicional nuevo. */
export function valoresIniciales(): AdicionalFormValues {
  const hoy = new Date();
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd = String(hoy.getDate()).padStart(2, '0');
  return {
    name: '',
    type: 'obra_extraordinaria',
    cause: 'otra',
    description: '',
    budgetId: null,
    amountNet: 0,
    extraDays: 0,
    detectedAt: `${hoy.getFullYear()}-${mm}-${dd}`,
    reference: '',
    notes: '',
  };
}
