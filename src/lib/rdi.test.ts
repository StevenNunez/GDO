import { describe, it, expect } from 'vitest';
import {
  diasParaResponder,
  estadoRdi,
  rdisPendientes,
  rdisConImpactoSinAdicional,
  resumenRdi,
  siguienteNumeroRdi,
  diasDeRespuesta,
  promedioRespuesta,
} from './rdi';
import type { Rdi } from '@/modules/core/lib/data';

function rdi(over: Partial<Rdi> & { id: string }): Rdi {
  return {
    tenantId: 't1', projectId: 'p1', number: 1,
    subject: 'Consulta', question: '¿?', discipline: 'general', priority: 'normal',
    status: 'abierta', impactCost: false, impactTime: false,
    createdAt: new Date(),
    ...over,
  } as Rdi;
}

const HOY = '2026-08-04';

/* ── Plazo ────────────────────────────────────────────────────────────── */

describe('diasParaResponder', () => {
  it('cuenta los días que faltan', () => {
    expect(diasParaResponder({ dueDate: '2026-08-10' as unknown as Date }, HOY)).toBe(6);
  });

  it('vencida devuelve negativo', () => {
    expect(diasParaResponder({ dueDate: '2026-08-01' as unknown as Date }, HOY)).toBe(-3);
  });

  it('vence hoy es cero, no vencida', () => {
    expect(diasParaResponder({ dueDate: '2026-08-04' as unknown as Date }, HOY)).toBe(0);
  });

  it('sin plazo pactado devuelve null en vez de inventar uno', () => {
    expect(diasParaResponder({ dueDate: null }, HOY)).toBeNull();
  });

  it('un plazo que cruza el cambio de hora chileno no se corre un día', () => {
    // En Chile el horario de verano cambia en abril y septiembre.
    expect(diasParaResponder({ dueDate: '2026-09-10' as unknown as Date }, '2026-09-01')).toBe(9);
    expect(diasParaResponder({ dueDate: '2026-04-10' as unknown as Date }, '2026-04-01')).toBe(9);
  });
});

describe('estadoRdi', () => {
  it('avisa cuando quedan pocos días', () => {
    expect(estadoRdi(rdi({ id: 'a', dueDate: '2026-08-06' as unknown as Date }), HOY))
      .toBe('por-vencer');
  });

  it('con plazo holgado sigue simplemente abierta', () => {
    expect(estadoRdi(rdi({ id: 'a', dueDate: '2026-08-20' as unknown as Date }), HOY))
      .toBe('abierta');
  });

  it('pasado el plazo queda vencida', () => {
    expect(estadoRdi(rdi({ id: 'a', dueDate: '2026-07-30' as unknown as Date }), HOY))
      .toBe('vencida');
  });

  it('sin plazo no se puede decir que esté atrasada', () => {
    expect(estadoRdi(rdi({ id: 'a', dueDate: null }), HOY)).toBe('sin-plazo');
  });

  it('lo que alguien decidió manda sobre la fecha: una respondida no está vencida', () => {
    const r = rdi({ id: 'a', status: 'respondida', dueDate: '2026-07-01' as unknown as Date });
    expect(estadoRdi(r, HOY)).toBe('respondida');
  });

  it('cerrada y anulada también mandan sobre la fecha', () => {
    expect(estadoRdi(rdi({ id: 'a', status: 'cerrada', dueDate: '2026-07-01' as unknown as Date }), HOY))
      .toBe('cerrada');
    expect(estadoRdi(rdi({ id: 'a', status: 'anulada', dueDate: '2026-07-01' as unknown as Date }), HOY))
      .toBe('anulada');
  });
});

describe('rdisPendientes', () => {
  it('ordena por urgencia: primero la más vencida', () => {
    const lista = [
      rdi({ id: 'holgada', number: 3, dueDate: '2026-08-20' as unknown as Date }),
      rdi({ id: 'vencida', number: 1, dueDate: '2026-07-25' as unknown as Date }),
      rdi({ id: 'por-vencer', number: 2, dueDate: '2026-08-05' as unknown as Date }),
    ];
    expect(rdisPendientes(lista, HOY).map((r) => r.id))
      .toEqual(['vencida', 'por-vencer', 'holgada']);
  });

  it('las sin plazo van al final', () => {
    const lista = [
      rdi({ id: 'sin-plazo', number: 1, dueDate: null }),
      rdi({ id: 'con-plazo', number: 2, dueDate: '2026-08-20' as unknown as Date }),
    ];
    expect(rdisPendientes(lista, HOY).map((r) => r.id)).toEqual(['con-plazo', 'sin-plazo']);
  });

  it('las respondidas ya no están pendientes', () => {
    const lista = [
      rdi({ id: 'a', status: 'respondida', dueDate: '2026-07-01' as unknown as Date }),
      rdi({ id: 'b', status: 'anulada' }),
    ];
    expect(rdisPendientes(lista, HOY)).toEqual([]);
  });
});

/* ── Impacto sin cobrar ───────────────────────────────────────────────── */

describe('rdisConImpactoSinAdicional', () => {
  it('encuentra la obra reconocida por escrito y sin cobrar', () => {
    const lista = [
      rdi({ id: 'cobrada', status: 'respondida', impactCost: true, amendmentId: 'am1' }),
      rdi({ id: 'sin-cobrar', status: 'respondida', impactCost: true }),
      rdi({ id: 'plazo-sin-cobrar', status: 'cerrada', impactTime: true }),
      rdi({ id: 'sin-impacto', status: 'respondida' }),
      // Todavía sin respuesta: nadie reconoció nada aún.
      rdi({ id: 'abierta', status: 'abierta', impactCost: true }),
    ];
    expect(rdisConImpactoSinAdicional(lista).map((r) => r.id))
      .toEqual(['sin-cobrar', 'plazo-sin-cobrar']);
  });
});

/* ── Resumen ──────────────────────────────────────────────────────────── */

describe('resumenRdi', () => {
  it('cuenta pendientes, vencidas, por vencer y respondidas', () => {
    const lista = [
      rdi({ id: 'v', dueDate: '2026-07-25' as unknown as Date }),
      rdi({ id: 'pv', dueDate: '2026-08-05' as unknown as Date }),
      rdi({ id: 'ok', dueDate: '2026-09-01' as unknown as Date }),
      rdi({ id: 'r', status: 'respondida', impactCost: true }),
      rdi({ id: 'c', status: 'cerrada' }),
      rdi({ id: 'x', status: 'anulada' }),
    ];
    const r = resumenRdi(lista, HOY);
    expect(r.total).toBe(6);
    expect(r.pendientes).toBe(3);
    expect(r.vencidas).toBe(1);
    expect(r.porVencer).toBe(1);
    expect(r.respondidas).toBe(2);
    expect(r.impactoSinCobrar).toBe(1);
  });

  it('sin RDI queda todo en cero', () => {
    expect(resumenRdi([], HOY)).toEqual({
      total: 0, pendientes: 0, vencidas: 0, porVencer: 0, respondidas: 0, impactoSinCobrar: 0,
    });
  });
});

describe('siguienteNumeroRdi', () => {
  it('sigue al mayor correlativo, no a la cantidad', () => {
    expect(siguienteNumeroRdi([{ number: 2 }, { number: 7 }])).toBe(8);
  });

  it('la primera es la N° 1', () => {
    expect(siguienteNumeroRdi([])).toBe(1);
  });
});

/* ── Tiempo de respuesta ──────────────────────────────────────────────── */

describe('diasDeRespuesta', () => {
  it('cuenta los días entre la pregunta y la respuesta', () => {
    expect(diasDeRespuesta({
      askedAt: '2026-07-01' as unknown as Date,
      answeredAt: new Date(2026, 6, 9),
    })).toBe(8);
  });

  it('sin alguna de las dos fechas devuelve null, no cero', () => {
    expect(diasDeRespuesta({ askedAt: '2026-07-01' as unknown as Date, answeredAt: null })).toBeNull();
    expect(diasDeRespuesta({ askedAt: null, answeredAt: new Date() })).toBeNull();
  });

  it('nunca es negativo', () => {
    expect(diasDeRespuesta({
      askedAt: '2026-07-10' as unknown as Date,
      answeredAt: new Date(2026, 6, 1),
    })).toBe(0);
  });
});

describe('promedioRespuesta', () => {
  it('promedia solo las que se pueden medir', () => {
    const lista = [
      rdi({ id: 'a', askedAt: '2026-07-01' as unknown as Date, answeredAt: new Date(2026, 6, 5) }),
      rdi({ id: 'b', askedAt: '2026-07-01' as unknown as Date, answeredAt: new Date(2026, 6, 11) }),
      rdi({ id: 'sin-responder', askedAt: '2026-07-01' as unknown as Date }),
    ];
    expect(promedioRespuesta(lista)).toBe(7);
  });

  it('sin ninguna medible devuelve null', () => {
    expect(promedioRespuesta([rdi({ id: 'a' })])).toBeNull();
  });
});
