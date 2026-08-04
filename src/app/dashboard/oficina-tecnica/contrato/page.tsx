"use client";

import { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Trash2, ShieldCheck } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCLP } from '@/lib/format';
import { formatDate } from '@/lib/date-utils';
import type { Contract, Guarantee } from '@/modules/core/lib/data';
import {
  calcFechaTermino, calcDiasAtraso, calcMulta, montoAnticipo,
  estadoGarantia, contractAmountClp, indiceALaFecha, type EstadoGarantia,
} from '@/lib/contract';

/* ── Etiquetas ────────────────────────────────────────────────────────── */

const TIPOS_CONTRATO: { value: Contract['type']; label: string; hint: string }[] = [
  { value: 'suma_alzada', label: 'Suma alzada', hint: 'Precio fijo. Se cobra por % de avance de cada partida.' },
  { value: 'precios_unitarios', label: 'Serie de precios unitarios', hint: 'Se cobra la cantidad realmente ejecutada × PU.' },
  { value: 'administracion_delegada', label: 'Administración delegada', hint: 'Se cobra el costo real más un honorario %.' },
];

const TIPOS_GARANTIA: Record<Guarantee['type'], string> = {
  fiel_cumplimiento: 'Fiel cumplimiento',
  anticipo: 'Anticipo',
  buena_ejecucion: 'Buena ejecución',
  seriedad_oferta: 'Seriedad de la oferta',
  otra: 'Otra',
};

const INSTRUMENTOS: Record<Guarantee['instrument'], string> = {
  boleta_bancaria: 'Boleta bancaria',
  poliza: 'Póliza',
  retencion: 'Retención',
  otro: 'Otro',
};

const ESTADO_GARANTIA: Record<EstadoGarantia, { label: string; tone: StatusTone }> = {
  vigente: { label: 'Vigente', tone: 'success' },
  'por-vencer': { label: 'Por vencer', tone: 'warning' },
  vencida: { label: 'Vencida', tone: 'danger' },
  devuelta: { label: 'Devuelta', tone: 'neutral' },
  cobrada: { label: 'Cobrada', tone: 'danger' },
  anulada: { label: 'Anulada', tone: 'neutral' },
};

const ESTADOS_CONTRATO: { value: Contract['status']; label: string }[] = [
  { value: 'draft', label: 'Borrador' },
  { value: 'active', label: 'Vigente' },
  { value: 'suspended', label: 'Suspendido' },
  { value: 'finished', label: 'Terminado' },
  { value: 'closed', label: 'Cerrado' },
];

/** Fecha en formato `YYYY-MM-DD` para un `<input type="date">`. */
function aInputDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const d = value as Date;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/* ── Página ───────────────────────────────────────────────────────────── */

export default function ContratoPage() {
  const {
    contracts, guarantees, marketIndices, budgets, projects, clients,
    currentProjectId, can, notify,
    addContract, updateContract, addGuarantee, updateGuarantee, deleteGuarantee,
  } = useAppState();

  const puedeEditar = can('contracts:manage');
  const puedeGarantias = can('guarantees:manage');

  const contrato = useMemo(
    () => contracts.find((c) => c.projectId === currentProjectId) ?? null,
    [contracts, currentProjectId],
  );

  const obra = projects.find((p) => p.id === currentProjectId) ?? null;
  const mandante = obra?.clientId ? clients.find((c) => c.id === obra.clientId) ?? null : null;
  const presupuestos = useMemo(
    () => budgets.filter((b) => b.projectId === currentProjectId && b.type === 'principal'),
    [budgets, currentProjectId],
  );

  const [form, setForm] = useState<Partial<Contract>>({});
  const [guardando, setGuardando] = useState(false);

  // La ficha se re-sincroniza cuando cambia el contrato de la obra activa.
  useEffect(() => {
    setForm(contrato ? { ...contrato } : {});
  }, [contrato]);

  const set = <K extends keyof Contract>(k: K, v: Contract[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const valorUf = indiceALaFecha(marketIndices, 'uf');
  const base = { ...contrato, ...form } as Contract;
  const fechaTermino = calcFechaTermino(base.startDate, base.plazoDias);
  const diasAtraso = calcDiasAtraso(fechaTermino, new Date());
  const montoClp = base.amountNet != null ? contractAmountClp(base, valorUf) : null;

  const garantiasContrato = useMemo(
    () => (contrato ? guarantees.filter((g) => g.contractId === contrato.id) : []),
    [guarantees, contrato],
  );

  if (!can('contracts:view')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Contrato" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No tienes permiso para ver el contrato de la obra.
        </CardContent></Card>
      </div>
    );
  }

  if (!currentProjectId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Contrato" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Selecciona una obra para ver o cargar su contrato.
        </CardContent></Card>
      </div>
    );
  }

  const guardar = async () => {
    if (!form.name?.trim()) { notify('Ponle un nombre al contrato.', 'destructive'); return; }
    if (!form.type) { notify('Elige el tipo de contrato.', 'destructive'); return; }

    setGuardando(true);
    try {
      const datos: Partial<Contract> = {
        ...form,
        projectId: currentProjectId,
        // Un campo de fecha vacío es "sin fecha", no la cadena vacía.
        signDate: form.signDate || null,
        startDate: form.startDate || null,
        reajusteBaseDate: form.reajusteBaseDate || null,
      };
      if (contrato) {
        await updateContract(contrato.id, datos);
        notify('Contrato actualizado.', 'success');
      } else {
        await addContract(datos);
        notify('Contrato creado.', 'success');
      }
    } catch (e: any) {
      notify(e.message ?? 'No se pudo guardar el contrato.', 'destructive');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contrato"
        description={
          <>
            {obra?.name ?? 'Obra'}
            {mandante ? ` · Mandante: ${mandante.name}` : ''}
          </>
        }
        actions={puedeEditar && (
          <Button onClick={guardar} disabled={guardando}>
            <Save className="mr-2 h-4 w-4" />
            {guardando ? 'Guardando…' : contrato ? 'Guardar cambios' : 'Crear contrato'}
          </Button>
        )}
      />

      {/* Resumen calculado */}
      {contrato && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Resumen label="Monto" value={montoClp !== null ? formatCLP(montoClp) : 'Falta el valor de la UF'} />
          <Resumen
            label="Anticipo"
            value={base.advancePercent > 0 ? formatCLP(montoAnticipo(base)) : 'Sin anticipo'}
          />
          <Resumen
            label="Término contractual"
            value={fechaTermino ? formatDate(fechaTermino) : 'Falta inicio o plazo'}
          />
          <Resumen
            label={diasAtraso > 0 ? `Multa a hoy (${diasAtraso} días)` : 'Estado del plazo'}
            value={diasAtraso > 0 ? formatCLP(calcMulta(base, diasAtraso)) : 'En plazo'}
            tone={diasAtraso > 0 ? 'danger' : 'success'}
          />
        </div>
      )}

      {/* ── Ficha ── */}
      <Card>
        <CardHeader><CardTitle className="text-base">Datos del contrato</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo label="Nombre" >
            <Input value={form.name ?? ''} disabled={!puedeEditar}
              onChange={(e) => set('name', e.target.value)} placeholder="Ej: Construcción Edificio Los Robles" />
          </Campo>

          <Campo label="N° / código">
            <Input value={form.code ?? ''} disabled={!puedeEditar}
              onChange={(e) => set('code', e.target.value)} />
          </Campo>

          <Campo label="Estado">
            <Select value={form.status ?? 'draft'} disabled={!puedeEditar}
              onValueChange={(v) => set('status', v as Contract['status'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ESTADOS_CONTRATO.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>

          <Campo
            label="Tipo de contrato"
            hint={TIPOS_CONTRATO.find((t) => t.value === form.type)?.hint}
          >
            <Select value={form.type ?? ''} disabled={!puedeEditar}
              onValueChange={(v) => set('type', v as Contract['type'])}>
              <SelectTrigger><SelectValue placeholder="Elegir…" /></SelectTrigger>
              <SelectContent>
                {TIPOS_CONTRATO.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>

          <Campo label="Presupuesto base" hint="El presupuesto que le sirve de línea base.">
            <Select
              value={form.budgetId ?? 'none'}
              disabled={!puedeEditar}
              onValueChange={(v) => set('budgetId', v === 'none' ? null : v)}
            >
              <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin asignar</SelectItem>
                {presupuestos.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>

          <Campo label="Moneda">
            <Select value={form.currency ?? 'CLP'} disabled={!puedeEditar}
              onValueChange={(v) => set('currency', v as Contract['currency'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CLP">Pesos (CLP)</SelectItem>
                <SelectItem value="UF">UF</SelectItem>
              </SelectContent>
            </Select>
          </Campo>

          <Campo
            label={`Monto neto ${form.currency === 'UF' ? '(UF)' : '($)'}`}
            hint={form.currency === 'UF' && !valorUf ? 'Aún no hay valor de UF cargado.' : undefined}
          >
            <Input type="number" value={form.amountNet ?? ''} disabled={!puedeEditar}
              onChange={(e) => set('amountNet', Number(e.target.value))} />
          </Campo>

          {form.type === 'administracion_delegada' && (
            <Campo label="Honorario (%)" hint="Sobre el costo real de la obra.">
              <Input type="number" value={form.feePercent ?? ''} disabled={!puedeEditar}
                onChange={(e) => set('feePercent', Number(e.target.value))} />
            </Campo>
          )}

          <Campo label="IVA (%)">
            <Input type="number" value={form.taxPercent ?? 19} disabled={!puedeEditar}
              onChange={(e) => set('taxPercent', Number(e.target.value))} />
          </Campo>
        </CardContent>
      </Card>

      {/* ── Plazo ── */}
      <Card>
        <CardHeader><CardTitle className="text-base">Plazo y multas</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo label="Fecha de firma">
            <Input type="date" value={aInputDate(form.signDate)} disabled={!puedeEditar}
              onChange={(e) => set('signDate', e.target.value as any)} />
          </Campo>
          <Campo label="Inicio de obra">
            <Input type="date" value={aInputDate(form.startDate)} disabled={!puedeEditar}
              onChange={(e) => set('startDate', e.target.value as any)} />
          </Campo>
          <Campo label="Plazo (días corridos)" hint="El día de inicio cuenta como día 1.">
            <Input type="number" value={form.plazoDias ?? ''} disabled={!puedeEditar}
              onChange={(e) => set('plazoDias', Number(e.target.value))} />
          </Campo>
          <Campo label="Término contractual">
            <Input value={fechaTermino ? formatDate(fechaTermino) : '—'} disabled readOnly />
          </Campo>

          <Campo label="Multa por atraso">
            <Select value={form.multaMode ?? 'permil_contrato'} disabled={!puedeEditar}
              onValueChange={(v) => set('multaMode', v as Contract['multaMode'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="permil_contrato">‰ del contrato por día</SelectItem>
                <SelectItem value="monto_fijo">Monto fijo por día</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          <Campo
            label={form.multaMode === 'monto_fijo' ? 'Monto diario ($)' : 'Por mil (‰) diario'}
            hint={form.multaMode === 'monto_fijo' ? undefined : 'Ej: 1 = 1‰ del contrato por día.'}
          >
            <Input type="number" value={form.multaValue ?? ''} disabled={!puedeEditar}
              onChange={(e) => set('multaValue', Number(e.target.value))} />
          </Campo>
        </CardContent>
      </Card>

      {/* ── Anticipo, retención y reajuste ── */}
      <Card>
        <CardHeader><CardTitle className="text-base">Anticipo, retención y reajuste</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo label="Anticipo (%)" hint="Se amortiza en proporción al avance cobrado.">
            <Input type="number" value={form.advancePercent ?? ''} disabled={!puedeEditar}
              onChange={(e) => set('advancePercent', Number(e.target.value))} />
          </Campo>
          <Campo label="Retención (%)">
            <Input type="number" value={form.retentionPercent ?? ''} disabled={!puedeEditar}
              onChange={(e) => set('retentionPercent', Number(e.target.value))} />
          </Campo>
          <Campo label="Tope de retención (% del contrato)" hint="Vacío = sin tope.">
            <Input type="number" value={form.retentionCapPercent ?? ''} disabled={!puedeEditar}
              onChange={(e) => set('retentionCapPercent',
                e.target.value === '' ? null : Number(e.target.value))} />
          </Campo>

          <Campo label="Reajuste">
            <Select value={form.reajusteType ?? 'none'} disabled={!puedeEditar}
              onValueChange={(v) => set('reajusteType', v as Contract['reajusteType'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin reajuste</SelectItem>
                <SelectItem value="ipc">IPC</SelectItem>
                <SelectItem value="uf">UF</SelectItem>
                <SelectItem value="polinomico">Polinómico (se ingresa a mano)</SelectItem>
              </SelectContent>
            </Select>
          </Campo>

          {form.reajusteType && form.reajusteType !== 'none' && (
            <Campo label="Fecha base del reajuste">
              <Input type="date" value={aInputDate(form.reajusteBaseDate)} disabled={!puedeEditar}
                onChange={(e) => set('reajusteBaseDate', e.target.value as any)} />
            </Campo>
          )}

          <div className="sm:col-span-2 lg:col-span-4">
            <Campo label="Observaciones">
              <Textarea rows={3} value={form.notes ?? ''} disabled={!puedeEditar}
                onChange={(e) => set('notes', e.target.value)} />
            </Campo>
          </div>
        </CardContent>
      </Card>

      {/* ── Garantías ── */}
      {contrato && (
        <GarantiasCard
          contractId={contrato.id}
          garantias={garantiasContrato}
          puedeEditar={puedeGarantias}
          onAdd={addGuarantee}
          onUpdate={updateGuarantee}
          onDelete={deleteGuarantee}
          notify={notify}
        />
      )}
      {!contrato && (
        <p className="text-sm text-muted-foreground">
          Guarda el contrato para poder registrar sus boletas de garantía.
        </p>
      )}
    </div>
  );
}

/* ── Piezas ───────────────────────────────────────────────────────────── */

function Campo({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Resumen({ label, value, tone }: { label: string; value: string; tone?: StatusTone }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        {tone
          ? <StatusBadge tone={tone} className="text-sm">{value}</StatusBadge>
          : <div className="text-lg font-bold text-foreground">{value}</div>}
      </CardContent>
    </Card>
  );
}

function GarantiasCard({
  contractId, garantias, puedeEditar, onAdd, onUpdate, onDelete, notify,
}: {
  contractId: string;
  garantias: Guarantee[];
  puedeEditar: boolean;
  onAdd: (d: Partial<Guarantee>) => Promise<void>;
  onUpdate: (id: string, d: Partial<Guarantee>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  notify: (m: string, v?: 'default' | 'destructive' | 'success') => void;
}) {
  const [nueva, setNueva] = useState<Partial<Guarantee>>({
    type: 'fiel_cumplimiento', instrument: 'boleta_bancaria', currency: 'CLP',
  });

  const agregar = async () => {
    try {
      await onAdd({ ...nueva, contractId });
      setNueva({ type: 'fiel_cumplimiento', instrument: 'boleta_bancaria', currency: 'CLP' });
      notify('Garantía registrada.', 'success');
    } catch (e: any) {
      notify(e.message ?? 'No se pudo registrar la garantía.', 'destructive');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" />
          Boletas de garantía
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {garantias.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay garantías registradas.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Instrumento</TableHead>
                  <TableHead>Banco / N°</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead>Estado</TableHead>
                  {puedeEditar && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {garantias.map((g) => {
                  const est = ESTADO_GARANTIA[estadoGarantia(g)];
                  return (
                    <TableRow key={g.id}>
                      <TableCell>{TIPOS_GARANTIA[g.type]}</TableCell>
                      <TableCell className="text-muted-foreground">{INSTRUMENTOS[g.instrument]}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {[g.bank, g.number].filter(Boolean).join(' · ') || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {g.currency === 'UF'
                          ? `${(g.amount ?? 0).toLocaleString('es-CL')} UF`
                          : formatCLP(g.amount)}
                      </TableCell>
                      <TableCell>{g.expiryDate ? formatDate(g.expiryDate) : '—'}</TableCell>
                      <TableCell><StatusBadge tone={est.tone}>{est.label}</StatusBadge></TableCell>
                      {puedeEditar && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {g.status === 'vigente' && (
                              <Button variant="ghost" size="sm"
                                onClick={() => onUpdate(g.id, { status: 'devuelta' })}>
                                Marcar devuelta
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => onDelete(g.id)}>
                              <Trash2 className="h-4 w-4 text-danger" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {puedeEditar && (
          <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-6">
            <Campo label="Tipo">
              <Select value={nueva.type} onValueChange={(v) => setNueva((n) => ({ ...n, type: v as Guarantee['type'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPOS_GARANTIA).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </Campo>
            <Campo label="Instrumento">
              <Select value={nueva.instrument} onValueChange={(v) => setNueva((n) => ({ ...n, instrument: v as Guarantee['instrument'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(INSTRUMENTOS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </Campo>
            <Campo label="Banco">
              <Input value={nueva.bank ?? ''} onChange={(e) => setNueva((n) => ({ ...n, bank: e.target.value }))} />
            </Campo>
            <Campo label="N° documento">
              <Input value={nueva.number ?? ''} onChange={(e) => setNueva((n) => ({ ...n, number: e.target.value }))} />
            </Campo>
            <Campo label="Monto">
              <Input type="number" value={nueva.amount ?? ''}
                onChange={(e) => setNueva((n) => ({ ...n, amount: Number(e.target.value) }))} />
            </Campo>
            <Campo label="Vencimiento">
              <Input type="date" value={aInputDate(nueva.expiryDate)}
                onChange={(e) => setNueva((n) => ({ ...n, expiryDate: e.target.value as any }))} />
            </Campo>
            <div className="lg:col-span-6">
              <Button variant="outline" onClick={agregar}>
                <Plus className="mr-2 h-4 w-4" /> Agregar garantía
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
