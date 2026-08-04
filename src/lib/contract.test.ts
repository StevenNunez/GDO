import { describe, it, expect } from 'vitest';
import {
  calcFechaTermino,
  calcDiasAtraso,
  calcMulta,
  calcReajuste,
  ufToClp,
  clpToUf,
  contractAmountClp,
  indiceALaFecha,
  estadoGarantia,
  garantiasPorVencer,
  montoContratoVigente,
  montoAnticipo,
  amortizacionAnticipo,
  montoRetencion,
} from './contract';
import type { Contract, Guarantee, MarketIndex } from '@/modules/core/lib/data';

/* ── Constructores mínimos ────────────────────────────────────────────── */

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

function garantia(over: Partial<Guarantee> & { id: string }): Guarantee {
  return {
    tenantId: 't1', contractId: 'c1', type: 'fiel_cumplimiento',
    instrument: 'boleta_bancaria', amount: 5_000_000, currency: 'CLP',
    status: 'vigente', createdAt: new Date(),
    ...over,
  } as Guarantee;
}

function indice(type: MarketIndex['type'], date: string, value: number): MarketIndex {
  return { id: `${type}-${date}`, type, date: new Date(date), value, createdAt: new Date() };
}

/* ── Plazo ────────────────────────────────────────────────────────────── */

/** Medianoche local del día indicado: como llega una fecha del selector. */
function dia(y: number, m: number, d: number) {
  return new Date(y, m - 1, d);
}

describe('calcFechaTermino', () => {
  it('cuenta el día de inicio como día 1 del plazo', () => {
    // Parte el 1 de marzo con 30 días => termina el 30, no el 31.
    expect(calcFechaTermino('2026-03-01', 30)).toEqual(dia(2026, 3, 30));
  });

  it('suma los aumentos de plazo aprobados', () => {
    expect(calcFechaTermino('2026-03-01', 30, 15)).toEqual(dia(2026, 4, 14));
  });

  it('acepta un Date del selector igual que un string de la base', () => {
    expect(calcFechaTermino(dia(2026, 3, 1), 30)).toEqual(calcFechaTermino('2026-03-01', 30));
  });

  it('un plazo que cruza el cambio de hora no se corre de día', () => {
    // Chile cambia de horario en abril y septiembre. Con aritmética de
    // milisegundos esto caía un día antes; por eso se opera por calendario.
    expect(calcFechaTermino('2026-03-15', 60)).toEqual(dia(2026, 5, 13));
    expect(calcFechaTermino('2026-08-20', 30)).toEqual(dia(2026, 9, 18));
  });

  it('cruza fin de mes y fin de año sin ayuda', () => {
    expect(calcFechaTermino('2026-12-20', 30)).toEqual(dia(2027, 1, 18));
  });

  it('devuelve null si falta la fecha de inicio o el plazo', () => {
    expect(calcFechaTermino(null, 30)).toBeNull();
    expect(calcFechaTermino('2026-03-01', null)).toBeNull();
  });
});

describe('calcDiasAtraso', () => {
  const termino = dia(2026, 3, 30);

  it('cuenta los días pasado el término', () => {
    expect(calcDiasAtraso(termino, '2026-04-04')).toBe(5);
  });

  it('no hay atraso el mismo día del término', () => {
    expect(calcDiasAtraso(termino, '2026-03-30')).toBe(0);
  });

  it('adelantarse no genera crédito: nunca es negativo', () => {
    expect(calcDiasAtraso(termino, '2026-03-20')).toBe(0);
  });

  it('cuenta bien aunque el atraso cruce el cambio de hora', () => {
    expect(calcDiasAtraso(dia(2026, 4, 1), '2026-04-10')).toBe(9);
  });

  it('acepta la salida de calcFechaTermino sin corromperla', () => {
    // Round-trip: lo que devuelve una función entra limpio en la otra.
    const fin = calcFechaTermino('2026-03-01', 30);
    expect(calcDiasAtraso(fin, '2026-04-05')).toBe(6);
  });

  it('sin fecha de término no se puede afirmar atraso', () => {
    expect(calcDiasAtraso(null, '2026-04-04')).toBe(0);
  });
});

/* ── Multas ───────────────────────────────────────────────────────────── */

describe('calcMulta', () => {
  it('permil: 1‰ diario sobre un contrato de 100 millones = 100.000 por día', () => {
    const c = contrato({ multaMode: 'permil_contrato', multaValue: 1 });
    expect(calcMulta(c, 10)).toBe(1_000_000);
  });

  it('monto fijo: se multiplica tal cual por los días', () => {
    const c = contrato({ multaMode: 'monto_fijo', multaValue: 50_000 });
    expect(calcMulta(c, 3)).toBe(150_000);
  });

  it('sin atraso no hay multa', () => {
    const c = contrato({ multaMode: 'permil_contrato', multaValue: 1 });
    expect(calcMulta(c, 0)).toBe(0);
    expect(calcMulta(c, -5)).toBe(0);
  });

  it('contrato sin multa pactada no multa aunque haya atraso', () => {
    expect(calcMulta(contrato({ multaValue: 0 }), 30)).toBe(0);
  });
});

/* ── Reajuste ─────────────────────────────────────────────────────────── */

describe('calcReajuste', () => {
  it('devuelve solo el diferencial, no el monto reajustado', () => {
    // IPC sube 5% => sobre 10.000.000 el reajuste es 500.000.
    expect(calcReajuste(10_000_000, 100, 105, 'ipc')).toBeCloseTo(500_000, 6);
  });

  it('un índice a la baja da reajuste negativo', () => {
    expect(calcReajuste(10_000_000, 100, 98, 'ipc')).toBeCloseTo(-200_000, 6);
  });

  it('contrato sin reajuste devuelve 0', () => {
    expect(calcReajuste(10_000_000, 100, 105, 'none')).toBe(0);
  });

  it('polinómico se ingresa a mano: no lo inventa', () => {
    expect(calcReajuste(10_000_000, 100, 105, 'polinomico')).toBe(0);
  });

  it('sin índice base válido no calcula', () => {
    expect(calcReajuste(10_000_000, 0, 105, 'ipc')).toBe(0);
    expect(calcReajuste(10_000_000, null, 105, 'ipc')).toBe(0);
    expect(calcReajuste(10_000_000, 100, undefined, 'ipc')).toBe(0);
  });
});

/* ── UF ───────────────────────────────────────────────────────────────── */

describe('conversión UF', () => {
  it('convierte en ambos sentidos', () => {
    expect(ufToClp(1000, 38_500)).toBe(38_500_000);
    expect(clpToUf(38_500_000, 38_500)).toBe(1000);
  });

  it('no divide por cero', () => {
    expect(clpToUf(38_500_000, 0)).toBe(0);
  });

  it('un contrato en CLP no necesita UF', () => {
    expect(contractAmountClp(contrato({ currency: 'CLP' }), null)).toBe(100_000_000);
  });

  it('un contrato en UF sin valor de UF devuelve null, no 0', () => {
    // Devolver 0 se vería en pantalla como "contrato sin monto".
    const c = contrato({ currency: 'UF', amountNet: 1000 });
    expect(contractAmountClp(c, null)).toBeNull();
    expect(contractAmountClp(c, 38_500)).toBe(38_500_000);
  });
});

describe('indiceALaFecha', () => {
  const indices = [
    indice('uf', '2026-03-01', 38_000),
    indice('uf', '2026-04-01', 38_500),
    indice('utm', '2026-04-01', 68_000),
  ];

  it('toma el último valor vigente a la fecha, no uno futuro', () => {
    expect(indiceALaFecha(indices, 'uf', '2026-03-15')).toBe(38_000);
  });

  it('sin fecha toma el más reciente', () => {
    expect(indiceALaFecha(indices, 'uf')).toBe(38_500);
  });

  it('no mezcla tipos de índice', () => {
    expect(indiceALaFecha(indices, 'utm', '2026-04-10')).toBe(68_000);
  });

  it('devuelve null si no hay valor anterior a la fecha', () => {
    expect(indiceALaFecha(indices, 'uf', '2026-01-01')).toBeNull();
    expect(indiceALaFecha([], 'ipc')).toBeNull();
  });
});

/* ── Garantías ────────────────────────────────────────────────────────── */

describe('estadoGarantia', () => {
  const hoy = '2026-08-03';

  it('vigente cuando falta bastante', () => {
    expect(estadoGarantia(garantia({ id: 'g', expiryDate: dia(2026, 12, 31) }), hoy))
      .toBe('vigente');
  });

  it('avisa 30 días antes', () => {
    expect(estadoGarantia(garantia({ id: 'g', expiryDate: dia(2026, 8, 20) }), hoy))
      .toBe('por-vencer');
  });

  it('vencida al día siguiente del vencimiento', () => {
    expect(estadoGarantia(garantia({ id: 'g', expiryDate: dia(2026, 8, 2) }), hoy))
      .toBe('vencida');
  });

  it('el día del vencimiento todavía está por vencer, no vencida', () => {
    expect(estadoGarantia(garantia({ id: 'g', expiryDate: dia(2026, 8, 3) }), hoy))
      .toBe('por-vencer');
  });

  it('una boleta devuelta está cerrada, no vencida, aunque pasó la fecha', () => {
    const g = garantia({ id: 'g', status: 'devuelta', expiryDate: dia(2026, 1, 1) });
    expect(estadoGarantia(g, hoy)).toBe('devuelta');
  });

  it('sin fecha de vencimiento no se puede afirmar que venció', () => {
    expect(estadoGarantia(garantia({ id: 'g', expiryDate: null }), hoy)).toBe('vigente');
  });
});

describe('garantiasPorVencer', () => {
  it('devuelve vencidas y por vencer, lo más urgente primero', () => {
    const gs = [
      garantia({ id: 'lejana', expiryDate: dia(2027, 1, 1) }),
      garantia({ id: 'por-vencer', expiryDate: dia(2026, 8, 25) }),
      garantia({ id: 'vencida', expiryDate: dia(2026, 6, 1) }),
      garantia({ id: 'devuelta', status: 'devuelta', expiryDate: dia(2026, 6, 1) }),
    ];
    expect(garantiasPorVencer(gs, '2026-08-03').map((g) => g.id))
      .toEqual(['vencida', 'por-vencer']);
  });
});

/* ── Monto vigente ────────────────────────────────────────────────────── */

describe('montoContratoVigente', () => {
  it('suma los adicionales aprobados', () => {
    expect(montoContratoVigente(contrato(), [5_000_000, 2_000_000])).toBe(107_000_000);
  });

  it('una disminución de obra viene en negativo y resta', () => {
    expect(montoContratoVigente(contrato(), [-3_000_000])).toBe(97_000_000);
  });

  it('sin adicionales es el monto original', () => {
    expect(montoContratoVigente(contrato())).toBe(100_000_000);
  });
});

/* ── Anticipo ─────────────────────────────────────────────────────────── */

describe('anticipo', () => {
  const c = contrato({ amountNet: 100_000_000, advancePercent: 20 });

  it('el monto del anticipo es el % del contrato', () => {
    expect(montoAnticipo(c)).toBe(20_000_000);
  });

  it('amortiza proporcional al avance: cobrar 10% devuelve 10% del anticipo', () => {
    expect(amortizacionAnticipo(c, 10_000_000)).toBe(2_000_000);
  });

  it('se topa al saldo pendiente: no devuelve más de lo entregado', () => {
    // Ya se amortizaron 19 millones; este período tocaría 2, pero solo queda 1.
    expect(amortizacionAnticipo(c, 10_000_000, 19_000_000)).toBe(1_000_000);
  });

  it('anticipo ya amortizado por completo no descuenta más', () => {
    expect(amortizacionAnticipo(c, 10_000_000, 20_000_000)).toBe(0);
  });

  it('contrato sin anticipo no amortiza nada', () => {
    expect(amortizacionAnticipo(contrato({ advancePercent: 0 }), 10_000_000)).toBe(0);
  });

  it('amortizar el total equivale al anticipo completo', () => {
    expect(amortizacionAnticipo(c, 100_000_000)).toBe(20_000_000);
  });
});

/* ── Retención ────────────────────────────────────────────────────────── */

describe('montoRetencion', () => {
  it('retiene el % pactado del avance del período', () => {
    const c = contrato({ retentionPercent: 10 });
    expect(montoRetencion(c, 10_000_000)).toBe(1_000_000);
  });

  it('respeta el tope acumulado del contrato', () => {
    // Tope 5% de 100M = 5M. Ya hay 4,5M retenidos: solo caben 0,5M más.
    const c = contrato({ retentionPercent: 10, retentionCapPercent: 5 });
    expect(montoRetencion(c, 10_000_000, 4_500_000)).toBe(500_000);
  });

  it('alcanzado el tope deja de retener', () => {
    const c = contrato({ retentionPercent: 10, retentionCapPercent: 5 });
    expect(montoRetencion(c, 10_000_000, 5_000_000)).toBe(0);
  });

  it('sin tope retiene siempre el porcentaje', () => {
    const c = contrato({ retentionPercent: 10, retentionCapPercent: null });
    expect(montoRetencion(c, 10_000_000, 50_000_000)).toBe(1_000_000);
  });

  it('contrato sin retención no retiene', () => {
    expect(montoRetencion(contrato({ retentionPercent: 0 }), 10_000_000)).toBe(0);
  });

  it('un avance negativo (corrección a la baja) no genera retención negativa', () => {
    const c = contrato({ retentionPercent: 10 });
    expect(montoRetencion(c, -1_000_000)).toBe(0);
  });
});
