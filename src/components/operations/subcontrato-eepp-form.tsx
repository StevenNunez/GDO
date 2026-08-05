"use client";

import { useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCLP } from '@/lib/format';
import {
  calcLineas, calcCaratula, cantidadesCobradas, cantidadDesdePorcentaje,
  porcentajeDesdeCantidad, type LineaEntrada,
} from '@/lib/payment-certificate';
import { calcFechaTermino, calcDiasAtraso, calcMulta } from '@/lib/contract';
import { acumuladosSubcontrato, siguienteCorrelativo } from '@/lib/subcontract';
import type { Subcontract } from '@/modules/core/lib/data';

function hoyISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function primerDiaDelMes(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-01`;
}

/**
 * Preparación de un estado de pago de subcontrato: período, cubicación por
 * partida y carátula.
 *
 * Lo usan **las dos puntas**: la constructora desde la ficha del subcontrato y
 * el subcontratista desde su portal. Es el mismo documento, así que tiene que
 * ser el mismo formulario — dos copias terminarían calculando distinto justo
 * cuando hay que cobrar.
 *
 * La matemática no vive acá: sale de `payment-certificate.ts` y `contract.ts`,
 * los mismos módulos probados que usa el estado de pago al mandante.
 */
export function SubcontratoEeppForm({
  subcontract,
  /** La constructora puede descontar multas; el subcontratista no se las pone solo. */
  permiteMulta = true,
  onCreado,
}: {
  subcontract: Subcontract;
  permiteMulta?: boolean;
  onCreado?: (id: string) => void;
}) {
  const {
    subcontractItems, subcontractCertificates, subcontractCertificateLines,
    notify, addSubcontractCertificate,
  } = useAppState();

  const [periodo, setPeriodo] = useState({ desde: primerDiaDelMes(), hasta: hoyISO() });
  const [acumuladas, setAcumuladas] = useState<Record<string, number>>({});
  const [multa, setMulta] = useState(0);
  const [guardando, setGuardando] = useState(false);

  const items = useMemo(
    () => subcontractItems
      .filter((i) => i.subcontractId === subcontract.id)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    [subcontractItems, subcontract.id],
  );

  const eepps = useMemo(
    () => subcontractCertificates.filter((c) => c.subcontractId === subcontract.id),
    [subcontractCertificates, subcontract.id],
  );

  const acumulado = useMemo(() => acumuladosSubcontrato(eepps), [eepps]);

  /** Cantidad ya cobrada por partida en los estados de pago firmes. */
  const yaCobrado = useMemo(() => {
    const estados = new Map(eepps.map((e) => [e.id, e.status]));
    return cantidadesCobradas(
      subcontractCertificateLines
        .filter((l) => estados.has(l.certificateId))
        .map((l) => ({
          certificateStatus: estados.get(l.certificateId)!,
          workItemId: l.subcontractItemId ?? null,
          accumulatedQuantity: l.accumulatedQuantity,
        })),
    );
  }, [subcontractCertificateLines, eepps]);

  const entradas: LineaEntrada[] = useMemo(() => items.map((i) => ({
    workItemId: i.id,
    name: i.name,
    unit: i.unit,
    quantityContract: i.quantity ?? 0,
    unitPrice: i.unitPrice ?? 0,
    previousQuantity: yaCobrado.get(i.id) ?? 0,
    accumulatedQuantity: acumuladas[i.id] ?? (yaCobrado.get(i.id) ?? 0),
  })), [items, yaCobrado, acumuladas]);

  const lineas = useMemo(
    () => calcLineas(entradas, subcontract.type),
    [entradas, subcontract.type],
  );

  /**
   * Un subcontrato no tiene honorario ni reajuste por índice: van en cero para
   * no inventar columnas que después nadie llena.
   */
  const caratula = useMemo(() => calcCaratula({
    contract: {
      type: subcontract.type,
      amountNet: subcontract.amountNet,
      advancePercent: subcontract.advancePercent,
      retentionPercent: subcontract.retentionPercent,
      retentionCapPercent: subcontract.retentionCapPercent,
      taxPercent: subcontract.taxPercent,
      feePercent: 0,
      reajusteType: 'none',
    },
    lineas,
    previousAmount: acumulado.previousAmount,
    previousAmortization: acumulado.previousAmortization,
    previousRetention: acumulado.previousRetention,
    penaltyAmount: permiteMulta ? multa : 0,
  }), [subcontract, lineas, acumulado, multa, permiteMulta]);

  const multaSugerida = useMemo(() => {
    const fin = calcFechaTermino(subcontract.startDate, subcontract.plazoDias);
    return calcMulta(subcontract, calcDiasAtraso(fin, periodo.hasta));
  }, [subcontract, periodo.hasta]);

  const esSumaAlzada = subcontract.type === 'suma_alzada';

  const guardar = async () => {
    if (caratula.periodAmount <= 0) {
      notify('No hay avance que cobrar en este período.', 'destructive');
      return;
    }
    setGuardando(true);
    try {
      const id = await addSubcontractCertificate({
        certificate: {
          subcontractId: subcontract.id,
          projectId: subcontract.projectId,
          number: siguienteCorrelativo(eepps),
          periodStart: periodo.desde as never,
          periodEnd: periodo.hasta as never,
          status: 'borrador',
          retentionPercent: subcontract.retentionPercent,
          advancePercent: subcontract.advancePercent,
          taxPercent: subcontract.taxPercent,
          periodAmount: caratula.periodAmount,
          accumulatedAmount: caratula.accumulatedAmount,
          advanceAmortization: caratula.advanceAmortization,
          retentionAmount: caratula.retentionAmount,
          penaltyAmount: caratula.penaltyAmount,
          otherDeductions: caratula.otherDeductions,
          netAmount: caratula.netAmount,
          taxAmount: caratula.taxAmount,
          totalAmount: caratula.totalAmount,
        },
        lines: lineas.map((l, i) => ({
          subcontractItemId: l.workItemId,
          name: l.name,
          unit: l.unit ?? null,
          sortOrder: i,
          quantityContract: l.quantityContract,
          unitPrice: l.unitPrice,
          previousQuantity: l.previousQuantity,
          periodQuantity: l.periodQuantity,
          accumulatedQuantity: l.accumulatedQuantity,
          previousAmount: l.previousAmount,
          periodAmount: l.periodAmount,
          accumulatedAmount: l.accumulatedAmount,
        })),
      });
      notify('Estado de pago creado en borrador.', 'success');
      setAcumuladas({});
      setMulta(0);
      onCreado?.(id);
    } catch (e: any) {
      notify(e.message ?? 'No se pudo crear el estado de pago.', 'destructive');
    } finally {
      setGuardando(false);
    }
  };

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          El subcontrato todavía no tiene itemizado cargado: sin partidas no hay qué cubicar.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Estado de pago N° {siguienteCorrelativo(eepps)}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {esSumaAlzada
              ? 'Declara el % de avance acumulado de cada partida.'
              : 'Declara la cantidad realmente ejecutada.'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Desde</Label>
            <Input
              type="date" value={periodo.desde}
              onChange={(e) => setPeriodo((p) => ({ ...p, desde: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Hasta</Label>
            <Input
              type="date" value={periodo.hasta}
              onChange={(e) => setPeriodo((p) => ({ ...p, hasta: e.target.value }))}
            />
          </div>
          {permiteMulta && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Multa por atraso ($)</Label>
              <Input
                type="number" value={multa || ''}
                onChange={(e) => setMulta(Number(e.target.value))}
              />
              {multaSugerida > 0 && (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setMulta(multaSugerida)}
                >
                  Según contrato: {formatCLP(multaSugerida)}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partida</TableHead>
                <TableHead className="text-right">Contratado</TableHead>
                <TableHead className="text-right">Ya cobrado</TableHead>
                <TableHead className="text-right">
                  {esSumaAlzada ? 'Avance acum. (%)' : 'Cant. acumulada'}
                </TableHead>
                <TableHead className="text-right">Este período</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineas.map((l) => (
                <TableRow key={l.workItemId}>
                  <TableCell>
                    <div className="font-medium text-foreground">{l.name}</div>
                    <div className="text-xs text-muted-foreground">{l.unit}</div>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {l.quantityContract.toLocaleString('es-CL')}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {esSumaAlzada
                      ? `${porcentajeDesdeCantidad(l.quantityContract, l.previousQuantity).toFixed(1)}%`
                      : l.previousQuantity.toLocaleString('es-CL')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      className="ml-auto h-8 w-28 text-right"
                      value={esSumaAlzada
                        ? Number(l.accumulatedPercent.toFixed(2))
                        : l.accumulatedQuantity}
                      onChange={(ev) => {
                        const v = Number(ev.target.value);
                        setAcumuladas((a) => ({
                          ...a,
                          [l.workItemId]: esSumaAlzada
                            ? cantidadDesdePorcentaje(l.quantityContract, v)
                            : v,
                        }));
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCLP(l.periodAmount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="ml-auto max-w-sm space-y-1 text-sm">
          <Fila label="Avance del período" valor={caratula.periodAmount} />
          {caratula.advanceAmortization > 0 && (
            <Fila
              label={`Amortización anticipo (${subcontract.advancePercent}%)`}
              valor={-caratula.advanceAmortization}
            />
          )}
          {caratula.retentionAmount > 0 && (
            <Fila
              label={`Retención (${subcontract.retentionPercent}%)`}
              valor={-caratula.retentionAmount}
            />
          )}
          {caratula.penaltyAmount > 0 && (
            <Fila label="Multa por atraso" valor={-caratula.penaltyAmount} />
          )}
          <Fila label="Neto" valor={caratula.netAmount} fuerte />
          <Fila label={`IVA (${subcontract.taxPercent}%)`} valor={caratula.taxAmount} />
          <Fila label="Total" valor={caratula.totalAmount} fuerte />
        </div>

        <Button onClick={guardar} disabled={guardando}>
          <Save className="mr-2 h-4 w-4" />
          {guardando ? 'Guardando…' : 'Crear borrador'}
        </Button>
      </CardContent>
    </Card>
  );
}

function Fila({ label, valor, fuerte }: { label: string; valor: number; fuerte?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${
      fuerte ? 'font-semibold text-foreground' : 'text-muted-foreground'
    }`}>
      <span>{label}</span>
      <span>{valor < 0 ? `−${formatCLP(Math.abs(valor))}` : formatCLP(valor)}</span>
    </div>
  );
}
