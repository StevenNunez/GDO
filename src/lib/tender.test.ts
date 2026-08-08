import { describe, expect, it } from 'vitest';
import type {
  DocumentSignature, Subcontract, SubcontractQuote,
} from '@/modules/core/lib/data';
import {
  ahorroVsReferencia, cuadroComparativo, estadoFirmas, ofertaVencida,
  puedeFirmarse, validarAdjudicacion,
} from './tender';

/* ── Fábricas ──────────────────────────────────────────────────────────── */

function oferta(over: Partial<SubcontractQuote> = {}): SubcontractQuote {
  return {
    id: crypto.randomUUID(),
    tenantId: 't1',
    subcontractId: 'sc-1',
    supplierId: null,
    supplierName: 'Oferente',
    amountNet: 10_000_000,
    currency: 'CLP',
    plazoDias: 60,
    quoteDate: new Date(2026, 7, 1),
    validUntil: null,
    filePath: null,
    fileName: null,
    fileSize: null,
    notes: null,
    awarded: false,
    awardReason: null,
    createdBy: 'u1',
    createdAt: new Date(2026, 7, 1),
    ...over,
  };
}

function firma(over: Partial<DocumentSignature> = {}): DocumentSignature {
  return {
    id: crypto.randomUUID(),
    tenantId: 't1',
    documentType: 'subcontract',
    documentId: 'sc-1',
    party: 'empresa',
    signerName: 'Ana Soto',
    signerRut: '11.111.111-1',
    signerRole: 'Gerente',
    signedBy: 'u1',
    signature: null,
    documentHash: 'abc',
    signedAt: new Date(2026, 7, 5),
    createdAt: new Date(2026, 7, 5),
    ...over,
  };
}

const HOY = new Date(2026, 7, 7);

/* ── Cuadro comparativo ────────────────────────────────────────────────── */

describe('cuadroComparativo', () => {
  const tres = [
    oferta({ supplierName: 'Caro', amountNet: 14_000_000 }),
    oferta({ supplierName: 'Barato', amountNet: 10_000_000 }),
    oferta({ supplierName: 'Medio', amountNet: 12_000_000 }),
  ];

  it('ordena de menor a mayor y numera las posiciones', () => {
    const c = cuadroComparativo(tres, { moneda: 'CLP' });
    expect(c.lineas.map((l) => l.quote.supplierName)).toEqual(['Barato', 'Medio', 'Caro']);
    expect(c.lineas.map((l) => l.posicion)).toEqual([1, 2, 3]);
  });

  it('calcula la diferencia contra la más económica', () => {
    const c = cuadroComparativo(tres, { moneda: 'CLP' });
    expect(c.lineas[0].diferencia).toBe(0);
    expect(c.lineas[1].diferencia).toBe(2_000_000);
    expect(c.lineas[1].diferenciaPct).toBe(20);
  });

  it('entrega menor, mayor y promedio', () => {
    const c = cuadroComparativo(tres, { moneda: 'CLP' });
    expect(c.menor).toBe(10_000_000);
    expect(c.mayor).toBe(14_000_000);
    expect(c.promedio).toBe(12_000_000);
  });

  it('compara contra el presupuesto de referencia', () => {
    // Saber que hasta la más barata está sobre el presupuesto es tan
    // importante como saber cuál es la más barata.
    const c = cuadroComparativo(tres, { moneda: 'CLP', referencia: 9_000_000 });
    expect(c.lineas[0].vsReferencia).toBe(1_000_000);
  });

  it('sin referencia no inventa la comparación', () => {
    const c = cuadroComparativo(tres, { moneda: 'CLP' });
    expect(c.lineas[0].vsReferencia).toBeNull();
  });

  it('deja fuera las ofertas en otra moneda en vez de mezclarlas', () => {
    // Comparar UF con pesos sin el valor del día daría un ranking falso.
    const conUf = [...tres, oferta({ supplierName: 'En UF', amountNet: 300, currency: 'UF' })];
    const c = cuadroComparativo(conUf, { moneda: 'CLP' });
    expect(c.lineas).toHaveLength(3);
    expect(c.fueraDeMoneda.map((q) => q.supplierName)).toEqual(['En UF']);
  });

  it('ignora las ofertas sin monto', () => {
    const c = cuadroComparativo([...tres, oferta({ supplierName: 'Vacía', amountNet: 0 })], { moneda: 'CLP' });
    expect(c.lineas).toHaveLength(3);
  });

  it('no revienta sin ofertas', () => {
    const c = cuadroComparativo([], { moneda: 'CLP' });
    expect(c.lineas).toEqual([]);
    expect(c.menor).toBeNull();
    expect(c.promedio).toBeNull();
  });

  it('marca la adjudicada', () => {
    const conGanadora = [
      ...tres,
      oferta({ supplierName: 'Elegida', amountNet: 11_000_000, awarded: true, awardReason: 'Mejor plazo' }),
    ];
    expect(cuadroComparativo(conGanadora, { moneda: 'CLP' }).adjudicada?.supplierName)
      .toBe('Elegida');
  });

  it('marca las ofertas cuya validez venció', () => {
    const c = cuadroComparativo([
      oferta({ supplierName: 'Vigente', validUntil: new Date(2026, 8, 1) }),
      oferta({ supplierName: 'Vencida', amountNet: 9_000_000, validUntil: new Date(2026, 6, 1) }),
    ], { moneda: 'CLP', hoy: HOY });
    expect(c.lineas.find((l) => l.quote.supplierName === 'Vencida')?.vencida).toBe(true);
    expect(c.lineas.find((l) => l.quote.supplierName === 'Vigente')?.vencida).toBe(false);
  });

  it('empate: las dos son la más económica', () => {
    const c = cuadroComparativo([
      oferta({ supplierName: 'A', amountNet: 10_000_000 }),
      oferta({ supplierName: 'B', amountNet: 10_000_000 }),
    ], { moneda: 'CLP' });
    expect(c.lineas.every((l) => l.esLaMasEconomica)).toBe(true);
    expect(c.lineas.every((l) => l.diferencia === 0)).toBe(true);
  });
});

describe('ofertaVencida', () => {
  it('vale el último día completo', () => {
    expect(ofertaVencida({ validUntil: new Date(2026, 7, 7) }, HOY)).toBe(false);
  });

  it('vencida al día siguiente', () => {
    expect(ofertaVencida({ validUntil: new Date(2026, 7, 6) }, HOY)).toBe(true);
  });

  it('sin fecha de validez no se supone vencida', () => {
    expect(ofertaVencida({ validUntil: null }, HOY)).toBe(false);
  });

  it('lee el string YYYY-MM-DD de Supabase por sus dígitos', () => {
    expect(ofertaVencida({ validUntil: '2026-08-07' as unknown as Date }, HOY)).toBe(false);
    expect(ofertaVencida({ validUntil: '2026-08-06' as unknown as Date }, HOY)).toBe(true);
  });
});

/* ── Adjudicación ──────────────────────────────────────────────────────── */

describe('validarAdjudicacion', () => {
  const todas = [
    oferta({ supplierName: 'Barato', amountNet: 10_000_000 }),
    oferta({ supplierName: 'Caro', amountNet: 14_000_000 }),
  ];

  it('adjudicar la más económica no exige justificación', () => {
    expect(validarAdjudicacion(
      { amountNet: 10_000_000, currency: 'CLP', awardReason: null, validUntil: null },
      todas, HOY,
    )).toEqual([]);
  });

  it('adjudicar una más cara sin motivo se rechaza', () => {
    const e = validarAdjudicacion(
      { amountNet: 14_000_000, currency: 'CLP', awardReason: null, validUntil: null },
      todas, HOY,
    );
    expect(e.some((x) => x.includes('más económica'))).toBe(true);
  });

  it('con motivo escrito, se acepta', () => {
    expect(validarAdjudicacion(
      { amountNet: 14_000_000, currency: 'CLP', awardReason: 'Único con experiencia en altura', validUntil: null },
      todas, HOY,
    )).toEqual([]);
  });

  it('un motivo en blanco no cuenta como motivo', () => {
    const e = validarAdjudicacion(
      { amountNet: 14_000_000, currency: 'CLP', awardReason: '   ', validUntil: null },
      todas, HOY,
    );
    expect(e).toHaveLength(1);
  });

  it('no deja adjudicar una oferta vencida', () => {
    const e = validarAdjudicacion(
      { amountNet: 10_000_000, currency: 'CLP', awardReason: null, validUntil: new Date(2026, 6, 1) },
      todas, HOY,
    );
    expect(e.some((x) => x.includes('validez'))).toBe(true);
  });

  it('solo compara contra ofertas de la misma moneda', () => {
    const mixtas = [...todas, oferta({ amountNet: 100, currency: 'UF' })];
    // La de 100 UF no convierte a "la más barata en pesos".
    expect(validarAdjudicacion(
      { amountNet: 10_000_000, currency: 'CLP', awardReason: null, validUntil: null },
      mixtas, HOY,
    )).toEqual([]);
  });

  it('con una sola oferta, esa es la más económica', () => {
    expect(validarAdjudicacion(
      { amountNet: 10_000_000, currency: 'CLP', awardReason: null, validUntil: null },
      [todas[0]], HOY,
    )).toEqual([]);
  });
});

describe('ahorroVsReferencia', () => {
  it('negativo cuando se adjudicó bajo el presupuesto', () => {
    const r = ahorroVsReferencia({ amountNet: 9_000_000 }, 10_000_000);
    expect(r).toEqual({ monto: -1_000_000, pct: -10 });
  });

  it('positivo cuando se pasó', () => {
    expect(ahorroVsReferencia({ amountNet: 12_000_000 }, 10_000_000)?.pct).toBe(20);
  });

  it('null sin adjudicada o sin referencia', () => {
    expect(ahorroVsReferencia(null, 10_000_000)).toBeNull();
    expect(ahorroVsReferencia({ amountNet: 9_000_000 }, null)).toBeNull();
    expect(ahorroVsReferencia({ amountNet: 9_000_000 }, 0)).toBeNull();
  });
});

/* ── Firmas ────────────────────────────────────────────────────────────── */

describe('estadoFirmas', () => {
  it('completo cuando firmaron las dos partes', () => {
    const e = estadoFirmas(
      [firma({ party: 'empresa' }), firma({ party: 'contraparte', signedBy: null })],
      'subcontract', 'sc-1',
    );
    expect(e.completo).toBe(true);
    expect(e.faltan).toEqual([]);
  });

  it('dice cuál falta', () => {
    const e = estadoFirmas([firma({ party: 'empresa' })], 'subcontract', 'sc-1');
    expect(e.completo).toBe(false);
    expect(e.faltan).toEqual(['contraparte']);
  });

  it('no mezcla las firmas de otro documento', () => {
    const e = estadoFirmas(
      [firma({ party: 'empresa', documentId: 'otro' })],
      'subcontract', 'sc-1',
    );
    expect(e.empresa).toBeNull();
  });

  it('no mezcla firmas de otro tipo de documento con el mismo id', () => {
    const e = estadoFirmas(
      [firma({ party: 'empresa', documentType: 'reception' })],
      'subcontract', 'sc-1',
    );
    expect(e.empresa).toBeNull();
  });

  it('detecta que el contrato cambió después de firmado', () => {
    const e = estadoFirmas([firma({ documentHash: 'abc' })], 'subcontract', 'sc-1', 'xyz');
    expect(e.alterado).toBe(true);
  });

  it('no acusa cuando la huella calza', () => {
    expect(estadoFirmas([firma({ documentHash: 'abc' })], 'subcontract', 'sc-1', 'abc').alterado)
      .toBe(false);
  });

  it('no acusa a las firmas sin huella guardada', () => {
    expect(estadoFirmas([firma({ documentHash: null })], 'subcontract', 'sc-1', 'abc').alterado)
      .toBe(false);
  });
});

/* ── La puerta de la firma ─────────────────────────────────────────────── */

describe('puedeFirmarse', () => {
  const sub: Pick<Subcontract, 'amountNet' | 'plazoDias' | 'startDate'> = {
    amountNet: 20_000_000, plazoDias: 90, startDate: new Date(2026, 7, 1),
  };
  const ok = { tieneItemizado: true, aprobadoInternamente: true };

  it('deja firmar un contrato completo y aprobado', () => {
    expect(puedeFirmarse(sub, ok).puede).toBe(true);
  });

  it('no se firma antes de pasar la aprobación interna', () => {
    const r = puedeFirmarse(sub, { ...ok, aprobadoInternamente: false });
    expect(r.puede).toBe(false);
    expect(r.motivo).toContain('aprobación interna');
  });

  it('no se firma sin monto', () => {
    expect(puedeFirmarse({ ...sub, amountNet: 0 }, ok).motivo).toContain('monto');
  });

  it('no se firma sin itemizado: después no habría contra qué cubicar', () => {
    expect(puedeFirmarse(sub, { ...ok, tieneItemizado: false }).motivo).toContain('itemizado');
  });

  it('no se firma sin fecha de inicio', () => {
    expect(puedeFirmarse({ ...sub, startDate: null }, ok).motivo).toContain('inicio');
  });

  it('no se firma sin plazo: sin él no hay multa por atraso que calcular', () => {
    expect(puedeFirmarse({ ...sub, plazoDias: null }, ok).motivo).toContain('plazo');
  });
});
