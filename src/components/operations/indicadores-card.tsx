'use client';

import { useMemo, useState } from 'react';
import { RefreshCw, Pencil } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatDate } from '@/lib/date-utils';
import { toDate } from '@/lib/date-utils';
import type { MarketIndex } from '@/modules/core/lib/data';

const ETIQUETAS: Record<MarketIndex['type'], string> = {
  uf: 'UF',
  utm: 'UTM',
  ipc: 'IPC',
};

/** Formato del valor: la UF y la UTM son pesos; el IPC es una variación %. */
function formatValor(tipo: MarketIndex['type'], valor: number): string {
  if (tipo === 'ipc') return `${valor.toLocaleString('es-CL')} %`;
  return `$${valor.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function hoyISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * UF / UTM / IPC con sincronización desde mindicador.cl y **carga manual de
 * respaldo**: si la API externa no responde, un contrato en UF no puede quedar
 * bloqueado esperando a un servicio de terceros.
 */
export function IndicadoresCard() {
  const { marketIndices, syncMarketIndices, setMarketIndex, notify, can } = useAppState();

  const [sincronizando, setSincronizando] = useState(false);
  const [manualAbierto, setManualAbierto] = useState(false);
  const [manual, setManual] = useState<{ type: MarketIndex['type']; date: string; value: string }>({
    type: 'uf', date: hoyISO(), value: '',
  });

  const puedeEditar = can('contracts:manage');

  // Último valor conocido de cada indicador.
  const ultimos = useMemo(() => {
    const porTipo = new Map<MarketIndex['type'], MarketIndex>();
    for (const i of marketIndices) {
      const actual = porTipo.get(i.type);
      const ti = toDate(i.date)?.getTime() ?? 0;
      const ta = actual ? toDate(actual.date)?.getTime() ?? 0 : -1;
      if (ti > ta) porTipo.set(i.type, i);
    }
    return porTipo;
  }, [marketIndices]);

  const sincronizar = async () => {
    setSincronizando(true);
    try {
      const r = await syncMarketIndices();
      notify(`Indicadores actualizados desde ${r.origen}.`, 'success');
    } catch (e: any) {
      // El origen es un tercero: se ofrece la salida manual en vez de dejarlo trancado.
      notify(e.message ?? 'No se pudo sincronizar.', 'destructive');
      setManualAbierto(true);
    } finally {
      setSincronizando(false);
    }
  };

  const guardarManual = async () => {
    const valor = Number(manual.value);
    // El IPC es una variación porcentual y puede ser negativa (deflación); la
    // UF y la UTM son montos y siempre positivos.
    const valido = Number.isFinite(valor) && (manual.type === 'ipc' || valor > 0);
    if (manual.value.trim() === '' || !valido) {
      notify(
        manual.type === 'ipc'
          ? 'El IPC debe ser un número (puede ser negativo).'
          : 'El valor debe ser un número mayor que cero.',
        'destructive',
      );
      return;
    }
    try {
      await setMarketIndex({ type: manual.type, date: manual.date, value: valor });
      notify(`${ETIQUETAS[manual.type]} guardada.`, 'success');
      setManual((m) => ({ ...m, value: '' }));
      setManualAbierto(false);
    } catch (e: any) {
      notify(e.message ?? 'No se pudo guardar el valor.', 'destructive');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Indicadores</CardTitle>
        {puedeEditar && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={sincronizar} disabled={sincronizando}>
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${sincronizando ? 'animate-spin' : ''}`} />
              {sincronizando ? 'Actualizando…' : 'Actualizar'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setManualAbierto((v) => !v)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              A mano
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {(Object.keys(ETIQUETAS) as MarketIndex['type'][]).map((tipo) => {
            const dato = ultimos.get(tipo);
            return (
              <div key={tipo} className="space-y-0.5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {ETIQUETAS[tipo]}
                </div>
                <div className="text-lg font-bold text-foreground">
                  {dato ? formatValor(tipo, dato.value) : '—'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {dato ? formatDate(dato.date) : 'Sin datos cargados'}
                </div>
              </div>
            );
          })}
        </div>

        {puedeEditar && manualAbierto && (
          <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Indicador</Label>
              <Select
                value={manual.type}
                onValueChange={(v) => setManual((m) => ({ ...m, type: v as MarketIndex['type'] }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ETIQUETAS) as MarketIndex['type'][]).map((t) => (
                    <SelectItem key={t} value={t}>{ETIQUETAS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Fecha</Label>
              <Input type="date" value={manual.date}
                onChange={(e) => setManual((m) => ({ ...m, date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Valor</Label>
              <Input type="number" step="0.01" value={manual.value}
                placeholder={manual.type === 'ipc' ? 'Ej: 0.4' : 'Ej: 39250.12'}
                onChange={(e) => setManual((m) => ({ ...m, value: e.target.value }))} />
            </div>
            <div className="flex items-end">
              <Button onClick={guardarManual} className="w-full">Guardar</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
