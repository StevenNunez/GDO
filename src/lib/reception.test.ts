import { describe, it, expect } from 'vitest';
import {
  observacionesDe,
  observacionesPendientes,
  observacionesVencidas,
  observacionesCriticas,
  estadoRecepcion,
  puedeRecepcionDefinitiva,
  finDeGarantia,
  diasDeGarantia,
  resumenRecepcion,
} from './reception';
import type { Reception, ReceptionObservation } from '@/modules/core/lib/data';

function recepcion(over: Partial<Reception> & { id: string }): Reception {
  return {
    tenantId: 't1', projectId: 'p1', contractId: 'c1', type: 'provisoria',
    status: 'con_observaciones', retentionReleased: 0, createdAt: new Date(),
    ...over,
  } as Reception;
}

function obs(over: Partial<ReceptionObservation> & { id: string }): ReceptionObservation {
  return {
    tenantId: 't1', receptionId: 'r1', description: 'Defecto',
    severity: 'menor', status: 'pendiente', createdAt: new Date(),
    ...over,
  } as ReceptionObservation;
}

function dia(y: number, m: number, d: number) {
  return new Date(y, m - 1, d);
}

const HOY = '2026-08-04';

/* ── Observaciones ────────────────────────────────────────────────────── */

describe('observaciones', () => {
  const lista = [
    obs({ id: 'o1', receptionId: 'r1' }),
    obs({ id: 'o2', receptionId: 'r1', status: 'subsanada' }),
    obs({ id: 'o3', receptionId: 'r2' }),
  ];

  it('se filtran por recepción', () => {
    expect(observacionesDe(lista, 'r1').map((o) => o.id)).toEqual(['o1', 'o2']);
  });

  it('pendiente es solo lo que sigue abierto', () => {
    expect(observacionesPendientes(lista).map((o) => o.id)).toEqual(['o1', 'o3']);
  });

  it('una anulada no cuenta como pendiente', () => {
    expect(observacionesPendientes([obs({ id: 'x', status: 'anulada' })])).toEqual([]);
  });

  it('vencida es la pendiente cuya fecha pasó', () => {
    const conFechas = [
      obs({ id: 'vencida', dueDate: '2026-08-01' as unknown as Date }),
      obs({ id: 'a-tiempo', dueDate: '2026-08-20' as unknown as Date }),
      obs({ id: 'ya-subsanada', status: 'subsanada', dueDate: '2026-08-01' as unknown as Date }),
      obs({ id: 'sin-fecha' }),
    ];
    expect(observacionesVencidas(conFechas, HOY).map((o) => o.id)).toEqual(['vencida']);
  });

  it('crítica agrupa lo grave que sigue abierto', () => {
    const graves = [
      obs({ id: 'critica', severity: 'critica' }),
      obs({ id: 'mayor', severity: 'mayor' }),
      obs({ id: 'menor', severity: 'menor' }),
      obs({ id: 'resuelta', severity: 'critica', status: 'subsanada' }),
    ];
    expect(observacionesCriticas(graves).map((o) => o.id)).toEqual(['critica', 'mayor']);
  });
});

/* ── Estado real ──────────────────────────────────────────────────────── */

describe('estadoRecepcion', () => {
  it('una recepción "aceptada" con pendientes se reporta con observaciones', () => {
    // El dato duro manda sobre la casilla marcada.
    const r = recepcion({ id: 'r1', status: 'aceptada' });
    expect(estadoRecepcion(r, [obs({ id: 'o1' })])).toBe('con_observaciones');
  });

  it('sin pendientes y aceptada, está aceptada', () => {
    const r = recepcion({ id: 'r1', status: 'aceptada' });
    expect(estadoRecepcion(r, [obs({ id: 'o1', status: 'subsanada' })])).toBe('aceptada');
  });

  it('todo subsanado pero sin aceptar formalmente queda como subsanada', () => {
    const r = recepcion({ id: 'r1', status: 'con_observaciones' });
    expect(estadoRecepcion(r, [obs({ id: 'o1', status: 'subsanada' })])).toBe('subsanada');
  });

  it('rechazada y borrador mandan sobre las observaciones', () => {
    expect(estadoRecepcion(recepcion({ id: 'r1', status: 'rechazada' }), [obs({ id: 'o1' })]))
      .toBe('rechazada');
    expect(estadoRecepcion(recepcion({ id: 'r1', status: 'borrador' }), []))
      .toBe('borrador');
  });
});

/* ── Recepción definitiva ─────────────────────────────────────────────── */

describe('puedeRecepcionDefinitiva', () => {
  it('exige una provisoria previa', () => {
    const r = puedeRecepcionDefinitiva([], []);
    expect(r.puede).toBe(false);
    expect(r.motivo).toMatch(/provisoria/i);
  });

  it('no se firma con observaciones pendientes', () => {
    const r = puedeRecepcionDefinitiva(
      [recepcion({ id: 'r1', type: 'provisoria' })],
      [obs({ id: 'o1' }), obs({ id: 'o2' })],
    );
    expect(r.puede).toBe(false);
    expect(r.motivo).toMatch(/2 observaci/);
  });

  it('con la provisoria hecha y todo subsanado, se puede', () => {
    const r = puedeRecepcionDefinitiva(
      [recepcion({ id: 'r1', type: 'provisoria' })],
      [obs({ id: 'o1', status: 'aceptada' })],
    );
    expect(r.puede).toBe(true);
  });
});

/* ── Garantía ─────────────────────────────────────────────────────────── */

describe('garantía', () => {
  it('la garantía corre desde la recepción provisoria', () => {
    const r = recepcion({
      id: 'r1', receptionDate: '2026-08-04' as unknown as Date, warrantyDays: 365,
    });
    expect(finDeGarantia(r)).toEqual(dia(2027, 8, 4));
  });

  it('sin plazo o sin fecha no se inventa un fin de garantía', () => {
    expect(finDeGarantia(recepcion({ id: 'r1', receptionDate: '2026-08-04' as unknown as Date }))).toBeNull();
    expect(finDeGarantia(recepcion({ id: 'r1', warrantyDays: 365 }))).toBeNull();
  });

  it('cuenta los días que faltan y avisa cuando ya venció', () => {
    const r = recepcion({
      id: 'r1', receptionDate: '2026-08-01' as unknown as Date, warrantyDays: 10,
    });
    expect(diasDeGarantia(r, HOY)).toBe(7);
    expect(diasDeGarantia(r, '2026-08-20')).toBe(-9);
  });
});

/* ── Resumen ──────────────────────────────────────────────────────────── */

describe('resumenRecepcion', () => {
  it('mide el avance de subsanación', () => {
    const r = resumenRecepcion([
      obs({ id: 'o1', status: 'subsanada' }),
      obs({ id: 'o2', status: 'aceptada' }),
      obs({ id: 'o3' }),
      obs({ id: 'o4', severity: 'critica' }),
    ]);
    expect(r.observaciones).toBe(4);
    expect(r.pendientes).toBe(2);
    expect(r.criticas).toBe(1);
    expect(r.avanceSubsanacion).toBe(50);
  });

  it('las anuladas no entran en el conteo', () => {
    const r = resumenRecepcion([
      obs({ id: 'o1', status: 'anulada' }),
      obs({ id: 'o2', status: 'subsanada' }),
    ]);
    expect(r.observaciones).toBe(1);
    expect(r.avanceSubsanacion).toBe(100);
  });

  it('sin observaciones no hay avance que medir, no es 0%', () => {
    expect(resumenRecepcion([]).avanceSubsanacion).toBeNull();
  });
});
