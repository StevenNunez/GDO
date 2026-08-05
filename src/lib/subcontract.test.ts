import { describe, it, expect } from 'vitest';
import {
  esFirme,
  acumuladosSubcontrato,
  siguienteCorrelativo,
  montoItemizado,
  estadoCumplimiento,
  certificadoVigente,
  puedePagarse,
  saldoRetencion,
  resumenSubcontratos,
} from './subcontract';
import type {
  Reception, Subcontract, SubcontractCertificate, SubcontractItem,
} from '@/modules/core/lib/data';

function subcontrato(over: Partial<Subcontract> & { id: string }): Subcontract {
  return {
    tenantId: 't1', projectId: 'p1', name: 'Subcontrato', type: 'suma_alzada',
    currency: 'CLP', amountNet: 10_000_000,
    advancePercent: 0, retentionPercent: 5, retentionCapPercent: null,
    multaMode: 'permil_contrato', multaValue: 0, taxPercent: 19,
    requiresLaborCompliance: true, status: 'vigente', createdAt: new Date(),
    ...over,
  } as Subcontract;
}

function eepp(over: Partial<SubcontractCertificate> & { id: string }): SubcontractCertificate {
  return {
    tenantId: 't1', subcontractId: 's1', projectId: 'p1', number: 1,
    status: 'borrador', retentionPercent: 5, advancePercent: 0, taxPercent: 19,
    periodAmount: 0, accumulatedAmount: 0, advanceAmortization: 0,
    retentionAmount: 0, penaltyAmount: 0, otherDeductions: 0,
    netAmount: 0, taxAmount: 0, totalAmount: 0, createdAt: new Date(),
    ...over,
  } as SubcontractCertificate;
}

function item(over: Partial<SubcontractItem> & { id: string }): SubcontractItem {
  return {
    tenantId: 't1', subcontractId: 's1', name: 'Partida',
    quantity: 0, unitPrice: 0, sortOrder: 0, createdAt: new Date(),
    ...over,
  } as SubcontractItem;
}

function recepcion(over: Partial<Reception> & { id: string }): Reception {
  return {
    tenantId: 't1', projectId: 'p1', subcontractId: 's1', type: 'provisoria',
    status: 'aceptada', retentionReleased: 0, createdAt: new Date(),
    ...over,
  } as Reception;
}

/* ── Acumulados ───────────────────────────────────────────────────────── */

describe('acumulados del subcontrato', () => {
  it('un borrador no cuenta como cobrado', () => {
    expect(esFirme('borrador')).toBe(false);
    expect(esFirme('aprobado')).toBe(true);
    expect(esFirme('pagado')).toBe(true);
    expect(esFirme('rechazado')).toBe(false);
  });

  it('suma solo lo firme', () => {
    const acumulado = acumuladosSubcontrato([
      eepp({ id: '1', status: 'pagado', periodAmount: 1_000_000, advanceAmortization: 100_000, retentionAmount: 50_000 }),
      eepp({ id: '2', status: 'aprobado', periodAmount: 500_000, advanceAmortization: 50_000, retentionAmount: 25_000 }),
      eepp({ id: '3', status: 'borrador', periodAmount: 900_000, advanceAmortization: 90_000, retentionAmount: 45_000 }),
    ]);
    expect(acumulado.previousAmount).toBe(1_500_000);
    expect(acumulado.previousAmortization).toBe(150_000);
    expect(acumulado.previousRetention).toBe(75_000);
  });

  it('el correlativo sigue al mayor', () => {
    expect(siguienteCorrelativo([{ number: 1 }, { number: 4 }])).toBe(5);
    expect(siguienteCorrelativo([])).toBe(1);
  });
});

describe('montoItemizado', () => {
  it('suma cantidad por precio de cada partida', () => {
    expect(montoItemizado([
      item({ id: '1', quantity: 10, unitPrice: 1_000 }),
      item({ id: '2', quantity: 2.5, unitPrice: 4_000 }),
    ])).toBe(20_000);
  });

  it('un itemizado vacío vale cero', () => {
    expect(montoItemizado([])).toBe(0);
  });
});

/* ── Cumplimiento laboral ─────────────────────────────────────────────── */

describe('estadoCumplimiento', () => {
  const sub = subcontrato({ id: 's1' });

  it('con los dos certificados está ok', () => {
    const c = eepp({
      id: '1',
      f30Date: '2026-08-01' as unknown as Date,
      f30_1Date: '2026-08-01' as unknown as Date,
    });
    expect(estadoCumplimiento(c, sub)).toBe('ok');
  });

  it('sin F30-1 es lo que bloquea el pago', () => {
    expect(estadoCumplimiento(eepp({ id: '1' }), sub)).toBe('falta_f30_1');
  });

  it('con F30-1 pero sin F30 se informa, no bloquea', () => {
    const c = eepp({ id: '1', f30_1Date: '2026-08-01' as unknown as Date });
    expect(estadoCumplimiento(c, sub)).toBe('falta_f30');
  });

  it('un subcontrato que no lo exige queda fuera del control', () => {
    const sinExigencia = subcontrato({ id: 's2', requiresLaborCompliance: false });
    expect(estadoCumplimiento(eepp({ id: '1' }), sinExigencia)).toBe('no_exigido');
  });
});

describe('certificadoVigente', () => {
  it('un certificado del cierre del período o posterior sirve', () => {
    expect(certificadoVigente('2026-08-05', '2026-07-31')).toBe(true);
  });

  it('uno anterior al cierre no acredita ese período', () => {
    expect(certificadoVigente('2026-07-10', '2026-07-31')).toBe(false);
  });

  it('uno de hace meses está vencido', () => {
    // Más de 60 días después del período: ya no acredita.
    expect(certificadoVigente('2026-12-01', '2026-07-31')).toBe(false);
  });

  it('sin alguna de las dos fechas no se afirma que esté vigente', () => {
    expect(certificadoVigente(null, '2026-07-31')).toBeNull();
    expect(certificadoVigente('2026-08-05', null)).toBeNull();
  });
});

describe('puedePagarse', () => {
  const sub = subcontrato({ id: 's1' });

  it('un aprobado con F30-1 se puede pagar', () => {
    const c = eepp({ id: '1', status: 'aprobado', f30_1Date: '2026-08-01' as unknown as Date });
    expect(puedePagarse(c, sub).puede).toBe(true);
  });

  it('sin F30-1 no se paga y se explica por qué', () => {
    const r = puedePagarse(eepp({ id: '1', status: 'aprobado' }), sub);
    expect(r.puede).toBe(false);
    expect(r.motivo).toMatch(/F30-1/);
  });

  it('un borrador no se paga aunque tenga los certificados', () => {
    const c = eepp({ id: '1', status: 'borrador', f30_1Date: '2026-08-01' as unknown as Date });
    expect(puedePagarse(c, sub).puede).toBe(false);
  });

  it('si el subcontrato no exige cumplimiento, basta con estar aprobado', () => {
    const sinExigencia = subcontrato({ id: 's2', requiresLaborCompliance: false });
    expect(puedePagarse(eepp({ id: '1', status: 'aprobado' }), sinExigencia).puede).toBe(true);
  });
});

/* ── Retención ────────────────────────────────────────────────────────── */

describe('saldoRetencion', () => {
  it('es lo retenido menos lo devuelto en las recepciones', () => {
    const r = saldoRetencion(
      [
        eepp({ id: '1', status: 'pagado', retentionAmount: 300_000 }),
        eepp({ id: '2', status: 'aprobado', retentionAmount: 200_000 }),
      ],
      [recepcion({ id: 'r1', retentionReleased: 250_000 })],
    );
    expect(r.retenido).toBe(500_000);
    expect(r.devuelto).toBe(250_000);
    expect(r.saldo).toBe(250_000);
  });

  it('un borrador todavía no retiene nada', () => {
    const r = saldoRetencion([eepp({ id: '1', status: 'borrador', retentionAmount: 300_000 })], []);
    expect(r.retenido).toBe(0);
    expect(r.saldo).toBe(0);
  });

  it('devolver de más no deja saldo negativo', () => {
    const r = saldoRetencion(
      [eepp({ id: '1', status: 'pagado', retentionAmount: 100_000 })],
      [recepcion({ id: 'r1', retentionReleased: 150_000 })],
    );
    expect(r.saldo).toBe(0);
  });
});

/* ── Resumen ──────────────────────────────────────────────────────────── */

describe('resumenSubcontratos', () => {
  const subs = [
    subcontrato({ id: 's1', amountNet: 10_000_000 }),
    subcontrato({ id: 's2', amountNet: 5_000_000, status: 'terminado' }),
    subcontrato({ id: 's3', amountNet: 9_000_000, status: 'borrador' }),
  ];

  it('separa lo devengado de lo efectivamente pagado', () => {
    const r = resumenSubcontratos(subs, [
      eepp({ id: '1', subcontractId: 's1', status: 'pagado', periodAmount: 2_000_000, totalAmount: 2_200_000, retentionAmount: 100_000 }),
      eepp({ id: '2', subcontractId: 's1', status: 'aprobado', periodAmount: 1_000_000, totalAmount: 1_100_000, retentionAmount: 50_000 }),
    ]);
    expect(r.ejecutado).toBe(3_000_000);
    expect(r.pagado).toBe(2_200_000);
    expect(r.retenido).toBe(150_000);
  });

  it('el contratado no incluye los borradores de subcontrato', () => {
    expect(resumenSubcontratos(subs, []).contratado).toBe(15_000_000);
    expect(resumenSubcontratos(subs, []).vigentes).toBe(1);
  });

  it('cuenta los aprobados que no se pueden pagar por falta de F30-1', () => {
    const r = resumenSubcontratos(subs, [
      eepp({ id: '1', subcontractId: 's1', status: 'aprobado' }),
      eepp({ id: '2', subcontractId: 's1', status: 'aprobado', f30_1Date: '2026-08-01' as unknown as Date }),
    ]);
    expect(r.bloqueadosPorF30).toBe(1);
  });

  it('ignora estados de pago de subcontratos que no están en la lista', () => {
    const r = resumenSubcontratos(subs, [
      eepp({ id: '1', subcontractId: 'de-otra-obra', status: 'pagado', totalAmount: 999 }),
    ]);
    expect(r.pagado).toBe(0);
  });
});
