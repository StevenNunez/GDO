import { describe, it, expect } from 'vitest';
import {
  unidadesDeActividad, celdasDeActividad, celdasPorUnidad, resumenDeActividad,
  actividadesDeObra, matrizDelTren, terminoDelTren, escalonarActividades,
  estadoDeCelda, validarActividad, esSoloAviso, ritmoEnPalabras,
} from './train';
import { indexarExcepciones, claveDia } from './work-calendar';
import type {
  TrainActivity, WorkUnit, WorkCalendarException,
} from '@/modules/core/lib/data';

function unidad(over: Partial<WorkUnit> & { id: string; name: string }): WorkUnit {
  return {
    tenantId: 't1', projectId: 'p1', groupName: 'PISO 1', typology: null,
    sortOrder: 0, area: null, status: 'activa', createdAt: new Date(),
    ...over,
  } as WorkUnit;
}

function actividad(over: Partial<TrainActivity> & { id: string }): TrainActivity {
  return {
    tenantId: 't1', projectId: 'p1', name: 'Cerámica', sortOrder: 0,
    daysPerUnit: 1, status: 'activa', createdAt: new Date(),
    ...over,
  } as TrainActivity;
}

function feriado(date: string): WorkCalendarException {
  return {
    id: date, tenantId: 't1', projectId: null, date,
    name: 'Feriado', type: 'feriado', createdAt: new Date(),
  } as WorkCalendarException;
}

const SIN_FERIADOS = indexarExcepciones([], null);

/** Seis unidades en el orden del recorrido. */
const SEIS = [
  unidad({ id: 'u0', name: '112', sortOrder: 0 }),
  unidad({ id: 'u1', name: '113', sortOrder: 1 }),
  unidad({ id: 'u2', name: '114', sortOrder: 2 }),
  unidad({ id: 'u3', name: '111', sortOrder: 3 }),
  unidad({ id: 'u4', name: '110', sortOrder: 4 }),
  unidad({ id: 'u5', name: '115', sortOrder: 5 }),
];

const fechas = (celdas: { inicio: Date }[]) => celdas.map((c) => claveDia(c.inicio));

/* 2026-09-14 es lunes. */

describe('unidadesDeActividad', () => {
  it('sin grupos recorre todas las unidades activas', () => {
    expect(unidadesDeActividad({ unitGroups: null }, SEIS)).toHaveLength(6);
  });

  it('deja fuera las excluidas', () => {
    const conExcluida = [...SEIS, unidad({ id: 'ux', name: '116', sortOrder: 6, status: 'excluida' })];
    expect(unidadesDeActividad({ unitGroups: null }, conExcluida)).toHaveLength(6);
  });

  it('con grupos recorre solo esos, sin distinguir mayúsculas', () => {
    const mezcla = [
      unidad({ id: 'a', name: '101', groupName: 'PISO 1', sortOrder: 0 }),
      unidad({ id: 'b', name: '201', groupName: 'PISO 2', sortOrder: 1 }),
    ];
    const soloPiso2 = unidadesDeActividad({ unitGroups: ['piso 2'] }, mezcla);
    expect(soloPiso2.map((u) => u.id)).toEqual(['b']);
  });

  it('un array de grupos vacío o con basura equivale a "todas"', () => {
    expect(unidadesDeActividad({ unitGroups: [] }, SEIS)).toHaveLength(6);
    expect(unidadesDeActividad({ unitGroups: ['  '] }, SEIS)).toHaveLength(6);
  });
});

describe('celdasDeActividad', () => {
  it('un día por unidad avanza un día hábil por unidad', () => {
    const celdas = celdasDeActividad(
      { startDate: '2026-09-14', daysPerUnit: 1, unitGroups: null },
      SEIS, null, SIN_FERIADOS,
    );
    expect(fechas(celdas)).toEqual([
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18',
      '2026-09-21', // salta el fin de semana
    ]);
  });

  /* El ritmo real del programa de Los Fundadores: los deptos 112 y 113
     comparten fecha y el 114 cae al día hábil siguiente. */
  it('medio día por unidad son DOS unidades por día', () => {
    const celdas = celdasDeActividad(
      { startDate: '2026-09-14', daysPerUnit: 0.5, unitGroups: null },
      SEIS, null, SIN_FERIADOS,
    );
    expect(fechas(celdas)).toEqual([
      '2026-09-14', '2026-09-14',
      '2026-09-15', '2026-09-15',
      '2026-09-16', '2026-09-16',
    ]);
  });

  it('dos días por unidad deja un día de por medio', () => {
    const celdas = celdasDeActividad(
      { startDate: '2026-09-14', daysPerUnit: 2, unitGroups: null },
      SEIS, null, SIN_FERIADOS,
    );
    expect(fechas(celdas)).toEqual([
      '2026-09-14', '2026-09-16', '2026-09-18',
      '2026-09-22', '2026-09-24', '2026-09-28',
    ]);
  });

  it('con dos días por unidad el término es el día siguiente al inicio', () => {
    const celdas = celdasDeActividad(
      { startDate: '2026-09-14', daysPerUnit: 2, unitGroups: null },
      SEIS, null, SIN_FERIADOS,
    );
    expect(claveDia(celdas[0].inicio)).toBe('2026-09-14');
    expect(claveDia(celdas[0].termino)).toBe('2026-09-15');
  });

  it('con ritmo menor a un día, inicio y término son el mismo día', () => {
    const celdas = celdasDeActividad(
      { startDate: '2026-09-14', daysPerUnit: 0.5, unitGroups: null },
      SEIS, null, SIN_FERIADOS,
    );
    expect(claveDia(celdas[0].termino)).toBe('2026-09-14');
  });

  /* Es lo que pasa de verdad en el programa del usuario: la actividad salta el
     Viernes Santo sin que nadie lo anote en la celda. */
  it('salta los feriados solo', () => {
    const cal = indexarExcepciones([feriado('2026-09-16')], null);
    const celdas = celdasDeActividad(
      { startDate: '2026-09-14', daysPerUnit: 1, unitGroups: null },
      SEIS, null, cal,
    );
    expect(fechas(celdas)).toEqual([
      '2026-09-14', '2026-09-15', '2026-09-17', '2026-09-18',
      '2026-09-21', '2026-09-22',
    ]);
  });

  it('una obra que trabaja sábados no salta el sábado', () => {
    const celdas = celdasDeActividad(
      { startDate: '2026-09-17', daysPerUnit: 1, unitGroups: null },
      SEIS, [1, 2, 3, 4, 5, 6], SIN_FERIADOS,
    );
    expect(fechas(celdas).slice(0, 3)).toEqual(['2026-09-17', '2026-09-18', '2026-09-19']);
  });

  it('un inicio en domingo se corre al lunes en vez de programar en domingo', () => {
    const celdas = celdasDeActividad(
      { startDate: '2026-09-13', daysPerUnit: 1, unitGroups: null },
      SEIS, null, SIN_FERIADOS,
    );
    expect(claveDia(celdas[0].inicio)).toBe('2026-09-14');
  });

  it('sin fecha de inicio no hay celdas: es una fila todavía sin programar', () => {
    expect(celdasDeActividad(
      { startDate: null, daysPerUnit: 1, unitGroups: null }, SEIS, null, SIN_FERIADOS,
    )).toEqual([]);
  });

  it('sin unidades que recorrer no hay celdas', () => {
    expect(celdasDeActividad(
      { startDate: '2026-09-14', daysPerUnit: 1, unitGroups: ['PISO 99'] },
      SEIS, null, SIN_FERIADOS,
    )).toEqual([]);
  });

  it('un ritmo inválido se trata como un día por unidad en vez de reventar', () => {
    const celdas = celdasDeActividad(
      { startDate: '2026-09-14', daysPerUnit: 0, unitGroups: null },
      SEIS, null, SIN_FERIADOS,
    );
    expect(fechas(celdas)[1]).toBe('2026-09-15');
  });
});

describe('celdasPorUnidad', () => {
  it('indexa por unidad para pintar la matriz', () => {
    const celdas = celdasDeActividad(
      { startDate: '2026-09-14', daysPerUnit: 1, unitGroups: null },
      SEIS, null, SIN_FERIADOS,
    );
    const mapa = celdasPorUnidad(celdas);
    expect(claveDia(mapa.get('u2')!.inicio)).toBe('2026-09-16');
    expect(mapa.has('inexistente')).toBe(false);
  });
});

describe('resumenDeActividad', () => {
  it('el término es el de la última unidad', () => {
    const r = resumenDeActividad(
      { startDate: '2026-09-14', daysPerUnit: 1, unitGroups: null },
      SEIS, null, SIN_FERIADOS,
    );
    expect(r.unidades).toBe(6);
    expect(claveDia(r.inicio!)).toBe('2026-09-14');
    expect(claveDia(r.termino!)).toBe('2026-09-21');
    expect(r.duracionDias).toBe(6); // días hábiles, contando las dos puntas
  });

  it('la duración cuenta días hábiles, así que un feriado no la infla', () => {
    const cal = indexarExcepciones([feriado('2026-09-16')], null);
    const r = resumenDeActividad(
      { startDate: '2026-09-14', daysPerUnit: 1, unitGroups: null },
      SEIS, null, cal,
    );
    expect(r.duracionDias).toBe(6);
    expect(claveDia(r.termino!)).toBe('2026-09-22');
  });

  it('sin programar informa cuántas unidades le tocarían', () => {
    const r = resumenDeActividad(
      { startDate: null, daysPerUnit: 1, unitGroups: null }, SEIS, null, SIN_FERIADOS,
    );
    expect(r.unidades).toBe(6);
    expect(r.inicio).toBeNull();
    expect(r.duracionDias).toBe(0);
  });
});

describe('actividadesDeObra', () => {
  const lista = [
    actividad({ id: 'b', sortOrder: 1 }),
    actividad({ id: 'a', sortOrder: 0 }),
    actividad({ id: 'x', sortOrder: 2, status: 'anulada' }),
    actividad({ id: 'y', sortOrder: 3, projectId: 'p2' }),
  ];

  it('filtra por obra y estado, y ordena por el recorrido', () => {
    expect(actividadesDeObra(lista, 'p1').map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('sin obra seleccionada devuelve vacío', () => {
    expect(actividadesDeObra(lista, null)).toEqual([]);
  });
});

describe('matrizDelTren', () => {
  it('arma una fila por actividad con sus celdas ya indexadas', () => {
    const filas = matrizDelTren([
      actividad({ id: 'a', name: 'Yeso', startDate: '2026-09-14', daysPerUnit: 1 }),
      actividad({ id: 'b', name: 'Cerámica', startDate: '2026-09-21', daysPerUnit: 1, sortOrder: 1 }),
    ], SEIS, null, SIN_FERIADOS);

    expect(filas).toHaveLength(2);
    expect(claveDia(filas[0].celdas.get('u0')!.inicio)).toBe('2026-09-14');
    expect(claveDia(filas[1].celdas.get('u0')!.inicio)).toBe('2026-09-21');
  });
});

describe('terminoDelTren', () => {
  it('es el término más tardío de todas las actividades', () => {
    const filas = matrizDelTren([
      actividad({ id: 'a', startDate: '2026-09-14', daysPerUnit: 1 }),
      actividad({ id: 'b', startDate: '2026-09-21', daysPerUnit: 1, sortOrder: 1 }),
    ], SEIS, null, SIN_FERIADOS);
    expect(claveDia(terminoDelTren(filas)!)).toBe('2026-09-28');
  });

  it('sin nada programado es null', () => {
    const filas = matrizDelTren([actividad({ id: 'a', startDate: null })], SEIS, null, SIN_FERIADOS);
    expect(terminoDelTren(filas)).toBeNull();
  });
});

describe('escalonarActividades', () => {
  const tres = [
    actividad({ id: 'a', sortOrder: 0 }),
    actividad({ id: 'b', sortOrder: 1 }),
    actividad({ id: 'c', sortOrder: 2 }),
  ];

  it('corre cada actividad el desfase en días hábiles', () => {
    const cambios = escalonarActividades(tres, '2026-09-14', 2, null, SIN_FERIADOS);
    expect(cambios).toEqual([
      { id: 'a', startDate: '2026-09-14' },
      { id: 'b', startDate: '2026-09-16' },
      { id: 'c', startDate: '2026-09-18' },
    ]);
  });

  it('el desfase también salta el fin de semana', () => {
    const cambios = escalonarActividades(tres, '2026-09-17', 2, null, SIN_FERIADOS);
    expect(cambios.map((c) => c.startDate))
      .toEqual(['2026-09-17', '2026-09-21', '2026-09-23']);
  });

  it('devuelve solo las que cambian, para no mandar updates de más', () => {
    const conFecha = [
      actividad({ id: 'a', sortOrder: 0, startDate: '2026-09-14' }),
      actividad({ id: 'b', sortOrder: 1, startDate: '2026-01-01' }),
    ];
    const cambios = escalonarActividades(conFecha, '2026-09-14', 1, null, SIN_FERIADOS);
    expect(cambios).toEqual([{ id: 'b', startDate: '2026-09-15' }]);
  });

  it('un desfase de cero deja a todas el mismo día', () => {
    const cambios = escalonarActividades(tres, '2026-09-14', 0, null, SIN_FERIADOS);
    expect(cambios.map((c) => c.startDate))
      .toEqual(['2026-09-14', '2026-09-14', '2026-09-14']);
  });
});

describe('estadoDeCelda', () => {
  const celda = (ini: string, fin: string) => ({
    inicio: new Date(`${ini}T00:00:00`), termino: new Date(`${fin}T00:00:00`),
  });

  it('lo que ya terminó es pasada', () => {
    expect(estadoDeCelda(celda('2026-09-10', '2026-09-11'), '2026-09-14')).toBe('pasada');
  });

  it('lo que está corriendo es hoy, aunque haya empezado antes', () => {
    expect(estadoDeCelda(celda('2026-09-14', '2026-09-14'), '2026-09-14')).toBe('hoy');
    expect(estadoDeCelda(celda('2026-09-11', '2026-09-15'), '2026-09-14')).toBe('hoy');
  });

  it('lo de los próximos días hábiles es próxima', () => {
    expect(estadoDeCelda(celda('2026-09-16', '2026-09-16'), '2026-09-14', null, SIN_FERIADOS))
      .toBe('proxima');
  });

  it('más allá de la semana de lookahead es futura', () => {
    expect(estadoDeCelda(celda('2026-10-20', '2026-10-20'), '2026-09-14', null, SIN_FERIADOS))
      .toBe('futura');
  });
});

describe('validarActividad', () => {
  it('acepta una actividad completa', () => {
    expect(validarActividad(
      { name: 'Cerámica', daysPerUnit: 1, unitGroups: null }, SEIS,
    )).toEqual([]);
  });

  it('exige nombre y ritmo mayor que cero', () => {
    const errores = validarActividad({ name: '  ', daysPerUnit: 0 }, SEIS);
    expect(errores).toHaveLength(2);
  });

  it('avisa si los grupos elegidos no tienen ninguna unidad', () => {
    const errores = validarActividad(
      { name: 'Cerámica', daysPerUnit: 1, unitGroups: ['PISO 99'] }, SEIS,
    );
    expect(errores.some((e) => e.includes('Ninguna unidad'))).toBe(true);
  });

  it('avisa —sin bloquear— cuando el inicio cae en un día que no se trabaja', () => {
    const errores = validarActividad(
      { name: 'Cerámica', daysPerUnit: 1, startDate: '2026-09-13' },
      SEIS, null, SIN_FERIADOS,
    );
    expect(errores).toHaveLength(1);
    expect(esSoloAviso(errores[0])).toBe(true);
  });

  it('un error de verdad no es un aviso', () => {
    expect(esSoloAviso('La actividad necesita un nombre.')).toBe(false);
  });
});

describe('ritmoEnPalabras', () => {
  it('traduce el ritmo a como se habla en obra', () => {
    expect(ritmoEnPalabras(0.5)).toBe('2 por día');
    expect(ritmoEnPalabras(0.25)).toBe('4 por día');
    expect(ritmoEnPalabras(1)).toBe('1 por día');
    expect(ritmoEnPalabras(2)).toBe('2 días c/u');
  });

  it('usa coma decimal, no punto', () => {
    expect(ritmoEnPalabras(2.5)).toBe('2,5 días c/u');
  });

  it('un ritmo inválido no dice nada en vez de mostrar NaN', () => {
    expect(ritmoEnPalabras(0)).toBe('');
    expect(ritmoEnPalabras(NaN)).toBe('');
  });
});
