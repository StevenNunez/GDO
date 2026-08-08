import { describe, expect, it } from 'vitest';
import type {
  ContractorDocument, ContractorDocumentType,
} from '@/modules/core/lib/data';
import {
  diasParaVencer, estadoDocumento, expedienteDe, puedeContratarse,
  resumenContratistas, vencimientosProximos,
} from './contractor-file';

/* ── Fábricas ──────────────────────────────────────────────────────────── */

function tipo(over: Partial<ContractorDocumentType> = {}): ContractorDocumentType {
  return {
    id: 'ty-1',
    tenantId: 't1',
    code: 'f30_1',
    name: 'F30-1',
    description: null,
    required: true,
    hasExpiry: true,
    warnDays: null,
    sortOrder: 0,
    active: true,
    createdAt: new Date(2026, 0, 1),
    ...over,
  };
}

function doc(over: Partial<ContractorDocument> = {}): ContractorDocument {
  return {
    id: 'd-1',
    tenantId: 't1',
    supplierId: 's-1',
    documentTypeId: 'ty-1',
    number: null,
    issueDate: new Date(2026, 6, 1),
    expiryDate: new Date(2026, 8, 30),
    filePath: 't1/contratistas/s-1/f30-1.pdf',
    fileName: 'f30-1.pdf',
    fileSize: 12345,
    status: 'aprobado',
    observations: null,
    reviewedBy: 'u1',
    reviewedAt: new Date(2026, 6, 2),
    uploadedBy: 'u1',
    createdAt: new Date(2026, 6, 1),
    ...over,
  };
}

const HOY = new Date(2026, 7, 7); // 7 de agosto de 2026

/* ── Vigencia ──────────────────────────────────────────────────────────── */

describe('diasParaVencer', () => {
  it('cuenta los días que faltan', () => {
    expect(diasParaVencer(new Date(2026, 7, 17), HOY)).toBe(10);
  });

  it('da negativo cuando ya venció', () => {
    expect(diasParaVencer(new Date(2026, 7, 1), HOY)).toBe(-6);
  });

  it('da 0 el mismo día del vencimiento', () => {
    expect(diasParaVencer(new Date(2026, 7, 7), HOY)).toBe(0);
  });

  it('lee el string YYYY-MM-DD de Supabase por sus dígitos, no en UTC', () => {
    // Leído como UTC, en Chile caería un día antes y el certificado aparecería
    // vencido el día que todavía sirve.
    expect(diasParaVencer('2026-08-07', HOY)).toBe(0);
    expect(diasParaVencer('2026-08-17', HOY)).toBe(10);
  });

  it('devuelve null si no hay fecha', () => {
    expect(diasParaVencer(null, HOY)).toBeNull();
    expect(diasParaVencer(undefined, HOY)).toBeNull();
  });
});

/* ── Estado de un papel ────────────────────────────────────────────────── */

describe('estadoDocumento', () => {
  it('sin documento, falta', () => {
    expect(estadoDocumento(null, tipo(), HOY)).toBe('faltante');
  });

  it('vigente cuando está aprobado y con fecha lejana', () => {
    expect(estadoDocumento(doc(), tipo(), HOY)).toBe('vigente');
  });

  it('por vencer dentro de los 30 días de aviso', () => {
    const d = doc({ expiryDate: new Date(2026, 7, 20) }); // 13 días
    expect(estadoDocumento(d, tipo(), HOY)).toBe('por_vencer');
  });

  it('respeta el plazo de aviso propio del tipo', () => {
    const d = doc({ expiryDate: new Date(2026, 8, 20) }); // 44 días
    expect(estadoDocumento(d, tipo({ warnDays: 60 }), HOY)).toBe('por_vencer');
    expect(estadoDocumento(d, tipo({ warnDays: 15 }), HOY)).toBe('vigente');
  });

  it('vencido cuando la fecha pasó', () => {
    const d = doc({ expiryDate: new Date(2026, 7, 1) });
    expect(estadoDocumento(d, tipo(), HOY)).toBe('vencido');
  });

  it('vale el último día completo', () => {
    const d = doc({ expiryDate: new Date(2026, 7, 7) });
    expect(estadoDocumento(d, tipo(), HOY)).not.toBe('vencido');
  });

  it('observado pesa más que la vigencia', () => {
    // Devuelto con observaciones aunque esté dentro de fecha: la fecha no
    // arregla que oficina central lo haya rechazado.
    const d = doc({ status: 'observado', observations: 'Ilegible' });
    expect(estadoDocumento(d, tipo(), HOY)).toBe('observado');
  });

  it('vencido pesa más que estar sin revisar', () => {
    const d = doc({ status: 'en_revision', expiryDate: new Date(2026, 7, 1) });
    expect(estadoDocumento(d, tipo(), HOY)).toBe('vencido');
  });

  it('un documento que caduca sin fecha de vencimiento cuenta como faltante', () => {
    const d = doc({ expiryDate: null });
    expect(estadoDocumento(d, tipo({ hasExpiry: true }), HOY)).toBe('faltante');
  });

  it('un tipo que no caduca no exige fecha', () => {
    const d = doc({ expiryDate: null });
    expect(estadoDocumento(d, tipo({ hasExpiry: false }), HOY)).toBe('vigente');
  });

  it('cargado y sin revisar queda en revisión', () => {
    const d = doc({ status: 'en_revision' });
    expect(estadoDocumento(d, tipo(), HOY)).toBe('en_revision');
  });
});

/* ── El expediente ─────────────────────────────────────────────────────── */

const TIPOS = [
  tipo({ id: 'ty-rut', code: 'e_rut', name: 'e-RUT', required: true, hasExpiry: false, sortOrder: 10 }),
  tipo({ id: 'ty-f30', code: 'f30_1', name: 'F30-1', required: true, hasExpiry: true, sortOrder: 20 }),
  tipo({ id: 'ty-riohs', code: 'riohs', name: 'RIOHS', required: false, hasExpiry: false, sortOrder: 30 }),
];

function docsCompletos(): ContractorDocument[] {
  return [
    doc({ id: 'd-rut', documentTypeId: 'ty-rut', expiryDate: null }),
    doc({ id: 'd-f30', documentTypeId: 'ty-f30', expiryDate: new Date(2026, 11, 31) }),
  ];
}

describe('expedienteDe', () => {
  it('enrolado cuando todos los obligatorios están aprobados y vigentes', () => {
    const e = expedienteDe('s-1', TIPOS, docsCompletos(), HOY);
    expect(e.estado).toBe('enrolado');
    expect(e.avance).toBe(100);
  });

  it('lista una línea por tipo, cargado o no', () => {
    const e = expedienteDe('s-1', TIPOS, [], HOY);
    expect(e.lineas).toHaveLength(3);
    expect(e.lineas.every((l) => l.documento === null)).toBe(true);
  });

  it('el opcional que falta no impide el enrolamiento', () => {
    const e = expedienteDe('s-1', TIPOS, docsCompletos(), HOY);
    // El RIOHS no está cargado y aun así queda enrolado.
    expect(e.lineas.find((l) => l.tipo.id === 'ty-riohs')?.estado).toBe('faltante');
    expect(e.estado).toBe('enrolado');
  });

  it('incompleto cuando falta un obligatorio', () => {
    const e = expedienteDe('s-1', TIPOS, [docsCompletos()[0]], HOY);
    expect(e.estado).toBe('incompleto');
    expect(e.faltantes.map((l) => l.tipo.name)).toEqual(['F30-1']);
    expect(e.avance).toBe(50);
  });

  it('vencido pesa más que observado, y observado más que faltante', () => {
    const docs = [
      doc({ id: 'd-rut', documentTypeId: 'ty-rut', expiryDate: null, status: 'observado', observations: 'x' }),
      doc({ id: 'd-f30', documentTypeId: 'ty-f30', expiryDate: new Date(2026, 6, 1) }),
    ];
    expect(expedienteDe('s-1', TIPOS, docs, HOY).estado).toBe('vencido');
  });

  it('un documento por vencer sigue contando como resuelto', () => {
    const docs = [
      doc({ id: 'd-rut', documentTypeId: 'ty-rut', expiryDate: null }),
      doc({ id: 'd-f30', documentTypeId: 'ty-f30', expiryDate: new Date(2026, 7, 20) }),
    ];
    const e = expedienteDe('s-1', TIPOS, docs, HOY);
    expect(e.porVencer).toHaveLength(1);
    expect(e.avance).toBe(100);
    // Pero el expediente ya no está limpio: sigue enrolado, con aviso.
    expect(e.estado).toBe('enrolado');
  });

  it('no mezcla los documentos de otro contratista', () => {
    const docs = docsCompletos().map((d) => ({ ...d, supplierId: 's-9' }));
    expect(expedienteDe('s-1', TIPOS, docs, HOY).estado).toBe('incompleto');
  });

  it('ignora los tipos desactivados', () => {
    const tipos = [...TIPOS, tipo({ id: 'ty-off', name: 'Obsoleto', active: false, sortOrder: 5 })];
    const e = expedienteDe('s-1', tipos, docsCompletos(), HOY);
    expect(e.lineas.some((l) => l.tipo.id === 'ty-off')).toBe(false);
    expect(e.estado).toBe('enrolado');
  });

  it('sin catálogo de documentos, no hay expediente que juzgar', () => {
    expect(expedienteDe('s-1', [], [], HOY).estado).toBe('sin_expediente');
  });

  it('ordena las líneas por sortOrder', () => {
    const desordenados = [TIPOS[2], TIPOS[0], TIPOS[1]];
    const e = expedienteDe('s-1', desordenados, [], HOY);
    expect(e.lineas.map((l) => l.tipo.name)).toEqual(['e-RUT', 'F30-1', 'RIOHS']);
  });
});

/* ── La puerta ─────────────────────────────────────────────────────────── */

describe('puedeContratarse', () => {
  it('deja contratar a un enrolado', () => {
    const e = expedienteDe('s-1', TIPOS, docsCompletos(), HOY);
    expect(puedeContratarse(e).puede).toBe(true);
  });

  it('deja contratar aunque haya papeles por vencer: todavía están vigentes', () => {
    const docs = [
      doc({ id: 'd-rut', documentTypeId: 'ty-rut', expiryDate: null }),
      doc({ id: 'd-f30', documentTypeId: 'ty-f30', expiryDate: new Date(2026, 7, 20) }),
    ];
    expect(puedeContratarse(expedienteDe('s-1', TIPOS, docs, HOY)).puede).toBe(true);
  });

  it('dice QUÉ falta, no solo que falta', () => {
    const e = expedienteDe('s-1', TIPOS, [docsCompletos()[0]], HOY);
    const r = puedeContratarse(e);
    expect(r.puede).toBe(false);
    expect(r.motivo).toContain('F30-1');
  });

  it('nombra los documentos vencidos', () => {
    const docs = [
      doc({ id: 'd-rut', documentTypeId: 'ty-rut', expiryDate: null }),
      doc({ id: 'd-f30', documentTypeId: 'ty-f30', expiryDate: new Date(2026, 6, 1) }),
    ];
    const r = puedeContratarse(expedienteDe('s-1', TIPOS, docs, HOY));
    expect(r.motivo).toContain('vencidos');
    expect(r.motivo).toContain('F30-1');
  });

  it('avisa cuando la empresa no ha definido qué papeles exige', () => {
    const r = puedeContratarse(expedienteDe('s-1', [], [], HOY));
    expect(r.puede).toBe(false);
    expect(r.motivo).toContain('Documentos exigidos');
  });

  it('bloquea si todo está cargado pero sin revisar', () => {
    const docs = docsCompletos().map((d) => ({ ...d, status: 'en_revision' as const }));
    const r = puedeContratarse(expedienteDe('s-1', TIPOS, docs, HOY));
    expect(r.puede).toBe(false);
    expect(r.motivo).toContain('revisa');
  });
});

/* ── Vista de conjunto ─────────────────────────────────────────────────── */

describe('vencimientosProximos', () => {
  it('ordena lo más vencido primero', () => {
    const contratistas = [{ id: 's-1', name: 'Uno' }, { id: 's-2', name: 'Dos' }];
    const docs = [
      doc({ id: 'a', supplierId: 's-1', documentTypeId: 'ty-rut', expiryDate: null }),
      doc({ id: 'b', supplierId: 's-1', documentTypeId: 'ty-f30', expiryDate: new Date(2026, 7, 20) }),
      doc({ id: 'c', supplierId: 's-2', documentTypeId: 'ty-rut', expiryDate: null }),
      doc({ id: 'd', supplierId: 's-2', documentTypeId: 'ty-f30', expiryDate: new Date(2026, 6, 1) }),
    ];
    const alertas = vencimientosProximos(contratistas, TIPOS, docs, HOY);
    expect(alertas.map((a) => a.supplierName)).toEqual(['Dos', 'Uno']);
    expect(alertas[0].linea.diasParaVencer).toBeLessThan(0);
  });

  it('no reporta nada cuando todo está lejos de vencer', () => {
    const contratistas = [{ id: 's-1', name: 'Uno' }];
    expect(vencimientosProximos(contratistas, TIPOS, docsCompletos(), HOY)).toEqual([]);
  });
});

describe('resumenContratistas', () => {
  it('cuenta cuántos hay en cada estado', () => {
    const docs = [
      ...docsCompletos(),
      doc({ id: 'x', supplierId: 's-2', documentTypeId: 'ty-rut', expiryDate: null }),
    ];
    const r = resumenContratistas([{ id: 's-1' }, { id: 's-2' }, { id: 's-3' }], TIPOS, docs, HOY);
    expect(r.enrolado).toBe(1);
    expect(r.incompleto).toBe(2);
  });
});
