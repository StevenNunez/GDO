import { describe, expect, it } from 'vitest';
import type {
  Contract, ContractorDocument, ContractorDocumentType, Guarantee,
  PaymentOrder, Subcontract,
} from '@/modules/core/lib/data';
import {
  agendaDelMes, agendaPorDia, agendaUrgente, claveDia, construirAgenda,
  grillaDelMes, resumenAgenda,
} from './agenda';

const HOY = new Date(2026, 7, 7); // viernes 7 de agosto de 2026

/* ── Fábricas ──────────────────────────────────────────────────────────── */

function contrato(over: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', tenantId: 't1', projectId: 'p1', budgetId: null,
    name: 'Edificio Cordillera', type: 'suma_alzada', currency: 'CLP',
    amountNet: 100_000_000, feePercent: 0,
    startDate: '2026-03-01' as unknown as Date, plazoDias: 180,
    advancePercent: 0, retentionPercent: 5, retentionCapPercent: null,
    multaMode: 'permil_contrato', multaValue: 1,
    reajusteType: 'none', taxPercent: 19, status: 'active',
    createdAt: new Date(2026, 2, 1),
    ...over,
  } as Contract;
}

function garantia(over: Partial<Guarantee> = {}): Guarantee {
  return {
    id: 'g1', tenantId: 't1', contractId: 'c1',
    type: 'fiel_cumplimiento', instrument: 'boleta_bancaria',
    bank: 'Banco de Chile', number: '123', amount: 5_000_000, currency: 'CLP',
    expiryDate: '2026-08-12' as unknown as Date, status: 'vigente',
    createdAt: new Date(2026, 2, 1),
    ...over,
  } as Guarantee;
}

function subcontrato(over: Partial<Subcontract> = {}): Subcontract {
  return {
    id: 'sc1', tenantId: 't1', projectId: 'p1',
    supplierId: 'sup1', supplierName: 'Montajes del Norte',
    name: 'Estructura metálica', type: 'suma_alzada', currency: 'CLP',
    amountNet: 40_000_000,
    startDate: '2026-06-01' as unknown as Date, plazoDias: 90,
    advancePercent: 0, retentionPercent: 5, retentionCapPercent: null,
    multaMode: 'permil_contrato', multaValue: 2, taxPercent: 19,
    requiresLaborCompliance: true, status: 'vigente',
    createdAt: new Date(2026, 5, 1),
    ...over,
  } as Subcontract;
}

function tipoDoc(over: Partial<ContractorDocumentType> = {}): ContractorDocumentType {
  return {
    id: 'ty-f301', tenantId: 't1', code: 'f30_1', name: 'F30-1',
    description: null, required: true, hasExpiry: true, warnDays: null,
    sortOrder: 10, active: true, createdAt: new Date(2026, 0, 1),
    ...over,
  };
}

function docContratista(over: Partial<ContractorDocument> = {}): ContractorDocument {
  return {
    id: 'd1', tenantId: 't1', supplierId: 'sup1', documentTypeId: 'ty-f301',
    number: null, issueDate: null, expiryDate: '2026-08-10' as unknown as Date,
    filePath: null, fileName: null, fileSize: null,
    status: 'aprobado', observations: null,
    reviewedBy: null, reviewedAt: null, uploadedBy: null,
    createdAt: new Date(2026, 6, 1),
    ...over,
  };
}

function orden(over: Partial<PaymentOrder> = {}): PaymentOrder {
  return {
    id: 'op1', tenantId: 't1', number: 1,
    certificateType: 'subcontract', certificateId: 'cert1', projectId: 'p1',
    supplierName: 'Montajes del Norte', amount: 10_000_000, currency: 'CLP',
    issueDate: new Date(2026, 7, 1), dueDate: '2026-08-20' as unknown as Date,
    status: 'emitida', createdAt: new Date(2026, 7, 1),
    ...over,
  } as PaymentOrder;
}

/* ── Construcción ──────────────────────────────────────────────────────── */

describe('construirAgenda', () => {
  it('saca el término del contrato de su fecha vigente', () => {
    // El día de inicio cuenta como día 1 del plazo (`calcFechaTermino`):
    // 1 de marzo + 180 días = 27 de agosto, no el 28.
    const e = construirAgenda({ contracts: [contrato()] }, { hoy: HOY });
    expect(e).toHaveLength(1);
    expect(e[0].tipo).toBe('contrato_termino');
    expect(e[0].fecha.getMonth()).toBe(7);
    expect(e[0].fecha.getDate()).toBe(27);
  });

  it('los adicionales aprobados corren la fecha del contrato', () => {
    const e = construirAgenda({
      contracts: [contrato()],
      amendments: [{
        id: 'a1', tenantId: 't1', contractId: 'c1', subcontractId: null,
        projectId: 'p1', budgetId: null, number: 1, name: 'Ampliación',
        type: 'aumento_plazo', cause: 'fuerza_mayor', amountNet: 0,
        currency: 'CLP', extraDays: 10, status: 'aprobado',
        createdAt: new Date(),
      } as any],
    }, { hoy: HOY });
    // 27 de agosto + 10 días aprobados = 6 de septiembre.
    expect(e[0].fecha.getMonth()).toBe(8);
    expect(e[0].fecha.getDate()).toBe(6);
    expect(e[0].detalle).toContain('+10 días');
  });

  it('no trae contratos cerrados ni terminados', () => {
    expect(construirAgenda({ contracts: [contrato({ status: 'closed' })] }, { hoy: HOY }))
      .toEqual([]);
  });

  it('trae las garantías vigentes con su urgencia', () => {
    const e = construirAgenda({ guarantees: [garantia()] }, { hoy: HOY });
    expect(e[0].tipo).toBe('garantia_vence');
    expect(e[0].dias).toBe(5);
    expect(e[0].urgencia).toBe('proximo');
  });

  it('ignora las garantías ya devueltas', () => {
    expect(construirAgenda({ guarantees: [garantia({ status: 'devuelta' })] }, { hoy: HOY }))
      .toEqual([]);
  });

  it('trae el término del subcontrato', () => {
    const e = construirAgenda({ subcontracts: [subcontrato()] }, { hoy: HOY });
    expect(e[0].tipo).toBe('subcontrato_termino');
    expect(e[0].href).toContain('sc1');
  });

  it('no trae subcontratos liquidados ni en borrador', () => {
    expect(construirAgenda({
      subcontracts: [subcontrato({ status: 'liquidado' }), subcontrato({ id: 'sc2', status: 'borrador' })],
    }, { hoy: HOY })).toEqual([]);
  });

  it('trae los documentos de contratista vencidos o por vencer', () => {
    const e = construirAgenda({
      contractorDocumentTypes: [tipoDoc()],
      contractorDocuments: [docContratista()],
      suppliers: [{ id: 'sup1', name: 'Montajes', categories: [], isContractor: true } as any],
    }, { hoy: HOY });
    expect(e[0].tipo).toBe('documento_contratista_vence');
    expect(e[0].titulo).toContain('Montajes');
    expect(e[0].detalle).toContain('Ley 20.123');
  });

  it('no trae documentos con vencimiento lejano', () => {
    const e = construirAgenda({
      contractorDocumentTypes: [tipoDoc()],
      contractorDocuments: [docContratista({ expiryDate: '2027-01-01' as unknown as Date })],
    }, { hoy: HOY });
    expect(e).toEqual([]);
  });

  it('trae las órdenes de pago sin pagar', () => {
    const e = construirAgenda({ paymentOrders: [orden()] }, { hoy: HOY });
    expect(e[0].tipo).toBe('orden_pago_vence');
    expect(e[0].dias).toBe(13);
  });

  it('no trae órdenes ya pagadas ni anuladas', () => {
    expect(construirAgenda({
      paymentOrders: [orden({ status: 'pagada' }), orden({ id: 'op2', status: 'anulada' })],
    }, { hoy: HOY })).toEqual([]);
  });

  it('calcula el fin de la garantía desde la recepción provisoria', () => {
    const e = construirAgenda({
      receptions: [{
        id: 'r1', tenantId: 't1', projectId: 'p1', subcontractId: 'sc1',
        type: 'provisoria', status: 'aceptada', retentionReleased: 0,
        receptionDate: '2026-07-01' as unknown as Date, warrantyDays: 60,
        createdAt: new Date(),
      } as any],
    }, { hoy: HOY });
    expect(e[0].tipo).toBe('garantia_obra_termina');
    expect(e[0].fecha.getMonth()).toBe(7); // 1 julio + 60 días = 30 de agosto
    expect(e[0].fecha.getDate()).toBe(30);
  });

  it('ordena de la fecha más antigua a la más nueva', () => {
    const e = construirAgenda({
      contracts: [contrato()],                                    // 28 ago
      guarantees: [garantia()],                                   // 12 ago
      paymentOrders: [orden()],                                   // 20 ago
    }, { hoy: HOY });
    expect(e.map((x) => x.tipo)).toEqual([
      'garantia_vence', 'orden_pago_vence', 'contrato_termino',
    ]);
  });

  it('acota por obra cuando se pide', () => {
    const e = construirAgenda({
      contracts: [contrato({ projectId: 'p1' }), contrato({ id: 'c2', projectId: 'p2' })],
    }, { hoy: HOY, projectId: 'p1' });
    expect(e).toHaveLength(1);
  });

  it('no acota los documentos de contratista por obra: un F30-1 vencido lo está para todas', () => {
    const e = construirAgenda({
      contractorDocumentTypes: [tipoDoc()],
      contractorDocuments: [docContratista()],
    }, { hoy: HOY, projectId: 'p1' });
    expect(e).toHaveLength(1);
  });

  it('ignora lo que no tiene fecha en vez de inventarla', () => {
    expect(construirAgenda({
      contracts: [contrato({ startDate: null })],
      guarantees: [garantia({ expiryDate: null })],
      paymentOrders: [orden({ dueDate: null })],
    }, { hoy: HOY })).toEqual([]);
  });

  it('los ids son estables entre recálculos', () => {
    const a = construirAgenda({ guarantees: [garantia()] }, { hoy: HOY });
    const b = construirAgenda({ guarantees: [garantia()] }, { hoy: HOY });
    expect(a[0].id).toBe(b[0].id);
  });
});

/* ── Urgencia ──────────────────────────────────────────────────────────── */

describe('urgencia', () => {
  it('marca vencido lo que ya pasó', () => {
    const e = construirAgenda({
      guarantees: [garantia({ expiryDate: '2026-08-01' as unknown as Date })],
    }, { hoy: HOY });
    expect(e[0].urgencia).toBe('vencido');
    expect(e[0].dias).toBe(-6);
  });

  it('marca «hoy» lo que vence hoy', () => {
    const e = construirAgenda({
      guarantees: [garantia({ expiryDate: '2026-08-07' as unknown as Date })],
    }, { hoy: HOY });
    expect(e[0].urgencia).toBe('hoy');
  });

  it('lo que vence pasado el horizonte queda como lejano', () => {
    const e = construirAgenda({
      guarantees: [garantia({ expiryDate: '2026-10-01' as unknown as Date })],
    }, { hoy: HOY });
    expect(e[0].urgencia).toBe('lejano');
  });
});

describe('agendaUrgente', () => {
  it('deja fuera lo lejano', () => {
    const e = construirAgenda({
      guarantees: [
        garantia({ id: 'g1', expiryDate: '2026-08-10' as unknown as Date }),
        garantia({ id: 'g2', expiryDate: '2026-12-10' as unknown as Date }),
      ],
    }, { hoy: HOY });
    expect(agendaUrgente(e)).toHaveLength(1);
  });
});

describe('resumenAgenda', () => {
  it('cuenta vencidos, de hoy y próximos', () => {
    const e = construirAgenda({
      guarantees: [
        garantia({ id: 'g1', expiryDate: '2026-08-01' as unknown as Date }),
        garantia({ id: 'g2', expiryDate: '2026-08-07' as unknown as Date }),
        garantia({ id: 'g3', expiryDate: '2026-08-12' as unknown as Date }),
        garantia({ id: 'g4', expiryDate: '2026-12-12' as unknown as Date }),
      ],
    }, { hoy: HOY });

    const r = resumenAgenda(e);
    expect(r).toMatchObject({ vencidos: 1, hoy: 1, proximos: 1, total: 4 });
    expect(r.porTipo[0]).toMatchObject({ tipo: 'garantia_vence', cantidad: 3 });
  });

  it('el resumen sale de la MISMA lista que el calendario', () => {
    // Si el tablero dijera «3» y el calendario mostrara 5, nadie confiaría en
    // ninguno de los dos.
    const e = construirAgenda({ contracts: [contrato()], guarantees: [garantia()] }, { hoy: HOY });
    expect(resumenAgenda(e).total).toBe(e.length);
  });
});

/* ── Vista de calendario ───────────────────────────────────────────────── */

describe('agendaPorDia', () => {
  it('agrupa por día calendario local', () => {
    const e = construirAgenda({
      guarantees: [
        garantia({ id: 'g1', expiryDate: '2026-08-12' as unknown as Date }),
        garantia({ id: 'g2', expiryDate: '2026-08-12' as unknown as Date }),
        garantia({ id: 'g3', expiryDate: '2026-08-13' as unknown as Date }),
      ],
    }, { hoy: HOY });

    const mapa = agendaPorDia(e);
    expect(mapa.get('2026-08-12')).toHaveLength(2);
    expect(mapa.get('2026-08-13')).toHaveLength(1);
  });

  it('la clave usa los campos locales, no un ISO cortado', () => {
    // Un `toISOString().slice(0,10)` en Chile pondría el evento en la casilla
    // del día anterior.
    expect(claveDia(new Date(2026, 7, 12))).toBe('2026-08-12');
  });
});

describe('agendaDelMes', () => {
  it('filtra por mes y año', () => {
    const e = construirAgenda({
      guarantees: [
        garantia({ id: 'g1', expiryDate: '2026-08-12' as unknown as Date }),
        garantia({ id: 'g2', expiryDate: '2026-09-12' as unknown as Date }),
      ],
    }, { hoy: HOY });
    expect(agendaDelMes(e, 2026, 7)).toHaveLength(1);
  });
});

describe('grillaDelMes', () => {
  it('empieza en lunes', () => {
    // Agosto de 2026 parte un sábado: la grilla debe abrir el lunes 27 de julio.
    const g = grillaDelMes(2026, 7);
    expect(g[0].getDay()).toBe(1);
    expect(g[0].getMonth()).toBe(6);
    expect(g[0].getDate()).toBe(27);
  });

  it('entrega semanas completas', () => {
    expect(grillaDelMes(2026, 7).length % 7).toBe(0);
  });

  it('cubre todos los días del mes', () => {
    const g = grillaDelMes(2026, 7);
    const delMes = g.filter((d) => d.getMonth() === 7);
    expect(delMes).toHaveLength(31);
  });

  it('no agrega una semana entera de sobra', () => {
    // Febrero de 2027 empieza lunes y tiene 28 días: cabe exacto en 4 semanas.
    expect(grillaDelMes(2027, 1)).toHaveLength(28);
  });
});
