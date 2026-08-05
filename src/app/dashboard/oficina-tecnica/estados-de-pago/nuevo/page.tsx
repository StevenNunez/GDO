"use client";

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCLP } from '@/lib/format';
import { getLeafItems } from '@/lib/budget-costs';
import {
  calcLineas, calcCaratula, siguienteCorrelativo, cantidadesCobradas,
  cantidadDesdePorcentaje, porcentajeDesdeCantidad,
  type LineaEntrada,
} from '@/lib/payment-certificate';
import { acumuladosAnteriores } from '@/components/operations/eepp-utils';
import { calcFechaTermino, calcDiasAtraso, calcMulta, indiceALaFecha } from '@/lib/contract';
import { budgetIdsCobrables, impactoContrato } from '@/lib/amendment';
import { CaratulaEepp } from '@/components/operations/caratula-eepp';
import { toDate } from '@/lib/date-utils';

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

export default function NuevoEstadoDePagoPage() {
  const router = useRouter();
  const {
    contracts, paymentCertificates, paymentCertificateLines, workItems, marketIndices,
    supplierPayments, amendments, currentProjectId, can, notify, addPaymentCertificate,
  } = useAppState();

  const contrato = useMemo(
    () => contracts.find((c) => c.projectId === currentProjectId) ?? null,
    [contracts, currentProjectId],
  );

  const eeppsDelContrato = useMemo(
    () => (contrato ? paymentCertificates.filter((p) => p.contractId === contrato.id) : []),
    [paymentCertificates, contrato],
  );

  const acumulado = useMemo(() => acumuladosAnteriores(eeppsDelContrato), [eeppsDelContrato]);

  const esDelegada = contrato?.type === 'administracion_delegada';
  const esSumaAlzada = contrato?.type === 'suma_alzada';

  /** Cantidad ya cobrada por partida en los EEPP firmes. */
  const yaCobrado = useMemo(() => {
    const idsFirmes = new Map(eeppsDelContrato.map((e) => [e.id, e.status]));
    return cantidadesCobradas(
      paymentCertificateLines
        .filter((l) => idsFirmes.has(l.certificateId))
        .map((l) => ({
          certificateStatus: idsFirmes.get(l.certificateId)!,
          workItemId: l.workItemId,
          accumulatedQuantity: l.accumulatedQuantity,
        })),
    );
  }, [paymentCertificateLines, eeppsDelContrato]);

  const adicionalesDelContrato = useMemo(
    () => (contrato ? amendments.filter((a) => a.contractId === contrato.id) : []),
    [amendments, contrato],
  );

  /**
   * Cómo quedó el contrato después de los adicionales aprobados. El avance se
   * mide contra el monto vigente y la multa contra la fecha de término vigente:
   * usar los originales sería cobrar y castigar sobre un contrato que ya cambió.
   */
  const impacto = useMemo(
    () => (contrato ? impactoContrato(contrato, adicionalesDelContrato) : null),
    [contrato, adicionalesDelContrato],
  );

  /**
   * Partidas hoja que se pueden cobrar: las del presupuesto del contrato más
   * las de cada adicional APROBADO. Un adicional en trámite no entra.
   */
  const partidas = useMemo(() => {
    if (!contrato) return [];
    const cobrables = new Set(budgetIdsCobrables(contrato, adicionalesDelContrato));
    if (cobrables.size === 0) return [];
    const delPresupuesto = workItems.filter((w) => w.budgetId && cobrables.has(w.budgetId));
    return getLeafItems(delPresupuesto);
  }, [workItems, contrato, adicionalesDelContrato]);

  // Estado editable: cantidad acumulada declarada por partida.
  const [acumuladas, setAcumuladas] = useState<Record<string, number>>({});
  const [periodo, setPeriodo] = useState({ desde: primerDiaDelMes(), hasta: hoyISO() });
  const [realCost, setRealCost] = useState<number | null>(null);
  const [reajusteManual, setReajusteManual] = useState<number | null>(null);
  const [multa, setMulta] = useState(0);
  const [otros, setOtros] = useState(0);
  const [otrosNota, setOtrosNota] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);

  /**
   * Costo real del período, tomado de las facturas de proveedor de la obra cuya
   * fecha de emisión cae dentro del período (Fase 3). Antes esto se escribía a
   * mano; ahora es una sugerencia editable, porque puede haber costos que no
   * pasaron por una factura de proveedor (mano de obra propia, por ejemplo).
   */
  const costoRealSugerido = useMemo(() => {
    if (!esDelegada) return 0;
    const desde = new Date(periodo.desde).getTime();
    const hasta = new Date(periodo.hasta).getTime();
    return supplierPayments
      .filter((f) => f.projectId === currentProjectId)
      .filter((f) => {
        const t = toDate(f.issueDate)?.getTime();
        return t != null && t >= desde && t <= hasta;
      })
      .reduce((s, f) => s + (f.amount ?? 0), 0);
  }, [supplierPayments, currentProjectId, periodo, esDelegada]);

  /** Lo escrito a mano manda; si no hay nada escrito, se usa la sugerencia. */
  const costoRealEfectivo = realCost ?? costoRealSugerido;

  /** Avance físico registrado en la EDT, como punto de partida sugerido. */
  const cantidadSugerida = (workItemId: string, quantity: number, progress: number) => {
    const declarada = acumuladas[workItemId];
    if (declarada !== undefined) return declarada;
    return cantidadDesdePorcentaje(quantity, progress ?? 0);
  };

  const entradas: LineaEntrada[] = useMemo(() => partidas.map((p) => ({
    workItemId: p.id,
    name: p.name,
    unit: p.unit,
    quantityContract: p.quantity ?? 0,
    unitPrice: p.unitPrice ?? 0,
    previousQuantity: yaCobrado.get(p.id) ?? 0,
    accumulatedQuantity: cantidadSugerida(p.id, p.quantity ?? 0, p.progress ?? 0),
  })), [partidas, yaCobrado, acumuladas]);

  const lineas = useMemo(() => calcLineas(entradas, contrato?.type), [entradas, contrato]);

  const indiceBase = useMemo(() => {
    if (!contrato || contrato.reajusteType === 'none' || contrato.reajusteType === 'polinomico') return null;
    return indiceALaFecha(marketIndices, contrato.reajusteType as 'uf' | 'ipc', contrato.reajusteBaseDate);
  }, [marketIndices, contrato]);

  const indiceActual = useMemo(() => {
    if (!contrato || contrato.reajusteType === 'none' || contrato.reajusteType === 'polinomico') return null;
    return indiceALaFecha(marketIndices, contrato.reajusteType as 'uf' | 'ipc', periodo.hasta);
  }, [marketIndices, contrato, periodo.hasta]);

  const caratula = useMemo(() => {
    if (!contrato) return null;
    return calcCaratula({
      contract: contrato,
      lineas,
      previousAmount: acumulado.previousAmount,
      previousAmortization: acumulado.previousAmortization,
      previousRetention: acumulado.previousRetention,
      realCostAmount: costoRealEfectivo,
      montoVigente: impacto?.montoVigente,
      indiceBase,
      indiceActual,
      reajusteManual: contrato.reajusteType === 'polinomico' ? (reajusteManual ?? 0) : null,
      penaltyAmount: multa,
      otherDeductions: otros,
    });
  }, [contrato, lineas, acumulado, costoRealEfectivo, impacto, indiceBase, indiceActual, reajusteManual, multa, otros]);

  /** Multa que correspondería según el contrato. Sugerencia, no se aplica sola. */
  const multaSugerida = useMemo(() => {
    if (!contrato || !impacto) return 0;
    // Contra la fecha de término vigente y sobre el monto vigente: los días de
    // aumento aprobados ya no son atraso del contratista.
    const fin = calcFechaTermino(contrato.startDate, contrato.plazoDias, impacto.diasAumento);
    return calcMulta(contrato, calcDiasAtraso(fin, periodo.hasta), impacto.montoVigente);
  }, [contrato, impacto, periodo.hasta]);

  if (!can('payment_certificates:create')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Nuevo estado de pago" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No tienes permiso para preparar estados de pago.
        </CardContent></Card>
      </div>
    );
  }

  if (!contrato || !caratula) {
    return (
      <div className="space-y-6">
        <PageHeader title="Nuevo estado de pago" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Esta obra no tiene contrato cargado.
        </CardContent></Card>
      </div>
    );
  }

  const sinPartidas = !esDelegada && partidas.length === 0;

  const guardar = async () => {
    if (sinPartidas) {
      notify('El presupuesto del contrato no tiene partidas que cobrar.', 'destructive');
      return;
    }
    if (caratula.periodAmount <= 0 && caratula.feeAmount <= 0) {
      notify('No hay avance que cobrar en este período.', 'destructive');
      return;
    }

    setGuardando(true);
    try {
      const id = await addPaymentCertificate({
        certificate: {
          contractId: contrato.id,
          projectId: contrato.projectId,
          number: siguienteCorrelativo(eeppsDelContrato),
          periodStart: periodo.desde as any,
          periodEnd: periodo.hasta as any,
          status: 'borrador',
          contractType: contrato.type,
          retentionPercent: contrato.retentionPercent,
          advancePercent: contrato.advancePercent,
          taxPercent: contrato.taxPercent,
          realCostAmount: esDelegada ? costoRealEfectivo : 0,
          otherDeductionsNote: otrosNota || null,
          notes: notas || null,
          ...caratula,
        },
        lines: esDelegada ? [] : lineas.map((l, i) => ({
          workItemId: l.workItemId,
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
      router.push(`/dashboard/oficina-tecnica/estados-de-pago/${id}`);
    } catch (e: any) {
      notify(e.message ?? 'No se pudo crear el estado de pago.', 'destructive');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Estado de pago N° ${siguienteCorrelativo(eeppsDelContrato)}`}
        description={impacto && impacto.montoAdicionales !== 0
          ? `${contrato.name} · Monto vigente ${formatCLP(impacto.montoVigente)} (con adicionales aprobados)`
          : contrato.name}
        actions={
          <div className="flex gap-2">
            <Link href="/dashboard/oficina-tecnica/estados-de-pago">
              <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Volver</Button>
            </Link>
            <Button onClick={guardar} disabled={guardando || sinPartidas}>
              <Save className="mr-2 h-4 w-4" />
              {guardando ? 'Guardando…' : 'Crear borrador'}
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader><CardTitle className="text-base">Período</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Desde</Label>
            <Input type="date" value={periodo.desde}
              onChange={(e) => setPeriodo((p) => ({ ...p, desde: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Hasta</Label>
            <Input type="date" value={periodo.hasta}
              onChange={(e) => setPeriodo((p) => ({ ...p, hasta: e.target.value }))} />
          </div>
        </CardContent>
      </Card>

      {/* Detalle por partida, o costo real en administración delegada */}
      {esDelegada ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Costo real del período</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="max-w-xs space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Costo real ($)</Label>
                <Input
                  type="number"
                  value={realCost ?? costoRealSugerido ?? ''}
                  onChange={(e) => setRealCost(Number(e.target.value))}
                />
              </div>
              {realCost != null && realCost !== costoRealSugerido && (
                <Button variant="ghost" size="sm" onClick={() => setRealCost(null)}>
                  Volver a las facturas
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Se cobra el costo real más un honorario de {contrato.feePercent}%. La cifra sale de
              las facturas de proveedor de esta obra emitidas dentro del período
              ({formatCLP(costoRealSugerido)}); puedes ajustarla si hay costos que no pasaron por
              una factura, como mano de obra propia.
            </p>
          </CardContent>
        </Card>
      ) : sinPartidas ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          El presupuesto de este contrato no tiene partidas cargadas. Carga la EDT antes de emitir
          un estado de pago.
        </CardContent></Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Detalle por partida
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {esSumaAlzada
                  ? 'Se cobra el % de avance de cada partida.'
                  : 'Se cobra la cantidad realmente ejecutada.'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partida</TableHead>
                  <TableHead className="text-right">Contratado</TableHead>
                  <TableHead className="text-right">PU</TableHead>
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
                      {formatCLP(l.unitPrice)}
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
          </CardContent>
        </Card>
      )}

      {/* Carátula */}
      <CaratulaEepp
        contrato={contrato}
        caratula={caratula}
        editable
        multaSugerida={multaSugerida}
        multa={multa}
        onMulta={setMulta}
        otros={otros}
        onOtros={setOtros}
        otrosNota={otrosNota}
        onOtrosNota={setOtrosNota}
        reajusteManual={reajusteManual}
        onReajusteManual={setReajusteManual}
        faltaIndice={
          contrato.reajusteType !== 'none' && contrato.reajusteType !== 'polinomico'
          && (!indiceBase || !indiceActual)
        }
      />

      <Card>
        <CardHeader><CardTitle className="text-base">Observaciones</CardTitle></CardHeader>
        <CardContent>
          <Textarea rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </CardContent>
      </Card>
    </div>
  );
}
