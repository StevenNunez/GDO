import { describe, expect, it } from 'vitest';
import type {
  PaymentOrder, Reception, Subcontract, SubcontractCertificate, Supplier,
} from '@/modules/core/lib/data';
import {
  datosDePago, estadoCierre, liquidacionFinal, ordenVigente, ordenesDe,
  puedeEmitirseOP, vencimientoSugerido,
} from './payment-order';

/* ── Fábricas ──────────────────────────────────────────────────────────── */

function eepp(over: Partial<SubcontractCertificate> = {}): SubcontractCertificate {
  return {
    id: 'cert-1', tenantId: 't1', subcontractId: 'sc-1', projectId: 'p1',
    number: 1, status: 'aprobado',
    retentionPercent: 5, advancePercent: 0, taxPercent: 19,
    periodAmount: 10_000_000, accumulatedAmount: 10_000_000,
    advanceAmortization: 0, retentionAmount: 500_000,
    penaltyAmount: 0, otherDeductions: 0,
    netAmount: 9_500_000, taxAmount: 1_805_000, totalAmount: 11_305_000,
    f30_1Date: new Date(2026, 7, 1),
    createdAt: new Date(2026, 7, 1),
    ...over,
  } as SubcontractCertificate;
}

function sub(over: Partial<Subcontract> = {}): Subcontract {
  return { requiresLaborCompliance: true, ...over } as Subcontract;
}

function orden(over: Partial<PaymentOrder> = {}): PaymentOrder {
  return {
    id: crypto.randomUUID(), tenantId: 't1', number: 1,
    certificateType: 'subcontract', certificateId: 'cert-1',
    supplierName: 'Contratista', amount: 11_305_000, currency: 'CLP',
    issueDate: new Date(2026, 7, 5), status: 'emitida',
    createdAt: new Date(2026, 7, 5),
    ...over,
  } as PaymentOrder;
}

function recepcion(over: Partial<Reception> = {}): Reception {
  return {
    id: 'r1', tenantId: 't1', projectId: 'p1', subcontractId: 'sc-1',
    type: 'definitiva', status: 'aceptada', retentionReleased: 500_000,
    createdAt: new Date(2026, 7, 1),
    ...over,
  } as Reception;
}

/* ── Emisión ───────────────────────────────────────────────────────────── */

describe('puedeEmitirseOP', () => {
  it('deja emitir un estado de pago aprobado con F30-1', () => {
    expect(puedeEmitirseOP(eepp(), sub()).puede).toBe(true);
  });

  it('no emite si el estado de pago está en borrador', () => {
    const r = puedeEmitirseOP(eepp({ status: 'borrador' }), sub());
    expect(r.puede).toBe(false);
    expect(r.motivo).toContain('aprobado');
  });

  it('no emite sin F30-1 cuando el subcontrato lo exige (Ley 20.123)', () => {
    const r = puedeEmitirseOP(eepp({ f30_1Date: null }), sub());
    expect(r.puede).toBe(false);
    expect(r.motivo).toContain('F30-1');
  });

  it('sí emite sin F30-1 si el subcontrato no lo exige', () => {
    expect(puedeEmitirseOP(
      eepp({ f30_1Date: null }), sub({ requiresLaborCompliance: false }),
    ).puede).toBe(true);
  });

  it('no emite si no hay monto que pagar', () => {
    expect(puedeEmitirseOP(eepp({ totalAmount: 0 }), sub()).motivo).toContain('monto');
  });

  it('no emite una segunda orden con una vigente', () => {
    const r = puedeEmitirseOP(eepp(), sub(), [orden()]);
    expect(r.puede).toBe(false);
    expect(r.motivo).toContain('Anúlala');
  });

  it('sí reemite si la anterior está anulada', () => {
    expect(puedeEmitirseOP(
      eepp(), sub(), [orden({ status: 'anulada', voidReason: 'Cuenta equivocada' })],
    ).puede).toBe(true);
  });

  it('deja emitir sobre uno ya pagado (para reponer el documento)', () => {
    expect(puedeEmitirseOP(eepp({ status: 'pagado' }), sub()).puede).toBe(true);
  });
});

describe('ordenesDe / ordenVigente', () => {
  const todas = [
    orden({ id: 'a', certificateId: 'cert-1', status: 'anulada', voidReason: 'x' }),
    orden({ id: 'b', certificateId: 'cert-1', status: 'emitida' }),
    orden({ id: 'c', certificateId: 'cert-2' }),
  ];

  it('filtra por estado de pago', () => {
    expect(ordenesDe(todas, 'subcontract', 'cert-1').map((o) => o.id)).toEqual(['a', 'b']);
  });

  it('la vigente es la que no está anulada', () => {
    expect(ordenVigente(todas, 'subcontract', 'cert-1')?.id).toBe('b');
  });

  it('devuelve null si todas están anuladas', () => {
    const anuladas = [orden({ status: 'anulada', voidReason: 'x' })];
    expect(ordenVigente(anuladas, 'subcontract', 'cert-1')).toBeNull();
  });

  it('no confunde el EEPP del mandante con el del subcontrato', () => {
    const mixtas = [orden({ id: 'z', certificateType: 'contract' })];
    expect(ordenVigente(mixtas, 'subcontract', 'cert-1')).toBeNull();
  });
});

describe('datosDePago', () => {
  const proveedor = {
    bank: 'Banco de Chile', accountType: 'Corriente',
    accountNumber: '123456789', email: 'pagos@contratista.cl',
  } as Supplier;

  it('trae los datos bancarios del contratista', () => {
    const r = datosDePago(proveedor);
    expect(r.bank).toBe('Banco de Chile');
    expect(r.faltantes).toEqual([]);
  });

  it('avisa qué falta para poder transferir', () => {
    const r = datosDePago({ bank: 'Banco', email: null } as unknown as Supplier);
    expect(r.faltantes).toContain('número de cuenta');
    expect(r.faltantes).toContain('correo');
  });

  it('sin ficha del contratista, todo falta', () => {
    expect(datosDePago(null).faltantes).toHaveLength(3);
  });
});

describe('vencimientoSugerido', () => {
  it('suma los días de pago pactados', () => {
    const r = vencimientoSugerido(new Date(2026, 7, 5), 30);
    expect(r?.getMonth()).toBe(8);
    expect(r?.getDate()).toBe(4);
  });

  it('lee el string YYYY-MM-DD sin correrse un día', () => {
    const r = vencimientoSugerido('2026-08-05', 10);
    expect(r?.getDate()).toBe(15);
    expect(r?.getMonth()).toBe(7);
  });
});

/* ── Cierre del contrato ───────────────────────────────────────────────── */

describe('estadoCierre', () => {
  const listo = {
    retencionPorDevolver: 0,
    recepciones: [recepcion()],
    adendasEnTramite: 0,
  };

  it('deja liquidar cuando no queda nada pendiente', () => {
    const r = estadoCierre([eepp({ status: 'pagado' })], listo);
    expect(r.puede).toBe(true);
    expect(r.pendientes).toEqual([]);
    expect(r.totalPagado).toBe(11_305_000);
  });

  it('no deja cerrar con estados de pago sin pagar', () => {
    const r = estadoCierre([eepp({ status: 'aprobado' })], listo);
    expect(r.puede).toBe(false);
    expect(r.pendientes.some((p) => p.includes('sin pagar'))).toBe(true);
    expect(r.eeppPendientes).toBe(1);
  });

  it('no deja cerrar con retención sin devolver', () => {
    const r = estadoCierre([eepp({ status: 'pagado' })], {
      ...listo, retencionPorDevolver: 500_000,
    });
    expect(r.pendientes.some((p) => p.includes('retención'))).toBe(true);
  });

  it('no deja cerrar sin recepción definitiva', () => {
    const r = estadoCierre([eepp({ status: 'pagado' })], { ...listo, recepciones: [] });
    expect(r.pendientes.some((p) => p.includes('recepción definitiva'))).toBe(true);
  });

  it('una recepción definitiva en borrador no cuenta', () => {
    const r = estadoCierre([eepp({ status: 'pagado' })], {
      ...listo, recepciones: [recepcion({ status: 'borrador' })],
    });
    expect(r.puede).toBe(false);
  });

  it('una recepción provisoria no reemplaza a la definitiva', () => {
    const r = estadoCierre([eepp({ status: 'pagado' })], {
      ...listo, recepciones: [recepcion({ type: 'provisoria' })],
    });
    expect(r.pendientes.some((p) => p.includes('definitiva'))).toBe(true);
  });

  it('no deja cerrar con adendas en trámite', () => {
    const r = estadoCierre([eepp({ status: 'pagado' })], { ...listo, adendasEnTramite: 1 });
    expect(r.pendientes.some((p) => p.includes('adenda'))).toBe(true);
  });

  it('los estados de pago rechazados no bloquean el cierre', () => {
    const r = estadoCierre(
      [eepp({ status: 'pagado' }), eepp({ id: 'x', status: 'rechazado' })], listo,
    );
    expect(r.puede).toBe(true);
  });

  it('suma solo lo efectivamente pagado', () => {
    const r = estadoCierre([
      eepp({ id: 'a', status: 'pagado', totalAmount: 5_000_000 }),
      eepp({ id: 'b', status: 'aprobado', totalAmount: 3_000_000 }),
    ], listo);
    expect(r.totalPagado).toBe(5_000_000);
  });
});

describe('liquidacionFinal', () => {
  it('compara lo pagado contra el monto vigente', () => {
    const r = liquidacionFinal(40_000_000, 43_000_000, 43_000_000);
    expect(r.diferencia).toBe(0);
    expect(r.diferenciaPct).toBe(0);
  });

  it('negativo cuando se pagó menos de lo contratado', () => {
    const r = liquidacionFinal(40_000_000, 40_000_000, 36_000_000);
    expect(r.diferencia).toBe(-4_000_000);
    expect(r.diferenciaPct).toBe(-10);
  });

  it('no divide por cero', () => {
    expect(liquidacionFinal(0, 0, 0).diferenciaPct).toBeNull();
  });
});
