import { describe, it, expect } from 'vitest';
import {
  esAprobado,
  enTramite,
  puedeEditar,
  siguientesEstados,
  montoConSigno,
  montosAprobados,
  diasAumentoAprobados,
  montoDesdePresupuesto,
  siguienteNumeroAdicional,
  resumenAdicionales,
  impactoContrato,
  budgetIdsCobrables,
} from './amendment';
import type { Amendment, Contract, WorkItem } from '@/modules/core/lib/data';

/* ── Constructores mínimos ────────────────────────────────────────────── */

function adicional(over: Partial<Amendment> & { id: string }): Amendment {
  return {
    tenantId: 't1', contractId: 'c1', projectId: 'p1', budgetId: null,
    number: 1, name: 'Adicional', type: 'obra_extraordinaria', cause: 'otra',
    amountNet: 0, currency: 'CLP', extraDays: 0, status: 'borrador',
    createdAt: new Date(),
    ...over,
  } as Amendment;
}

function contrato(over: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', tenantId: 't1', projectId: 'p1', budgetId: 'b-principal',
    name: 'Contrato', type: 'suma_alzada', currency: 'CLP',
    amountNet: 100_000_000, feePercent: 0,
    advancePercent: 0, retentionPercent: 0, retentionCapPercent: null,
    multaMode: 'permil_contrato', multaValue: 0,
    reajusteType: 'none', taxPercent: 19, status: 'active',
    startDate: '2026-03-01' as unknown as Date, plazoDias: 180,
    createdAt: new Date(),
    ...over,
  } as Contract;
}

function partida(over: Partial<WorkItem> & { id: string }): WorkItem {
  return {
    tenantId: 't1', projectId: 'p1', name: 'Partida', type: 'activity',
    status: 'in-progress', parentId: null, path: '01', progress: 0,
    unit: 'm2', quantity: 0, unitPrice: 0,
    ...over,
  } as WorkItem;
}

function dia(y: number, m: number, d: number) {
  return new Date(y, m - 1, d);
}

/* ── Estados ──────────────────────────────────────────────────────────── */

describe('estados del adicional', () => {
  it('solo el aprobado cuenta como parte del contrato', () => {
    expect(esAprobado(adicional({ id: 'a', status: 'aprobado' }))).toBe(true);
    expect(esAprobado(adicional({ id: 'a', status: 'presentado' }))).toBe(false);
    expect(esAprobado(adicional({ id: 'a', status: 'borrador' }))).toBe(false);
  });

  it('en trámite es solo lo presentado sin respuesta', () => {
    expect(enTramite(adicional({ id: 'a', status: 'presentado' }))).toBe(true);
    expect(enTramite(adicional({ id: 'a', status: 'aprobado' }))).toBe(false);
  });

  it('solo se edita el borrador', () => {
    expect(puedeEditar(adicional({ id: 'a', status: 'borrador' }))).toBe(true);
    expect(puedeEditar(adicional({ id: 'a', status: 'presentado' }))).toBe(false);
    expect(puedeEditar(adicional({ id: 'a', status: 'aprobado' }))).toBe(false);
  });

  it('el trámite avanza borrador → presentado → aprobado/rechazado', () => {
    expect(siguientesEstados('borrador')).toContain('presentado');
    expect(siguientesEstados('presentado')).toEqual(
      expect.arrayContaining(['aprobado', 'rechazado']),
    );
  });

  it('un rechazado vuelve a borrador para corregirlo', () => {
    expect(siguientesEstados('rechazado')).toContain('borrador');
  });

  it('la única salida de un aprobado es anularlo', () => {
    expect(siguientesEstados('aprobado')).toEqual(['anulado']);
  });

  it('un anulado ya no se mueve', () => {
    expect(siguientesEstados('anulado')).toEqual([]);
  });
});

/* ── Signo ────────────────────────────────────────────────────────────── */

describe('montoConSigno', () => {
  it('un aumento de obra suma', () => {
    expect(montoConSigno(adicional({ id: 'a', type: 'aumento_obra', amountNet: 5_000_000 })))
      .toBe(5_000_000);
  });

  it('una obra extraordinaria suma', () => {
    expect(montoConSigno(adicional({ id: 'a', type: 'obra_extraordinaria', amountNet: 2_000_000 })))
      .toBe(2_000_000);
  });

  it('una disminución resta aunque el monto se haya guardado positivo', () => {
    expect(montoConSigno(adicional({ id: 'a', type: 'disminucion_obra', amountNet: 3_000_000 })))
      .toBe(-3_000_000);
  });

  it('un monto cargado en negativo por error no invierte el tipo', () => {
    // El signo lo pone el tipo: un aumento sigue sumando, una disminución sigue restando.
    expect(montoConSigno(adicional({ id: 'a', type: 'aumento_obra', amountNet: -5_000_000 })))
      .toBe(5_000_000);
    expect(montoConSigno(adicional({ id: 'a', type: 'disminucion_obra', amountNet: -3_000_000 })))
      .toBe(-3_000_000);
  });

  it('un aumento de plazo puro no mueve plata', () => {
    expect(montoConSigno(adicional({ id: 'a', type: 'aumento_plazo', amountNet: 9_999 })))
      .toBe(0);
  });
});

/* ── Agregados ────────────────────────────────────────────────────────── */

describe('montosAprobados y diasAumentoAprobados', () => {
  const lista = [
    adicional({ id: 'a1', status: 'aprobado', type: 'aumento_obra', amountNet: 5_000_000, extraDays: 10 }),
    adicional({ id: 'a2', status: 'aprobado', type: 'disminucion_obra', amountNet: 1_000_000 }),
    adicional({ id: 'a3', status: 'presentado', type: 'aumento_obra', amountNet: 8_000_000, extraDays: 30 }),
    adicional({ id: 'a4', status: 'rechazado', type: 'aumento_obra', amountNet: 4_000_000, extraDays: 15 }),
    adicional({ id: 'a5', status: 'anulado', type: 'aumento_obra', amountNet: 7_000_000, extraDays: 20 }),
  ];

  it('solo suma los aprobados, con su signo', () => {
    expect(montosAprobados(lista)).toEqual([5_000_000, -1_000_000]);
  });

  it('los días de un adicional en trámite no corren el plazo', () => {
    expect(diasAumentoAprobados(lista)).toBe(10);
  });

  it('sin adicionales no hay ni monto ni días', () => {
    expect(montosAprobados([])).toEqual([]);
    expect(diasAumentoAprobados([])).toBe(0);
  });
});

describe('montoDesdePresupuesto', () => {
  it('suma solo las hojas: la fase no se cuenta dos veces', () => {
    const items = [
      partida({ id: 'fase', quantity: 1, unitPrice: 999_999 }),
      partida({ id: 'p1', parentId: 'fase', quantity: 10, unitPrice: 1_000 }),
      partida({ id: 'p2', parentId: 'fase', quantity: 5, unitPrice: 2_000 }),
    ];
    expect(montoDesdePresupuesto(items)).toBe(20_000);
  });

  it('un presupuesto vacío vale cero', () => {
    expect(montoDesdePresupuesto([])).toBe(0);
  });
});

describe('siguienteNumeroAdicional', () => {
  it('sigue al mayor correlativo, no a la cantidad', () => {
    expect(siguienteNumeroAdicional([{ number: 1 }, { number: 3 }])).toBe(4);
  });

  it('el primero es el N° 1', () => {
    expect(siguienteNumeroAdicional([])).toBe(1);
  });
});

/* ── Resumen ──────────────────────────────────────────────────────────── */

describe('resumenAdicionales', () => {
  const lista = [
    adicional({ id: 'a1', status: 'aprobado', type: 'aumento_obra', amountNet: 5_000_000, extraDays: 10 }),
    adicional({ id: 'a2', status: 'presentado', type: 'obra_extraordinaria', amountNet: 8_000_000, extraDays: 30 }),
    adicional({ id: 'a3', status: 'presentado', type: 'disminucion_obra', amountNet: 1_000_000 }),
    adicional({ id: 'a4', status: 'rechazado', type: 'aumento_obra', amountNet: 4_000_000, extraDays: 15 }),
  ];

  it('separa lo aprobado de lo que está en trámite', () => {
    const r = resumenAdicionales(lista);
    expect(r.aprobados).toBe(1);
    expect(r.enTramite).toBe(2);
    expect(r.montoAprobado).toBe(5_000_000);
    expect(r.montoEnTramite).toBe(7_000_000);
    expect(r.diasAprobados).toBe(10);
    expect(r.diasEnTramite).toBe(30);
  });

  it('rechazados y anulados no son ni contrato ni expectativa', () => {
    const r = resumenAdicionales([
      adicional({ id: 'a1', status: 'rechazado', type: 'aumento_obra', amountNet: 4_000_000 }),
      adicional({ id: 'a2', status: 'anulado', type: 'aumento_obra', amountNet: 6_000_000 }),
    ]);
    expect(r.montoAprobado).toBe(0);
    expect(r.montoEnTramite).toBe(0);
  });
});

/* ── Impacto en el contrato ───────────────────────────────────────────── */

describe('impactoContrato', () => {
  it('el monto vigente es el original más los adicionales aprobados', () => {
    const i = impactoContrato(contrato(), [
      adicional({ id: 'a1', status: 'aprobado', type: 'aumento_obra', amountNet: 10_000_000 }),
      adicional({ id: 'a2', status: 'aprobado', type: 'disminucion_obra', amountNet: 2_000_000 }),
      adicional({ id: 'a3', status: 'presentado', type: 'aumento_obra', amountNet: 50_000_000 }),
    ]);
    expect(i.montoOriginal).toBe(100_000_000);
    expect(i.montoAdicionales).toBe(8_000_000);
    expect(i.montoVigente).toBe(108_000_000);
    expect(i.variacionPercent).toBeCloseTo(8, 6);
    // Lo presentado se informa aparte: todavía no es contrato.
    expect(i.montoEnTramite).toBe(50_000_000);
  });

  it('los días aprobados corren la fecha de término', () => {
    const i = impactoContrato(
      contrato({ startDate: '2026-03-01' as unknown as Date, plazoDias: 30 }),
      [adicional({ id: 'a1', status: 'aprobado', type: 'aumento_plazo', extraDays: 15 })],
    );
    expect(i.fechaTerminoOriginal).toEqual(dia(2026, 3, 30));
    expect(i.fechaTerminoVigente).toEqual(dia(2026, 4, 14));
    expect(i.plazoVigente).toBe(45);
  });

  it('sin adicionales, vigente y original son lo mismo', () => {
    const i = impactoContrato(contrato({ plazoDias: 30 }), []);
    expect(i.montoVigente).toBe(i.montoOriginal);
    expect(i.plazoVigente).toBe(30);
    expect(i.fechaTerminoVigente).toEqual(i.fechaTerminoOriginal);
    expect(i.variacionPercent).toBe(0);
  });

  it('un contrato sin monto no reporta variación en vez de dividir por cero', () => {
    const i = impactoContrato(contrato({ amountNet: 0 }), [
      adicional({ id: 'a1', status: 'aprobado', type: 'aumento_obra', amountNet: 1_000_000 }),
    ]);
    expect(i.variacionPercent).toBeNull();
    expect(i.montoVigente).toBe(1_000_000);
  });

  it('un contrato sin plazo no inventa uno vigente', () => {
    const i = impactoContrato(contrato({ plazoDias: null }), [
      adicional({ id: 'a1', status: 'aprobado', type: 'aumento_plazo', extraDays: 10 }),
    ]);
    expect(i.plazoVigente).toBeNull();
    expect(i.fechaTerminoVigente).toBeNull();
    // El aumento igual queda registrado.
    expect(i.diasAumento).toBe(10);
  });
});

/* ── Partidas cobrables ───────────────────────────────────────────────── */

describe('budgetIdsCobrables', () => {
  it('suma el presupuesto del contrato y el de cada adicional aprobado', () => {
    const ids = budgetIdsCobrables(contrato(), [
      adicional({ id: 'a1', status: 'aprobado', budgetId: 'b-ad1' }),
      adicional({ id: 'a2', status: 'aprobado', budgetId: 'b-ad2' }),
    ]);
    expect(ids).toEqual(['b-principal', 'b-ad1', 'b-ad2']);
  });

  it('no deja cobrar lo que el mandante todavía no aprueba', () => {
    const ids = budgetIdsCobrables(contrato(), [
      adicional({ id: 'a1', status: 'presentado', budgetId: 'b-ad1' }),
      adicional({ id: 'a2', status: 'rechazado', budgetId: 'b-ad2' }),
      adicional({ id: 'a3', status: 'anulado', budgetId: 'b-ad3' }),
    ]);
    expect(ids).toEqual(['b-principal']);
  });

  it('un adicional aprobado sin presupuesto no aporta partidas', () => {
    const ids = budgetIdsCobrables(contrato(), [
      adicional({ id: 'a1', status: 'aprobado', budgetId: null, amountNet: 5_000_000 }),
    ]);
    expect(ids).toEqual(['b-principal']);
  });

  it('un contrato sin presupuesto solo cobra los adicionales aprobados', () => {
    const ids = budgetIdsCobrables(contrato({ budgetId: null }), [
      adicional({ id: 'a1', status: 'aprobado', budgetId: 'b-ad1' }),
    ]);
    expect(ids).toEqual(['b-ad1']);
  });
});
