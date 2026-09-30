import { describe, it, expect } from 'vitest';
import {
  ESCALA_AVANCE, comoPorcentaje, claveCelda, avanceVigente, progresosDeObra,
  progresosDelDia, avanceDeActividad, incrementoDelDia, rendimientoDeActividad,
  pendientesDeHoy, actividadesDeHoy, resumenDelDia, validarParte, esAviso,
} from './daily-report';
import { indexarExcepciones } from './work-calendar';
import { CAUSAS_CNC } from './last-planner';
import type {
  DailyProgress, TrainActivity, WorkUnit,
} from '@/modules/core/lib/data';

let secuencia = 0;

function parte(over: Partial<DailyProgress> & { activityId: string }): DailyProgress {
  secuencia++;
  return {
    id: `dp-${secuencia}`, tenantId: 't1', projectId: 'p1',
    unitId: 'u0', date: '2026-09-14', progress: 0,
    createdAt: new Date(2026, 8, 14, 12, secuencia),
    ...over,
  } as DailyProgress;
}

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

const SIN_FERIADOS = indexarExcepciones([], null);

const CUATRO = [
  unidad({ id: 'u0', name: '101', sortOrder: 0 }),
  unidad({ id: 'u1', name: '102', sortOrder: 1 }),
  unidad({ id: 'u2', name: '103', sortOrder: 2 }),
  unidad({ id: 'u3', name: '104', sortOrder: 3 }),
];

/* 2026-09-14 es lunes. */

describe('ESCALA_AVANCE', () => {
  it('son los seis pasos del Excel, no un deslizador continuo', () => {
    expect(ESCALA_AVANCE).toEqual([0, 0.2, 0.5, 0.75, 0.9, 1]);
  });
});

describe('comoPorcentaje', () => {
  it('redondea a entero', () => {
    expect(comoPorcentaje(0.75)).toBe(75);
    expect(comoPorcentaje(0.333)).toBe(33);
  });
  it('recorta fuera de rango en vez de mostrar 140%', () => {
    expect(comoPorcentaje(1.4)).toBe(100);
    expect(comoPorcentaje(-0.2)).toBe(0);
  });
});

describe('avanceVigente', () => {
  it('se queda con el parte más reciente de cada unidad', () => {
    const vigentes = avanceVigente([
      parte({ activityId: 'a', unitId: 'u0', date: '2026-09-14', progress: 0.5 }),
      parte({ activityId: 'a', unitId: 'u0', date: '2026-09-16', progress: 0.9 }),
      parte({ activityId: 'a', unitId: 'u0', date: '2026-09-15', progress: 0.75 }),
    ]);
    expect(vigentes.get(claveCelda('a', 'u0'))!.progress).toBe(0.9);
  });

  it('no mezcla actividades ni unidades distintas', () => {
    const vigentes = avanceVigente([
      parte({ activityId: 'a', unitId: 'u0', progress: 0.5 }),
      parte({ activityId: 'b', unitId: 'u0', progress: 1 }),
      parte({ activityId: 'a', unitId: 'u1', progress: 0.2 }),
    ]);
    expect(vigentes.size).toBe(3);
    expect(vigentes.get(claveCelda('a', 'u0'))!.progress).toBe(0.5);
    expect(vigentes.get(claveCelda('b', 'u0'))!.progress).toBe(1);
  });

  it('maneja actividades sin unidad física', () => {
    const vigentes = avanceVigente([
      parte({ activityId: 'a', unitId: null, progress: 0.4 }),
    ]);
    expect(vigentes.get(claveCelda('a', null))!.progress).toBe(0.4);
  });
});

describe('progresosDeObra / progresosDelDia', () => {
  const lista = [
    parte({ activityId: 'a', date: '2026-09-14' }),
    parte({ activityId: 'a', date: '2026-09-16' }),
    parte({ activityId: 'a', date: '2026-09-15', projectId: 'p2' }),
  ];

  it('filtra por obra y ordena de la más nueva a la más vieja', () => {
    const r = progresosDeObra(lista, 'p1');
    expect(r).toHaveLength(2);
    expect(r[0].date).toBe('2026-09-16');
  });

  it('sin obra devuelve vacío', () => {
    expect(progresosDeObra(lista, null)).toEqual([]);
  });

  it('filtra por día', () => {
    expect(progresosDelDia(lista, '2026-09-14')).toHaveLength(1);
  });
});

describe('avanceDeActividad', () => {
  it('promedia contando como cero las unidades sin parte', () => {
    const vigentes = avanceVigente([
      parte({ activityId: 'a', unitId: 'u0', progress: 1 }),
      parte({ activityId: 'a', unitId: 'u1', progress: 1 }),
    ]);
    const r = avanceDeActividad({ id: 'a', unitGroups: null }, CUATRO, vigentes);
    expect(r.avance).toBe(0.5); // 2 de 4 unidades listas
    expect(r.conParte).toBe(2);
    expect(r.total).toBe(4);
  });

  it('sin ningún parte el avance es cero, no NaN', () => {
    const r = avanceDeActividad({ id: 'a', unitGroups: null }, CUATRO, new Map());
    expect(r.avance).toBe(0);
  });

  it('sin unidades que recorrer no divide por cero', () => {
    const r = avanceDeActividad({ id: 'a', unitGroups: ['PISO 99'] }, CUATRO, new Map());
    expect(r).toEqual({ avance: 0, conParte: 0, total: 0 });
  });
});

describe('incrementoDelDia', () => {
  it('el primer parte de una unidad cuenta entero', () => {
    const p = parte({ activityId: 'a', unitId: 'u0', date: '2026-09-14', progress: 0.5 });
    expect(incrementoDelDia(p, [p])).toBe(0.5);
  });

  it('resta contra el parte anterior', () => {
    const ayer = parte({ activityId: 'a', unitId: 'u0', date: '2026-09-14', progress: 0.5 });
    const hoy = parte({ activityId: 'a', unitId: 'u0', date: '2026-09-15', progress: 0.9 });
    expect(incrementoDelDia(hoy, [ayer, hoy])).toBeCloseTo(0.4, 5);
  });

  it('no se confunde con partes de otra unidad', () => {
    const otra = parte({ activityId: 'a', unitId: 'u1', date: '2026-09-14', progress: 0.9 });
    const hoy = parte({ activityId: 'a', unitId: 'u0', date: '2026-09-15', progress: 0.5 });
    expect(incrementoDelDia(hoy, [otra, hoy])).toBe(0.5);
  });

  it('una corrección a la baja da negativo, no cero', () => {
    const ayer = parte({ activityId: 'a', unitId: 'u0', date: '2026-09-14', progress: 0.9 });
    const hoy = parte({ activityId: 'a', unitId: 'u0', date: '2026-09-15', progress: 0.5 });
    expect(incrementoDelDia(hoy, [ayer, hoy])).toBeCloseTo(-0.4, 5);
  });
});

describe('rendimientoDeActividad', () => {
  it('divide unidades equivalentes por jornadas', () => {
    const progresos = [
      parte({ activityId: 'a', unitId: 'u0', date: '2026-09-14', progress: 1, crewDays: 2 }),
      parte({ activityId: 'a', unitId: 'u1', date: '2026-09-15', progress: 1, crewDays: 2 }),
    ];
    const r = rendimientoDeActividad(
      'a', progresos, avanceVigente(progresos), CUATRO, { id: 'a', unitGroups: null },
    );
    expect(r.unidades).toBe(2);
    expect(r.jornadas).toBe(4);
    expect(r.rendimiento).toBe(0.5); // media unidad por jornada
  });

  it('suma las jornadas de todos los días, no solo del último parte', () => {
    const progresos = [
      parte({ activityId: 'a', unitId: 'u0', date: '2026-09-14', progress: 0.5, crewDays: 1 }),
      parte({ activityId: 'a', unitId: 'u0', date: '2026-09-15', progress: 1, crewDays: 3 }),
    ];
    const r = rendimientoDeActividad(
      'a', progresos, avanceVigente(progresos), CUATRO, { id: 'a', unitGroups: null },
    );
    expect(r.jornadas).toBe(4);
    expect(r.unidades).toBe(1); // el acumulado, no 1.5
  });

  it('sin jornadas cargadas devuelve null, no cero', () => {
    const progresos = [parte({ activityId: 'a', unitId: 'u0', progress: 1 })];
    const r = rendimientoDeActividad(
      'a', progresos, avanceVigente(progresos), CUATRO, { id: 'a', unitGroups: null },
    );
    expect(r.rendimiento).toBeNull();
  });
});

describe('pendientesDeHoy', () => {
  const act = { id: 'a', startDate: '2026-09-14', daysPerUnit: 1, unitGroups: null };

  it('muestra solo lo que el tren ya programó hasta hoy', () => {
    // Lunes 14: solo le toca la primera unidad.
    const p = pendientesDeHoy(act, CUATRO, new Map(), [], '2026-09-14', null, SIN_FERIADOS);
    expect(p.map((x) => x.unidad.id)).toEqual(['u0']);
  });

  it('acumula las de días anteriores que siguen sin terminar', () => {
    // Miércoles 16: le tocaron u0, u1 y u2.
    const p = pendientesDeHoy(act, CUATRO, new Map(), [], '2026-09-16', null, SIN_FERIADOS);
    expect(p.map((x) => x.unidad.id)).toEqual(['u0', 'u1', 'u2']);
  });

  it('saca de la lista las que ya están terminadas', () => {
    const progresos = [parte({ activityId: 'a', unitId: 'u0', date: '2026-09-14', progress: 1 })];
    const p = pendientesDeHoy(
      act, CUATRO, avanceVigente(progresos), progresos, '2026-09-16', null, SIN_FERIADOS,
    );
    expect(p.map((x) => x.unidad.id)).toEqual(['u1', 'u2']);
  });

  it('deja la terminada HOY para poder corregirse', () => {
    const progresos = [parte({ activityId: 'a', unitId: 'u0', date: '2026-09-16', progress: 1 })];
    const p = pendientesDeHoy(
      act, CUATRO, avanceVigente(progresos), progresos, '2026-09-16', null, SIN_FERIADOS,
    );
    expect(p.find((x) => x.unidad.id === 'u0')?.reportadaHoy).toBe(true);
  });

  it('marca como atrasadas las que el tren ya daba por hechas', () => {
    const p = pendientesDeHoy(act, CUATRO, new Map(), [], '2026-09-16', null, SIN_FERIADOS);
    expect(p.find((x) => x.unidad.id === 'u0')?.atrasada).toBe(true);
    expect(p.find((x) => x.unidad.id === 'u2')?.atrasada).toBe(false);
  });

  it('pone las atrasadas primero: son las que hay que preguntar', () => {
    const p = pendientesDeHoy(act, CUATRO, new Map(), [], '2026-09-16', null, SIN_FERIADOS);
    expect(p[0].atrasada).toBe(true);
    expect(p[p.length - 1].atrasada).toBe(false);
  });

  it('sin fecha de inicio no pide nada: la actividad no está programada', () => {
    const p = pendientesDeHoy(
      { ...act, startDate: null }, CUATRO, new Map(), [], '2026-09-16', null, SIN_FERIADOS,
    );
    expect(p).toEqual([]);
  });

  it('trae el avance vigente para precargar el botón', () => {
    const progresos = [parte({ activityId: 'a', unitId: 'u0', date: '2026-09-14', progress: 0.5 })];
    const p = pendientesDeHoy(
      act, CUATRO, avanceVigente(progresos), progresos, '2026-09-16', null, SIN_FERIADOS,
    );
    expect(p.find((x) => x.unidad.id === 'u0')?.avance).toBe(0.5);
  });
});

describe('actividadesDeHoy', () => {
  const actividades = [
    actividad({ id: 'a', name: 'Yeso', startDate: '2026-09-14', responsibleName: 'RIZIERI' }),
    actividad({ id: 'b', name: 'Cerámica', startDate: '2026-09-14', responsibleName: 'PACAL', sortOrder: 1 }),
    actividad({ id: 'c', name: 'Pintura', startDate: null, sortOrder: 2 }),
  ];

  it('deja fuera las que no tienen nada que reportar hoy', () => {
    const r = actividadesDeHoy(
      actividades, CUATRO, new Map(), [], '2026-09-14', null, SIN_FERIADOS,
    );
    expect(r.map((x) => x.actividad.id)).toEqual(['a', 'b']);
  });

  it('con responsable muestra solo lo de esa cuadrilla', () => {
    const r = actividadesDeHoy(
      actividades, CUATRO, new Map(), [], '2026-09-14', null, SIN_FERIADOS, 'pacal',
    );
    expect(r.map((x) => x.actividad.id)).toEqual(['b']);
  });
});

describe('resumenDelDia', () => {
  it('suma incrementos, jornadas y terminadas del día', () => {
    const progresos = [
      parte({ activityId: 'a', unitId: 'u0', date: '2026-09-14', progress: 0.5, crewDays: 2 }),
      parte({ activityId: 'a', unitId: 'u0', date: '2026-09-15', progress: 1, crewDays: 2 }),
      parte({ activityId: 'a', unitId: 'u1', date: '2026-09-15', progress: 0.5, crewDays: 1 }),
    ];
    const r = resumenDelDia(progresos, '2026-09-15', CAUSAS_CNC);
    expect(r.reportes).toBe(2);
    expect(r.avanceEquivalente).toBeCloseTo(1.0, 5); // 0.5 de u0 + 0.5 de u1
    expect(r.jornadas).toBe(3);
    expect(r.terminadas).toBe(1);
  });

  it('ordena las causas de la que más se repite a la que menos', () => {
    const progresos = [
      parte({ activityId: 'a', unitId: 'u0', date: '2026-09-15', progress: 0, causeCode: 'materiales' }),
      parte({ activityId: 'a', unitId: 'u1', date: '2026-09-15', progress: 0, causeCode: 'materiales' }),
      parte({ activityId: 'a', unitId: 'u2', date: '2026-09-15', progress: 0, causeCode: 'cancha' }),
    ];
    const r = resumenDelDia(progresos, '2026-09-15', CAUSAS_CNC);
    expect(r.sinAvance).toBe(3);
    expect(r.causas[0]).toMatchObject({ code: 'materiales', veces: 2 });
    expect(r.causas[1]).toMatchObject({ code: 'cancha', veces: 1 });
  });

  it('un día sin partes da todo en cero, no explota', () => {
    const r = resumenDelDia([], '2026-09-15', CAUSAS_CNC);
    expect(r).toMatchObject({ reportes: 0, jornadas: 0, terminadas: 0, causas: [] });
  });
});

describe('validarParte', () => {
  it('acepta un avance normal', () => {
    expect(validarParte({ progress: 0.5, avanceAnterior: 0.2 })).toEqual([]);
  });

  /* La regla que importa: sin avance hay que decir por qué, o el parte no
     sirve para nada. */
  it('exige causa cuando no avanzó', () => {
    const errores = validarParte({ progress: 0.5, avanceAnterior: 0.5 });
    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('elige por qué');
  });

  it('con causa, un parte sin avance se acepta', () => {
    expect(validarParte({
      progress: 0, avanceAnterior: 0, causeCode: 'materiales',
    })).toEqual([]);
  });

  it('rechaza un avance fuera de rango', () => {
    expect(validarParte({ progress: 1.5 }).some((e) => e.includes('entre 0%'))).toBe(true);
  });

  it('rechaza jornadas negativas', () => {
    expect(validarParte({
      progress: 1, crewDays: -2,
    }).some((e) => e.includes('negativas'))).toBe(true);
  });

  it('avisa —sin bloquear— cuando se corrige a la baja', () => {
    const errores = validarParte({
      progress: 0.2, avanceAnterior: 0.9, causeCode: 'materiales',
    });
    expect(errores).toHaveLength(1);
    expect(esAviso(errores[0])).toBe(true);
  });

  it('un error de verdad no es aviso', () => {
    expect(esAviso('El avance tiene que estar entre 0% y 100%.')).toBe(false);
  });
});
