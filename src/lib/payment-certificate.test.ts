import { describe, it, expect } from 'vitest';
import {
  calcLinea,
  calcLineas,
  calcCaratula,
  cantidadDesdePorcentaje,
  porcentajeDesdeCantidad,
  acumuladosAnteriores,
  cantidadesCobradas,
  siguienteCorrelativo,
  esFirme,
  type LineaEntrada,
} from './payment-certificate';
import type { Contract } from '@/modules/core/lib/data';

function contrato(over: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', tenantId: 't1', projectId: 'p1', budgetId: 'b1',
    name: 'Contrato', type: 'suma_alzada', currency: 'CLP',
    amountNet: 100_000_000, feePercent: 0,
    advancePercent: 0, retentionPercent: 0, retentionCapPercent: null,
    multaMode: 'permil_contrato', multaValue: 0,
    reajusteType: 'none', taxPercent: 19, status: 'active',
    createdAt: new Date(),
    ...over,
  } as Contract;
}

function linea(over: Partial<LineaEntrada> = {}): LineaEntrada {
  return {
    workItemId: 'w1', name: 'Hormigón', unit: 'm3',
    quantityContract: 100, unitPrice: 100_000,
    previousQuantity: 0, accumulatedQuantity: 0,
    ...over,
  };
}

/* ── Conversión % ↔ cantidad ──────────────────────────────────────────── */

describe('conversión porcentaje/cantidad', () => {
  it('convierte en ambos sentidos', () => {
    expect(cantidadDesdePorcentaje(100, 30)).toBe(30);
    expect(porcentajeDesdeCantidad(100, 30)).toBe(30);
  });

  it('no divide por cero cuando la partida no tiene cantidad', () => {
    expect(porcentajeDesdeCantidad(0, 5)).toBe(0);
  });
});

/* ── Línea ────────────────────────────────────────────────────────────── */

describe('calcLinea', () => {
  it('cobra la diferencia entre lo acumulado y lo ya cobrado', () => {
    // 100 m3 a $100.000. Ya se cobraron 30; ahora se declara 50 acumulado.
    const l = calcLinea(linea({ previousQuantity: 30, accumulatedQuantity: 50 }));
    expect(l.periodQuantity).toBe(20);
    expect(l.periodAmount).toBe(2_000_000);
    expect(l.previousAmount).toBe(3_000_000);
    expect(l.accumulatedAmount).toBe(5_000_000);
    expect(l.contractAmount).toBe(10_000_000);
    expect(l.accumulatedPercent).toBe(50);
  });

  it('el primer estado de pago cobra todo lo acumulado', () => {
    const l = calcLinea(linea({ accumulatedQuantity: 25 }));
    expect(l.periodQuantity).toBe(25);
    expect(l.periodAmount).toBe(2_500_000);
  });

  it('topa la cantidad acumulada a la contratada: no se cobra de más', () => {
    // Cubicar 120 sobre un contrato de 100 sería cobrar un adicional a escondidas.
    const l = calcLinea(linea({ accumulatedQuantity: 120 }));
    expect(l.accumulatedQuantity).toBe(100);
    expect(l.periodAmount).toBe(10_000_000);
    expect(l.accumulatedPercent).toBe(100);
  });

  it('una corrección a la baja no genera período negativo', () => {
    // Ya se cobraron 50 y ahora se declara 40: no se "descobra".
    const l = calcLinea(linea({ previousQuantity: 50, accumulatedQuantity: 40 }));
    expect(l.periodQuantity).toBe(0);
    expect(l.periodAmount).toBe(0);
  });

  it('sin avance nuevo el período es cero', () => {
    const l = calcLinea(linea({ previousQuantity: 40, accumulatedQuantity: 40 }));
    expect(l.periodAmount).toBe(0);
  });

  it('suma alzada: un 60% de avance cobra el 60% del valor de la partida', () => {
    const cant = cantidadDesdePorcentaje(100, 60);
    const l = calcLinea(linea({ accumulatedQuantity: cant }));
    expect(l.periodAmount).toBe(6_000_000);
    expect(l.accumulatedPercent).toBe(60);
  });

  it('calcLineas procesa varias partidas', () => {
    const ls = calcLineas([
      linea({ workItemId: 'a', accumulatedQuantity: 10 }),
      linea({ workItemId: 'b', accumulatedQuantity: 20 }),
    ]);
    expect(ls.reduce((s, l) => s + l.periodAmount, 0)).toBe(3_000_000);
  });
});

/* ── Carátula ─────────────────────────────────────────────────────────── */

describe('calcCaratula', () => {
  const lineas = calcLineas([linea({ accumulatedQuantity: 10 })]); // 1.000.000

  it('sin anticipo, retención ni reajuste: neto = avance, más IVA', () => {
    const c = calcCaratula({ contract: contrato(), lineas });
    expect(c.periodAmount).toBe(1_000_000);
    expect(c.netAmount).toBe(1_000_000);
    expect(c.taxAmount).toBe(190_000);
    expect(c.totalAmount).toBe(1_190_000);
  });

  it('descuenta el anticipo en proporción al avance', () => {
    // Anticipo 20% de 100M = 20M. Se cobra 1M = 1% => se amortiza 200.000.
    const c = calcCaratula({ contract: contrato({ advancePercent: 20 }), lineas });
    expect(c.advanceAmortization).toBe(200_000);
    expect(c.netAmount).toBe(800_000);
  });

  it('descuenta la retención pactada', () => {
    const c = calcCaratula({ contract: contrato({ retentionPercent: 10 }), lineas });
    expect(c.retentionAmount).toBe(100_000);
    expect(c.netAmount).toBe(900_000);
  });

  it('respeta el tope de retención usando lo ya retenido antes', () => {
    // Tope 5% de 100M = 5M; ya hay 4,95M retenidos => solo caben 50.000.
    const c = calcCaratula({
      contract: contrato({ retentionPercent: 10, retentionCapPercent: 5 }),
      lineas,
      previousRetention: 4_950_000,
    });
    expect(c.retentionAmount).toBe(50_000);
  });

  it('aplica el reajuste por índice sobre el avance del período', () => {
    const c = calcCaratula({
      contract: contrato({ reajusteType: 'ipc' }),
      lineas,
      indiceBase: 100,
      indiceActual: 105,
    });
    expect(c.reajusteAmount).toBeCloseTo(50_000, 6);
    expect(c.netAmount).toBeCloseTo(1_050_000, 6);
  });

  it('en contrato polinómico toma el reajuste ingresado a mano', () => {
    const c = calcCaratula({
      contract: contrato({ reajusteType: 'polinomico' }),
      lineas,
      reajusteManual: 33_000,
    });
    expect(c.reajusteAmount).toBe(33_000);
    expect(c.netAmount).toBe(1_033_000);
  });

  it('la multa solo entra si se ingresó: no se aplica sola', () => {
    // El contrato tiene multa pactada, pero la decide el mandante.
    const conMulta = contrato({ multaMode: 'permil_contrato', multaValue: 1 });
    expect(calcCaratula({ contract: conMulta, lineas }).penaltyAmount).toBe(0);
    expect(calcCaratula({ contract: conMulta, lineas, penaltyAmount: 120_000 }).netAmount)
      .toBe(880_000);
  });

  it('el neto nunca es negativo aunque los descuentos superen el avance', () => {
    const c = calcCaratula({ contract: contrato(), lineas, penaltyAmount: 5_000_000 });
    expect(c.netAmount).toBe(0);
    expect(c.taxAmount).toBe(0);
    expect(c.totalAmount).toBe(0);
  });

  it('cascada completa: avance, reajuste, anticipo, retención, multa e IVA', () => {
    const c = calcCaratula({
      contract: contrato({
        advancePercent: 20, retentionPercent: 5, reajusteType: 'ipc', taxPercent: 19,
      }),
      lineas,
      indiceBase: 100,
      indiceActual: 102,
      penaltyAmount: 10_000,
    });
    // avance 1.000.000 · reajuste 20.000 · anticipo 200.000 · retención 50.000 · multa 10.000
    expect(c.reajusteAmount).toBeCloseTo(20_000, 6);
    expect(c.advanceAmortization).toBe(200_000);
    expect(c.retentionAmount).toBe(50_000);
    expect(c.netAmount).toBeCloseTo(760_000, 6);
    expect(c.taxAmount).toBeCloseTo(144_400, 6);
    expect(c.totalAmount).toBeCloseTo(904_400, 6);
  });

  it('administración delegada: cobra el costo real más el honorario', () => {
    const c = calcCaratula({
      contract: contrato({ type: 'administracion_delegada', feePercent: 12 }),
      lineas: [],
      realCostAmount: 5_000_000,
    });
    expect(c.periodAmount).toBe(5_000_000);
    expect(c.feeAmount).toBe(600_000);
    expect(c.netAmount).toBe(5_600_000);
  });

  it('administración delegada acumula sobre lo cobrado antes', () => {
    const c = calcCaratula({
      contract: contrato({ type: 'administracion_delegada', feePercent: 10 }),
      lineas: [],
      realCostAmount: 2_000_000,
      previousAmount: 8_000_000,
    });
    expect(c.accumulatedAmount).toBe(10_000_000);
  });
});

/* ── Acumulados de EEPP anteriores ────────────────────────────────────── */

describe('acumuladosAnteriores', () => {
  const previos = [
    { status: 'aprobado', periodAmount: 1_000_000, advanceAmortization: 200_000, retentionAmount: 50_000 },
    { status: 'pagado', periodAmount: 2_000_000, advanceAmortization: 400_000, retentionAmount: 100_000 },
    // Estos NO deben contar.
    { status: 'borrador', periodAmount: 9_000_000, advanceAmortization: 9_000, retentionAmount: 9_000 },
    { status: 'rechazado', periodAmount: 5_000_000, advanceAmortization: 5_000, retentionAmount: 5_000 },
  ];

  it('suma solo los estados de pago firmes', () => {
    const a = acumuladosAnteriores(previos);
    expect(a.previousAmount).toBe(3_000_000);
    expect(a.previousAmortization).toBe(600_000);
    expect(a.previousRetention).toBe(150_000);
  });

  it('un borrador abierto no descuenta anticipo por adelantado', () => {
    // Si el borrador contara, dos borradores simultáneos se amortizarían
    // anticipo el uno al otro y el acumulado saldría inflado.
    expect(acumuladosAnteriores([previos[2]]).previousAmortization).toBe(0);
  });

  it('sin anteriores todo parte en cero', () => {
    const a = acumuladosAnteriores([]);
    expect(a).toEqual({ previousAmount: 0, previousAmortization: 0, previousRetention: 0 });
  });

  it('esFirme distingue los estados cobrables', () => {
    expect(esFirme('aprobado')).toBe(true);
    expect(esFirme('facturado')).toBe(true);
    expect(esFirme('pagado')).toBe(true);
    expect(esFirme('borrador')).toBe(false);
    expect(esFirme('presentado')).toBe(false);
    expect(esFirme('rechazado')).toBe(false);
  });
});

describe('cantidadesCobradas', () => {
  it('toma el mayor acumulado por partida, no la suma', () => {
    // Cada línea trae el acumulado A SU FECHA: sumarlas contaría dos veces.
    const m = cantidadesCobradas([
      { certificateStatus: 'aprobado', workItemId: 'w1', accumulatedQuantity: 30 },
      { certificateStatus: 'pagado', workItemId: 'w1', accumulatedQuantity: 50 },
    ]);
    expect(m.get('w1')).toBe(50);
  });

  it('ignora las líneas de estados de pago no firmes', () => {
    const m = cantidadesCobradas([
      { certificateStatus: 'aprobado', workItemId: 'w1', accumulatedQuantity: 30 },
      { certificateStatus: 'borrador', workItemId: 'w1', accumulatedQuantity: 90 },
    ]);
    expect(m.get('w1')).toBe(30);
  });

  it('ignora líneas cuya partida fue borrada', () => {
    const m = cantidadesCobradas([
      { certificateStatus: 'aprobado', workItemId: null, accumulatedQuantity: 10 },
    ]);
    expect(m.size).toBe(0);
  });
});

describe('siguienteCorrelativo', () => {
  it('parte en 1 cuando no hay ninguno', () => {
    expect(siguienteCorrelativo([])).toBe(1);
  });

  it('sigue al mayor, aunque falten números intermedios', () => {
    expect(siguienteCorrelativo([{ number: 1 }, { number: 3 }])).toBe(4);
  });
});
