import { describe, it, expect } from 'vitest';
import {
  diaIso, claveDia, indexarExcepciones, esDiaHabil,
  proximoDiaHabil, sumarDiasHabiles, diasHabilesEntre,
  DIAS_HABILES_POR_DEFECTO,
} from './work-calendar';
import type { WorkCalendarException } from '@/modules/core/lib/data';

function excepcion(over: Partial<WorkCalendarException> & { date: string }): WorkCalendarException {
  return {
    id: crypto.randomUUID(), tenantId: 't1', projectId: null,
    name: 'Feriado', type: 'feriado', createdAt: new Date(),
    ...over,
  } as WorkCalendarException;
}

const SIN_EXCEPCIONES = new Map<string, WorkCalendarException['type']>();

/* 2026-09-14 es lunes; 2026-09-18 viernes; 2026-09-19 sábado. */

describe('diaIso', () => {
  it('numera el domingo como 7 y no como 0', () => {
    expect(diaIso(new Date(2026, 8, 13))).toBe(7); // domingo
    expect(diaIso(new Date(2026, 8, 14))).toBe(1); // lunes
    expect(diaIso(new Date(2026, 8, 19))).toBe(6); // sábado
  });
});

describe('claveDia', () => {
  it('lee un string de fecha sin pasar por UTC', () => {
    expect(claveDia('2026-09-18')).toBe('2026-09-18');
  });
  it('lee un Date por sus campos locales', () => {
    expect(claveDia(new Date(2026, 8, 18))).toBe('2026-09-18');
  });
});

describe('indexarExcepciones', () => {
  it('toma las de la empresa y las de la obra', () => {
    const mapa = indexarExcepciones([
      excepcion({ date: '2026-09-18' }),
      excepcion({ date: '2026-12-25', projectId: 'p1' }),
    ], 'p1');
    expect(mapa.get('2026-09-18')).toBe('feriado');
    expect(mapa.get('2026-12-25')).toBe('feriado');
  });

  it('ignora las de OTRA obra', () => {
    const mapa = indexarExcepciones([
      excepcion({ date: '2026-12-25', projectId: 'p2' }),
    ], 'p1');
    expect(mapa.has('2026-12-25')).toBe(false);
  });

  it('la excepción de la obra le gana a la de la empresa', () => {
    // La empresa no trabaja el 18; esta obra sí, para recuperar atraso.
    const mapa = indexarExcepciones([
      excepcion({ date: '2026-09-18', type: 'feriado', projectId: null }),
      excepcion({ date: '2026-09-18', type: 'trabajado', projectId: 'p1' }),
    ], 'p1');
    expect(mapa.get('2026-09-18')).toBe('trabajado');
  });
});

describe('esDiaHabil', () => {
  it('trabaja de lunes a viernes si no se configuró otra cosa', () => {
    expect(esDiaHabil('2026-09-18', null, SIN_EXCEPCIONES)).toBe(true);  // viernes
    expect(esDiaHabil('2026-09-19', null, SIN_EXCEPCIONES)).toBe(false); // sábado
    expect(esDiaHabil('2026-09-20', null, SIN_EXCEPCIONES)).toBe(false); // domingo
  });

  it('respeta una obra que trabaja los sábados', () => {
    expect(esDiaHabil('2026-09-19', [1, 2, 3, 4, 5, 6], SIN_EXCEPCIONES)).toBe(true);
  });

  it('un feriado bloquea un día de semana', () => {
    const mapa = indexarExcepciones([excepcion({ date: '2026-09-18' })], null);
    expect(esDiaHabil('2026-09-18', null, mapa)).toBe(false);
  });

  it('un día "trabajado" gana sobre el fin de semana y sobre el feriado', () => {
    const mapa = indexarExcepciones([
      excepcion({ date: '2026-09-19', type: 'trabajado' }),
    ], null);
    expect(esDiaHabil('2026-09-19', null, mapa)).toBe(true);
  });

  it('una lista de días vacía cae en lunes a viernes en vez de dejar la obra sin días', () => {
    expect(esDiaHabil('2026-09-18', [], SIN_EXCEPCIONES)).toBe(true);
    expect(DIAS_HABILES_POR_DEFECTO).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('proximoDiaHabil', () => {
  it('devuelve el mismo día si ya es hábil', () => {
    expect(claveDia(proximoDiaHabil('2026-09-18', null, SIN_EXCEPCIONES)!)).toBe('2026-09-18');
  });

  it('salta el fin de semana', () => {
    expect(claveDia(proximoDiaHabil('2026-09-19', null, SIN_EXCEPCIONES)!)).toBe('2026-09-21');
  });

  it('salta también el feriado que sigue al fin de semana', () => {
    const mapa = indexarExcepciones([excepcion({ date: '2026-09-21' })], null);
    expect(claveDia(proximoDiaHabil('2026-09-19', null, mapa)!)).toBe('2026-09-22');
  });
});

describe('sumarDiasHabiles', () => {
  it('sumar 0 normaliza al primer día hábil, no deja la fecha en domingo', () => {
    expect(claveDia(sumarDiasHabiles('2026-09-20', 0, null, SIN_EXCEPCIONES)!)).toBe('2026-09-21');
  });

  it('el viernes más un día hábil es el lunes', () => {
    expect(claveDia(sumarDiasHabiles('2026-09-18', 1, null, SIN_EXCEPCIONES)!)).toBe('2026-09-21');
  });

  it('cinco días hábiles desde un lunes caen en el lunes siguiente', () => {
    expect(claveDia(sumarDiasHabiles('2026-09-14', 5, null, SIN_EXCEPCIONES)!)).toBe('2026-09-21');
  });

  it('un feriado en el medio corre la fecha un día más', () => {
    const mapa = indexarExcepciones([excepcion({ date: '2026-09-16' })], null);
    // Sin feriado: lunes 14 + 2 = miércoles 16. Con el 16 feriado: jueves 17.
    expect(claveDia(sumarDiasHabiles('2026-09-14', 2, null, mapa)!)).toBe('2026-09-17');
  });

  it('una obra que trabaja los sábados avanza más rápido', () => {
    // Viernes 18 + 1 día, trabajando sábados → sábado 19.
    expect(claveDia(sumarDiasHabiles('2026-09-18', 1, [1, 2, 3, 4, 5, 6], SIN_EXCEPCIONES)!))
      .toBe('2026-09-19');
  });
});

describe('diasHabilesEntre', () => {
  it('cuenta las dos puntas: el mismo día dura un día', () => {
    expect(diasHabilesEntre('2026-09-18', '2026-09-18', null, SIN_EXCEPCIONES)).toBe(1);
  });

  it('una semana de lunes a viernes son 5 días', () => {
    expect(diasHabilesEntre('2026-09-14', '2026-09-18', null, SIN_EXCEPCIONES)).toBe(5);
  });

  it('no cuenta el fin de semana', () => {
    expect(diasHabilesEntre('2026-09-14', '2026-09-20', null, SIN_EXCEPCIONES)).toBe(5);
  });

  it('descuenta los feriados del tramo', () => {
    const mapa = indexarExcepciones([
      excepcion({ date: '2026-09-16' }),
      excepcion({ date: '2026-09-17' }),
    ], null);
    expect(diasHabilesEntre('2026-09-14', '2026-09-18', null, mapa)).toBe(3);
  });

  it('un término anterior al inicio es 0, no un negativo', () => {
    expect(diasHabilesEntre('2026-09-18', '2026-09-14', null, SIN_EXCEPCIONES)).toBe(0);
  });
});
