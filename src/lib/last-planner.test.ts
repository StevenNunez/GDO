import { describe, it, expect } from 'vitest';
import {
  lunesDeLaSemana,
  claveSemana,
  domingoDeLaSemana,
  addSemanas,
  semanasDeLookahead,
  tareasDeLaSemana,
  restriccionesPendientes,
  restriccionesDe,
  estaLiberada,
  diasParaLevantar,
  restriccionesVencidas,
  calcPpc,
  ppcDeLaSemana,
  tendenciaPpc,
  paretoDeCausas,
  saludPrograma,
} from './last-planner';
import type { LookaheadTask, TaskConstraint } from '@/modules/core/lib/data';

function tarea(over: Partial<LookaheadTask> & { id: string }): LookaheadTask {
  return {
    tenantId: 't1', projectId: 'p1', name: 'Tarea',
    weekStart: '2026-08-03', quantityPlanned: 0, quantityDone: 0,
    status: 'planificada', createdAt: new Date(),
    ...over,
  } as LookaheadTask;
}

function restriccion(over: Partial<TaskConstraint> & { id: string }): TaskConstraint {
  return {
    tenantId: 't1', taskId: 'a', type: 'materiales', description: 'Falta fierro',
    status: 'pendiente', createdAt: new Date(),
    ...over,
  } as TaskConstraint;
}

function dia(y: number, m: number, d: number) {
  return new Date(y, m - 1, d);
}

/* ── Semanas ──────────────────────────────────────────────────────────── */

describe('lunesDeLaSemana', () => {
  it('un miércoles cae en el lunes de su semana', () => {
    // 2026-08-05 es miércoles; su lunes es el 3.
    expect(lunesDeLaSemana('2026-08-05')).toEqual(dia(2026, 8, 3));
  });

  it('un lunes se queda donde está', () => {
    expect(lunesDeLaSemana('2026-08-03')).toEqual(dia(2026, 8, 3));
  });

  it('el domingo pertenece a la semana que termina, no a la que empieza', () => {
    // 2026-08-09 es domingo: su lunes es el 3, no el 10.
    expect(lunesDeLaSemana('2026-08-09')).toEqual(dia(2026, 8, 3));
  });

  it('cruza el cambio de mes sin perderse', () => {
    // 2026-09-02 es miércoles; su lunes es el 31 de agosto.
    expect(lunesDeLaSemana('2026-09-02')).toEqual(dia(2026, 8, 31));
  });

  it('una fecha inválida no inventa una semana', () => {
    expect(lunesDeLaSemana(null as unknown as string)).toBeNull();
  });
});

describe('claveSemana y domingoDeLaSemana', () => {
  it('la clave es el lunes en formato ordenable', () => {
    expect(claveSemana('2026-08-05')).toBe('2026-08-03');
  });

  it('dos días de la misma semana comparten clave', () => {
    expect(claveSemana('2026-08-03')).toBe(claveSemana('2026-08-09'));
  });

  it('el domingo cierra la semana', () => {
    expect(domingoDeLaSemana('2026-08-05')).toEqual(dia(2026, 8, 9));
  });
});

describe('addSemanas', () => {
  it('avanza y retrocede desde el lunes de la semana', () => {
    expect(addSemanas('2026-08-05', 1)).toEqual(dia(2026, 8, 10));
    expect(addSemanas('2026-08-05', -1)).toEqual(dia(2026, 7, 27));
  });

  it('cero deja la misma semana', () => {
    expect(addSemanas('2026-08-09', 0)).toEqual(dia(2026, 8, 3));
  });
});

describe('semanasDeLookahead', () => {
  it('devuelve N lunes consecutivos empezando por el de la fecha', () => {
    expect(semanasDeLookahead('2026-08-05', 3)).toEqual([
      dia(2026, 8, 3), dia(2026, 8, 10), dia(2026, 8, 17),
    ]);
  });

  it('el horizonte por defecto son 6 semanas', () => {
    expect(semanasDeLookahead('2026-08-05')).toHaveLength(6);
  });

  it('cruza el cambio de horario chileno sin correrse de día', () => {
    // Septiembre: en Chile cambia la hora. Los lunes deben seguir siendo lunes.
    const semanas = semanasDeLookahead('2026-09-01', 4);
    expect(semanas.every((s) => s.getDay() === 1)).toBe(true);
  });
});

describe('tareasDeLaSemana', () => {
  it('agrupa por semana, no por fecha exacta', () => {
    const tasks = [
      tarea({ id: 'a', weekStart: '2026-08-03' }),
      tarea({ id: 'b', weekStart: '2026-08-10' }),
    ];
    expect(tareasDeLaSemana(tasks, '2026-08-06').map((t) => t.id)).toEqual(['a']);
  });
});

/* ── Restricciones ────────────────────────────────────────────────────── */

describe('restricciones', () => {
  const lista = [
    restriccion({ id: 'r1', taskId: 'a', status: 'pendiente' }),
    restriccion({ id: 'r2', taskId: 'a', status: 'liberada' }),
    restriccion({ id: 'r3', taskId: 'b', status: 'anulada' }),
  ];

  it('solo las pendientes bloquean', () => {
    expect(restriccionesPendientes(lista).map((c) => c.id)).toEqual(['r1']);
  });

  it('filtra por tarea', () => {
    expect(restriccionesDe(lista, 'a').map((c) => c.id)).toEqual(['r1', 'r2']);
  });

  it('una tarea con restricción pendiente no está liberada', () => {
    expect(estaLiberada('a', lista)).toBe(false);
  });

  it('una tarea cuyas restricciones se levantaron sí está liberada', () => {
    expect(estaLiberada('b', lista)).toBe(true);
  });

  it('no tener restricciones registradas no es estar bloqueado', () => {
    expect(estaLiberada('sin-restricciones', lista)).toBe(true);
  });

  it('cuenta los días que faltan para levantarla', () => {
    expect(diasParaLevantar({ dueDate: '2026-08-10' as unknown as Date }, '2026-08-04')).toBe(6);
    expect(diasParaLevantar({ dueDate: null }, '2026-08-04')).toBeNull();
  });

  it('vencida es la pendiente cuya fecha ya pasó', () => {
    const conFechas = [
      restriccion({ id: 'vencida', dueDate: '2026-08-01' as unknown as Date }),
      restriccion({ id: 'a-tiempo', dueDate: '2026-08-20' as unknown as Date }),
      // Ya liberada: aunque su fecha pasó, no está vencida.
      restriccion({ id: 'liberada', status: 'liberada', dueDate: '2026-08-01' as unknown as Date }),
    ];
    expect(restriccionesVencidas(conFechas, '2026-08-04').map((c) => c.id)).toEqual(['vencida']);
  });
});

/* ── PPC ──────────────────────────────────────────────────────────────── */

describe('calcPpc', () => {
  it('es cumplidas sobre lo evaluado', () => {
    const p = calcPpc([
      tarea({ id: '1', status: 'cumplida' }),
      tarea({ id: '2', status: 'cumplida' }),
      tarea({ id: '3', status: 'no_cumplida' }),
      tarea({ id: '4', status: 'no_cumplida' }),
    ]);
    expect(p.comprometidas).toBe(4);
    expect(p.ppc).toBe(50);
  });

  it('el avance parcial NO cuenta como cumplido: el PPC es binario', () => {
    // Se comprometieron 100 m2 y se hicieron 90: la tarea no se cumplió.
    const p = calcPpc([
      tarea({ id: '1', status: 'no_cumplida', quantityPlanned: 100, quantityDone: 90 }),
      tarea({ id: '2', status: 'cumplida', quantityPlanned: 100, quantityDone: 100 }),
    ]);
    expect(p.ppc).toBe(50);
  });

  it('lo que sigue en lookahead o anulado no fue un compromiso', () => {
    const p = calcPpc([
      tarea({ id: '1', status: 'cumplida' }),
      tarea({ id: '2', status: 'planificada' }),
      tarea({ id: '3', status: 'anulada' }),
    ]);
    expect(p.comprometidas).toBe(1);
    expect(p.ppc).toBe(100);
  });

  it('las comprometidas sin evaluar no cuentan como incumplidas a mitad de semana', () => {
    const p = calcPpc([
      tarea({ id: '1', status: 'cumplida' }),
      tarea({ id: '2', status: 'comprometida' }),
    ]);
    expect(p.pendientesDeCierre).toBe(1);
    expect(p.comprometidas).toBe(2);
    expect(p.ppc).toBe(100);
  });

  it('una semana sin compromisos no tiene PPC, no tiene 0%', () => {
    expect(calcPpc([]).ppc).toBeNull();
    expect(calcPpc([tarea({ id: '1', status: 'planificada' })]).ppc).toBeNull();
  });

  it('ppcDeLaSemana solo mira las tareas de esa semana', () => {
    const tasks = [
      tarea({ id: '1', weekStart: '2026-08-03', status: 'cumplida' }),
      tarea({ id: '2', weekStart: '2026-08-10', status: 'no_cumplida' }),
    ];
    expect(ppcDeLaSemana(tasks, '2026-08-05').ppc).toBe(100);
  });
});

describe('tendenciaPpc', () => {
  it('devuelve la serie en orden cronológico', () => {
    const tasks = [
      tarea({ id: '1', weekStart: '2026-08-10', status: 'cumplida' }),
      tarea({ id: '2', weekStart: '2026-08-10', status: 'no_cumplida' }),
      tarea({ id: '3', weekStart: '2026-08-03', status: 'cumplida' }),
    ];
    const serie = tendenciaPpc(tasks);
    expect(serie.map((p) => p.semana)).toEqual(['2026-08-03', '2026-08-10']);
    expect(serie[0].ppc).toBe(100);
    expect(serie[1].ppc).toBe(50);
  });

  it('una semana sin compromisos es un hueco, no un cero en el gráfico', () => {
    const tasks = [
      tarea({ id: '1', weekStart: '2026-08-03', status: 'cumplida' }),
      tarea({ id: '2', weekStart: '2026-08-10', status: 'planificada' }),
    ];
    expect(tendenciaPpc(tasks).map((p) => p.semana)).toEqual(['2026-08-03']);
  });

  it('sin tareas la serie está vacía', () => {
    expect(tendenciaPpc([])).toEqual([]);
  });
});

/* ── Causas ───────────────────────────────────────────────────────────── */

describe('paretoDeCausas', () => {
  it('ordena de la causa que más se repite a la que menos', () => {
    const tasks = [
      tarea({ id: '1', status: 'no_cumplida', causeCode: 'materiales' }),
      tarea({ id: '2', status: 'no_cumplida', causeCode: 'materiales' }),
      tarea({ id: '3', status: 'no_cumplida', causeCode: 'materiales' }),
      tarea({ id: '4', status: 'no_cumplida', causeCode: 'cancha' }),
      tarea({ id: '5', status: 'cumplida' }),
    ];
    const { causas, total } = paretoDeCausas(tasks);
    expect(causas.map((c) => c.cause)).toEqual(['materiales', 'cancha']);
    expect(causas[0].cantidad).toBe(3);
    expect(causas[0].porcentaje).toBeCloseTo(75, 6);
    expect(total).toBe(4);
  });

  it('los incumplimientos sin causa se informan aparte, no se reparten', () => {
    const tasks = [
      tarea({ id: '1', status: 'no_cumplida', causeCode: 'clima' }),
      tarea({ id: '2', status: 'no_cumplida' }),
      tarea({ id: '3', status: 'no_cumplida' }),
    ];
    const { causas, sinCausa, total } = paretoDeCausas(tasks);
    expect(sinCausa).toBe(2);
    expect(total).toBe(3);
    // El % se calcula sobre las que sí tienen causa, no sobre el total.
    expect(causas[0].porcentaje).toBe(100);
  });

  it('las cumplidas no aportan causas', () => {
    expect(paretoDeCausas([tarea({ id: '1', status: 'cumplida' })]).total).toBe(0);
  });
});

/* ── Salud del programa ───────────────────────────────────────────────── */

describe('saludPrograma', () => {
  it('cuenta lo comprometido sin liberar y lo liberado sin comprometer', () => {
    const semana = [
      tarea({ id: 'con-restriccion', status: 'comprometida' }),
      tarea({ id: 'limpia', status: 'comprometida' }),
      tarea({ id: 'hecha', status: 'cumplida' }),
    ];
    const lookahead = [
      ...semana,
      tarea({ id: 'lista', status: 'planificada' }),
      tarea({ id: 'bloqueada', status: 'planificada' }),
    ];
    const constraints = [
      restriccion({ id: 'r1', taskId: 'con-restriccion', status: 'pendiente' }),
      restriccion({ id: 'r2', taskId: 'bloqueada', status: 'pendiente', dueDate: '2026-08-01' as unknown as Date }),
      restriccion({ id: 'r3', taskId: 'limpia', status: 'liberada' }),
    ];

    const salud = saludPrograma(semana, lookahead, constraints, '2026-08-04');
    expect(salud.comprometidasConRestriccion).toBe(1);
    expect(salud.liberadasSinComprometer).toBe(1);
    expect(salud.restriccionesPendientes).toBe(2);
    expect(salud.restriccionesVencidas).toBe(1);
    expect(salud.ppc.ppc).toBe(100);
  });

  it('ignora restricciones de tareas fuera del horizonte mirado', () => {
    const salud = saludPrograma(
      [],
      [tarea({ id: 'a', status: 'planificada' })],
      [restriccion({ id: 'r1', taskId: 'de-otra-obra', status: 'pendiente' })],
      '2026-08-04',
    );
    expect(salud.restriccionesPendientes).toBe(0);
  });
});
