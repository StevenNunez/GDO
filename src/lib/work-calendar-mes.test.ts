import { describe, it, expect } from 'vitest';
import { mesEnSemanas } from './work-calendar';
import type { WorkCalendarException } from '@/modules/core/lib/data';

const sinExcepciones = new Map<string, WorkCalendarException['type']>();

describe('mesEnSemanas', () => {
  it('arma semanas de lunes a domingo que cubren todo el mes', () => {
    // Septiembre de 2026 arranca un martes y termina un miércoles.
    const semanas = mesEnSemanas(2026, 8, null, sinExcepciones, '2026-09-10');
    expect(semanas.every((s) => s.length === 7)).toBe(true);
    expect(semanas[0][0].clave).toBe('2026-08-31');
    expect(semanas[0][0].delMes).toBe(false);
    expect(semanas[0][1].clave).toBe('2026-09-01');
    const delMes = semanas.flat().filter((d) => d.delMes);
    expect(delMes).toHaveLength(30);
    expect(delMes[delMes.length - 1].clave).toBe('2026-09-30');
  });

  it('no agrega una semana entera que cae fuera del mes', () => {
    // Febrero de 2027 empieza lunes y termina domingo: exactamente cuatro semanas.
    const semanas = mesEnSemanas(2027, 1, null, sinExcepciones, '2027-02-10');
    expect(semanas).toHaveLength(4);
    expect(semanas.flat().every((d) => d.delMes)).toBe(true);
  });

  it('marca hábiles de lunes a viernes por omisión y no laborales el fin de semana', () => {
    const semanas = mesEnSemanas(2026, 8, null, sinExcepciones, '2026-09-10');
    const porClave = new Map(semanas.flat().map((d) => [d.clave, d]));
    expect(porClave.get('2026-09-11')?.tipo).toBe('habil'); // viernes
    expect(porClave.get('2026-09-12')?.tipo).toBe('no-laboral'); // sábado
    expect(porClave.get('2026-09-13')?.tipo).toBe('no-laboral'); // domingo
  });

  it('respeta los días de trabajo de la obra', () => {
    const semanas = mesEnSemanas(2026, 8, [1, 2, 3, 4, 5, 6], sinExcepciones, '2026-09-10');
    const sabado = semanas.flat().find((d) => d.clave === '2026-09-12');
    expect(sabado?.tipo).toBe('habil');
  });

  it('muestra los feriados y los días trabajados por excepción', () => {
    const excepciones = new Map<string, WorkCalendarException['type']>([
      ['2026-09-18', 'feriado'],
      ['2026-09-19', 'feriado'],
      ['2026-09-12', 'trabajado'],
    ]);
    const dias = new Map(mesEnSemanas(2026, 8, null, excepciones, '2026-09-10').flat().map((d) => [d.clave, d]));
    expect(dias.get('2026-09-18')?.tipo).toBe('feriado');
    expect(dias.get('2026-09-19')?.tipo).toBe('feriado');
    expect(dias.get('2026-09-12')?.tipo).toBe('trabajado');
  });

  it('marca solo el día de hoy', () => {
    const dias = mesEnSemanas(2026, 8, null, sinExcepciones, '2026-09-10').flat();
    expect(dias.filter((d) => d.hoy).map((d) => d.clave)).toEqual(['2026-09-10']);
  });

  it('un hoy fuera del mes mostrado no marca nada', () => {
    const dias = mesEnSemanas(2026, 8, null, sinExcepciones, '2026-12-25').flat();
    expect(dias.some((d) => d.hoy)).toBe(false);
  });
});
