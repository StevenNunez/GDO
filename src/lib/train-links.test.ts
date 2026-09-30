import { describe, it, expect } from 'vitest';
import {
  avancesParaEDT, propuestasConAvance, porcentajeDePropuesta,
  compromisosDelTren, cierreDesdeElParte, borradorDelDia, asientoDeAvance,
} from './train-links';
import { indexarExcepciones } from './work-calendar';
import { CAUSAS_CNC } from './last-planner';
import type {
  DailyProgress, LookaheadTask, TrainActivity, WorkItem, WorkUnit,
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

function partida(over: Partial<WorkItem> & { id: string }): WorkItem {
  return {
    tenantId: 't1', projectId: 'p1', name: 'Cerámica de piso', type: 'task',
    status: 'in-progress', parentId: 'raiz', path: 'raiz', progress: 0,
    unit: 'm2', quantity: 100, unitPrice: 0,
    ...over,
  } as WorkItem;
}

function tarea(over: Partial<LookaheadTask> & { id: string }): LookaheadTask {
  return {
    tenantId: 't1', projectId: 'p1', name: 'Tarea', weekStart: '2026-09-14',
    quantityPlanned: 0, quantityDone: 0, status: 'comprometida',
    createdAt: new Date(),
    ...over,
  } as LookaheadTask;
}

const SIN_FERIADOS = indexarExcepciones([], null);

const CUATRO = [
  unidad({ id: 'u0', name: '101', sortOrder: 0 }),
  unidad({ id: 'u1', name: '102', sortOrder: 1 }),
  unidad({ id: 'u2', name: '103', sortOrder: 2 }),
  unidad({ id: 'u3', name: '104', sortOrder: 3 }),
];

/* 2026-09-14 es lunes; 2026-09-20 el domingo de esa misma semana. */

/* ── Avance para la EDT ───────────────────────────────────────────────── */

describe('avancesParaEDT', () => {
  it('deja fuera las actividades sin partida enlazada', () => {
    const acts = [actividad({ id: 'a1', workItemId: null })];
    expect(avancesParaEDT(acts, CUATRO, [], [partida({ id: 'w1' })])).toEqual([]);
  });

  it('prorratea sobre la cantidad de la partida cuando no hay cubicación', () => {
    const acts = [actividad({ id: 'a1', workItemId: 'w1' })];
    const progresos = [
      parte({ activityId: 'a1', unitId: 'u0', progress: 1 }),
      parte({ activityId: 'a1', unitId: 'u1', progress: 0.5 }),
    ];
    const [p] = avancesParaEDT(acts, CUATRO, progresos, [partida({ id: 'w1', quantity: 200 })]);

    // 1,5 de 4 unidades = 37,5% → 75 m2 de 200.
    expect(p.equivalentes).toBe(1.5);
    expect(p.totalUnidades).toBe(4);
    expect(p.fraccion).toBeCloseTo(0.375);
    expect(p.cantidadEjecutada).toBeCloseTo(75);
    expect(porcentajeDePropuesta(p)).toBe(38);
  });

  it('usa la cubicación por unidad cuando todas las actividades la tienen', () => {
    const acts = [actividad({ id: 'a1', workItemId: 'w1', quantityPerUnit: 45 })];
    const progresos = [parte({ activityId: 'a1', unitId: 'u0', progress: 1 })];
    const [p] = avancesParaEDT(acts, CUATRO, progresos, [partida({ id: 'w1', quantity: 180 })]);
    expect(p.cantidadEjecutada).toBeCloseTo(45);
  });

  it('prorratea todo si ALGUNA actividad de la partida no tiene cubicación', () => {
    const acts = [
      actividad({ id: 'a1', name: 'Cerámica', workItemId: 'w1', quantityPerUnit: 45 }),
      actividad({ id: 'a2', name: 'Fragüe', workItemId: 'w1' }),
    ];
    const progresos = [parte({ activityId: 'a1', unitId: 'u0', progress: 1 })];
    const [p] = avancesParaEDT(acts, CUATRO, progresos, [partida({ id: 'w1', quantity: 800 })]);

    // 1 unidad equivalente sobre 8 recorridos (4 + 4) = 12,5% de 800.
    expect(p.totalUnidades).toBe(8);
    expect(p.cantidadEjecutada).toBeCloseTo(100);
    expect(p.actividades).toHaveLength(2);
  });

  it('descuenta lo que la EDT ya tiene registrado', () => {
    const acts = [actividad({ id: 'a1', workItemId: 'w1' })];
    const progresos = [
      parte({ activityId: 'a1', unitId: 'u0', progress: 1 }),
      parte({ activityId: 'a1', unitId: 'u1', progress: 1 }),
    ];
    // La partida ya declara 25% de 100 m2 = 25 m2 registrados; el tren dice 50.
    const [p] = avancesParaEDT(acts, CUATRO, progresos, [partida({ id: 'w1', progress: 25 })]);
    expect(p.cantidadRegistrada).toBeCloseTo(25);
    expect(p.porRegistrar).toBeCloseTo(25);
    expect(p.adelantada).toBe(false);
  });

  it('nunca propone cantidades negativas: marca la partida como adelantada', () => {
    const acts = [actividad({ id: 'a1', workItemId: 'w1' })];
    const progresos = [parte({ activityId: 'a1', unitId: 'u0', progress: 1 })];
    // La EDT va en 80% y el tren en 25%: alguien registró avance a mano.
    const [p] = avancesParaEDT(acts, CUATRO, progresos, [partida({ id: 'w1', progress: 80 })]);
    expect(p.porRegistrar).toBe(0);
    expect(p.adelantada).toBe(true);
  });

  it('el avance vigente de una unidad es su parte más reciente, no la suma', () => {
    const acts = [actividad({ id: 'a1', workItemId: 'w1' })];
    const progresos = [
      parte({ activityId: 'a1', unitId: 'u0', date: '2026-09-14', progress: 0.5 }),
      parte({ activityId: 'a1', unitId: 'u0', date: '2026-09-15', progress: 0.9 }),
    ];
    const [p] = avancesParaEDT(acts, CUATRO, progresos, [partida({ id: 'w1' })]);
    expect(p.equivalentes).toBeCloseTo(0.9);
  });

  it('ignora las actividades anuladas', () => {
    const acts = [actividad({ id: 'a1', workItemId: 'w1', status: 'anulada' })];
    const progresos = [parte({ activityId: 'a1', unitId: 'u0', progress: 1 })];
    expect(avancesParaEDT(acts, CUATRO, progresos, [partida({ id: 'w1' })])).toEqual([]);
  });

  it('propuestasConAvance deja fuera el ruido de redondeo', () => {
    const acts = [actividad({ id: 'a1', workItemId: 'w1' })];
    const progresos = [parte({ activityId: 'a1', unitId: 'u0', progress: 1 })];
    // 25% exacto ya registrado: no queda nada por registrar.
    const todas = avancesParaEDT(acts, CUATRO, progresos, [partida({ id: 'w1', progress: 25 })]);
    expect(todas).toHaveLength(1);
    expect(propuestasConAvance(todas)).toEqual([]);
  });
});

/* ── Compromisos desde el tren ────────────────────────────────────────── */

describe('compromisosDelTren', () => {
  const acts = [actividad({ id: 'a1', startDate: '2026-09-14', daysPerUnit: 1 })];

  it('toma las unidades que TERMINAN dentro de la semana', () => {
    const [c] = compromisosDelTren(acts, CUATRO, '2026-09-14', null, SIN_FERIADOS, []);
    expect(c.unidades.map((u) => u.name)).toEqual(['101', '102', '103', '104']);
    expect(c.quantityPlanned).toBe(4);
    expect(c.unit).toBe('un');
  });

  it('nombra el compromiso con el rango de unidades', () => {
    const [c] = compromisosDelTren(acts, CUATRO, '2026-09-14', null, SIN_FERIADOS, []);
    expect(c.name).toBe('Cerámica · 101 a 104 (4 unidades)');
  });

  it('con una sola unidad no inventa un rango', () => {
    const unaSola = [unidad({ id: 'u0', name: '101', sortOrder: 0 })];
    const [c] = compromisosDelTren(acts, unaSola, '2026-09-14', null, SIN_FERIADOS, []);
    expect(c.name).toBe('Cerámica · 101');
  });

  it('la cantidad va en la cubicación de la actividad cuando la tiene', () => {
    const conCubicacion = [actividad({
      id: 'a1', startDate: '2026-09-14', daysPerUnit: 1, quantityPerUnit: 45, unit: 'm2',
    })];
    const [c] = compromisosDelTren(conCubicacion, CUATRO, '2026-09-14', null, SIN_FERIADOS, []);
    expect(c.quantityPlanned).toBe(180);
    expect(c.unit).toBe('m2');
  });

  it('no propone actividades a las que no les toca nada esa semana', () => {
    expect(compromisosDelTren(acts, CUATRO, '2026-09-28', null, SIN_FERIADOS, [])).toEqual([]);
  });

  it('marca las que ya se generaron para esa semana', () => {
    const existentes = [tarea({ id: 't1', trainActivityId: 'a1', weekStart: '2026-09-14' })];
    const [c] = compromisosDelTren(acts, CUATRO, '2026-09-14', null, SIN_FERIADOS, existentes);
    expect(c.yaExiste).toBe(true);
  });

  it('una tarea de OTRA semana no bloquea la generación de esta', () => {
    const existentes = [tarea({ id: 't1', trainActivityId: 'a1', weekStart: '2026-09-07' })];
    const [c] = compromisosDelTren(acts, CUATRO, '2026-09-14', null, SIN_FERIADOS, existentes);
    expect(c.yaExiste).toBe(false);
  });

  it('una tarea escrita a mano no cuenta como generada', () => {
    const existentes = [tarea({ id: 't1', trainActivityId: null, weekStart: '2026-09-14' })];
    const [c] = compromisosDelTren(acts, CUATRO, '2026-09-14', null, SIN_FERIADOS, existentes);
    expect(c.yaExiste).toBe(false);
  });

  it('la semana se normaliza al lunes: da igual qué día se pase', () => {
    const lunes = compromisosDelTren(acts, CUATRO, '2026-09-14', null, SIN_FERIADOS, []);
    const jueves = compromisosDelTren(acts, CUATRO, '2026-09-17', null, SIN_FERIADOS, []);
    expect(jueves).toEqual(lunes);
  });

  it('ignora las actividades anuladas y las que no tienen fecha de inicio', () => {
    const otras = [
      actividad({ id: 'a2', startDate: '2026-09-14', status: 'anulada' }),
      actividad({ id: 'a3', startDate: null }),
    ];
    expect(compromisosDelTren(otras, CUATRO, '2026-09-14', null, SIN_FERIADOS, [])).toEqual([]);
  });
});

/* ── Cierre de la semana con el parte diario ──────────────────────────── */

describe('cierreDesdeElParte', () => {
  const acts = [actividad({ id: 'a1', startDate: '2026-09-14', daysPerUnit: 1 })];
  const compromiso = tarea({ id: 't1', trainActivityId: 'a1', weekStart: '2026-09-14' });

  it('no sugiere nada para una tarea escrita a mano', () => {
    const suelta = tarea({ id: 't2', trainActivityId: null });
    expect(cierreDesdeElParte(suelta, acts, CUATRO, [], null, SIN_FERIADOS)).toBeNull();
  });

  it('cumplida solo si TODAS las unidades de la semana quedaron terminadas', () => {
    const progresos = CUATRO.map((u) =>
      parte({ activityId: 'a1', unitId: u.id, date: '2026-09-17', progress: 1 }));
    const c = cierreDesdeElParte(compromiso, acts, CUATRO, progresos, null, SIN_FERIADOS)!;
    expect(c.comprometidas).toBe(4);
    expect(c.hechas).toBe(4);
    expect(c.cumplida).toBe(true);
  });

  it('«casi» es no cumplido', () => {
    const progresos = [
      parte({ activityId: 'a1', unitId: 'u0', date: '2026-09-15', progress: 1 }),
      parte({ activityId: 'a1', unitId: 'u1', date: '2026-09-16', progress: 1 }),
      parte({ activityId: 'a1', unitId: 'u2', date: '2026-09-17', progress: 0.9 }),
    ];
    const c = cierreDesdeElParte(compromiso, acts, CUATRO, progresos, null, SIN_FERIADOS)!;
    expect(c.cumplida).toBe(false);
    expect(c.hechas).toBeCloseTo(2.9);
  });

  it('mira el avance AL DOMINGO, no el de hoy', () => {
    const progresos = [
      parte({ activityId: 'a1', unitId: 'u0', date: '2026-09-18', progress: 0.5 }),
      // Se terminó el martes SIGUIENTE: no cuenta para esta semana.
      parte({ activityId: 'a1', unitId: 'u0', date: '2026-09-22', progress: 1 }),
    ];
    const c = cierreDesdeElParte(compromiso, acts, CUATRO, progresos, null, SIN_FERIADOS)!;
    expect(c.hechas).toBeCloseTo(0.5);
  });

  it('la cantidad ejecutada usa la cubicación de la actividad', () => {
    const conCubicacion = [actividad({
      id: 'a1', startDate: '2026-09-14', daysPerUnit: 1, quantityPerUnit: 45,
    })];
    const progresos = [
      parte({ activityId: 'a1', unitId: 'u0', date: '2026-09-15', progress: 1 }),
      parte({ activityId: 'a1', unitId: 'u1', date: '2026-09-16', progress: 1 }),
    ];
    const c = cierreDesdeElParte(compromiso, conCubicacion, CUATRO, progresos, null, SIN_FERIADOS)!;
    expect(c.quantityDone).toBeCloseTo(90);
  });

  it('sugiere la causa que más se repitió esa semana', () => {
    const progresos = [
      parte({ activityId: 'a1', unitId: 'u0', date: '2026-09-15', progress: 0, causeCode: 'materiales' }),
      parte({ activityId: 'a1', unitId: 'u1', date: '2026-09-16', progress: 0, causeCode: 'materiales' }),
      parte({ activityId: 'a1', unitId: 'u2', date: '2026-09-17', progress: 0, causeCode: 'cancha' }),
    ];
    const c = cierreDesdeElParte(compromiso, acts, CUATRO, progresos, null, SIN_FERIADOS)!;
    expect(c.causaSugerida).toBe('materiales');
    expect(c.cumplida).toBe(false);
  });

  it('sin partes esa semana avisa que no hay datos', () => {
    const c = cierreDesdeElParte(compromiso, acts, CUATRO, [], null, SIN_FERIADOS)!;
    expect(c.conDatos).toBe(false);
    expect(c.hechas).toBe(0);
  });
});

/* ── Bitácora y libro de obra ─────────────────────────────────────────── */

describe('borradorDelDia', () => {
  const acts = [
    actividad({ id: 'a1', name: 'Cerámica', responsibleName: 'PACAL' }),
    actividad({ id: 'a2', name: 'Yeso' }),
  ];

  it('sin partes no hay nada que traspasar', () => {
    const b = borradorDelDia('2026-09-14', acts, CUATRO, [], CAUSAS_CNC);
    expect(b.hayDatos).toBe(false);
    expect(b.trabajos).toBe('');
  });

  it('agrupa por actividad y nombra las unidades que avanzaron', () => {
    const progresos = [
      parte({ activityId: 'a1', unitId: 'u0', date: '2026-09-14', progress: 1 }),
      parte({ activityId: 'a1', unitId: 'u1', date: '2026-09-14', progress: 0.5 }),
    ];
    const b = borradorDelDia('2026-09-14', acts, CUATRO, progresos, CAUSAS_CNC);
    expect(b.trabajos).toBe('Cerámica (PACAL): avance en 101, 102. Se terminaron 1 unidad(es).');
    expect(b.terminadas).toBe(1);
    expect(b.avanceEquivalente).toBeCloseTo(1.5);
  });

  it('cuenta el incremento del día, no el acumulado', () => {
    const progresos = [
      parte({ activityId: 'a1', unitId: 'u0', date: '2026-09-14', progress: 0.5 }),
      parte({ activityId: 'a1', unitId: 'u0', date: '2026-09-15', progress: 0.9 }),
    ];
    const b = borradorDelDia('2026-09-15', acts, CUATRO, progresos, CAUSAS_CNC);
    expect(b.avanceEquivalente).toBeCloseTo(0.4);
  });

  it('lo que no avanzó va a incidencias, con su causa y su nota', () => {
    const progresos = [
      parte({
        activityId: 'a2', unitId: 'u2', date: '2026-09-14', progress: 0,
        causeCode: 'materiales', notes: 'no llegó el yeso',
      }),
    ];
    const b = borradorDelDia('2026-09-14', acts, CUATRO, progresos, CAUSAS_CNC);
    expect(b.incidencias).toContain('Yeso · 103');
    expect(b.incidencias).toContain(CAUSAS_CNC.materiales);
    expect(b.incidencias).toContain('no llegó el yeso');
    expect(b.trabajos).toBe('');
  });

  it('suma las jornadas del día y las redondea', () => {
    const progresos = [
      parte({ activityId: 'a1', unitId: 'u0', date: '2026-09-14', progress: 1, crewDays: 2.5 }),
      parte({ activityId: 'a2', unitId: 'u1', date: '2026-09-14', progress: 1, crewDays: 3 }),
    ];
    const b = borradorDelDia('2026-09-14', acts, CUATRO, progresos, CAUSAS_CNC);
    expect(b.jornadas).toBe(6);
  });

  it('solo mira el día pedido', () => {
    const progresos = [
      parte({ activityId: 'a1', unitId: 'u0', date: '2026-09-14', progress: 1 }),
      parte({ activityId: 'a1', unitId: 'u1', date: '2026-09-15', progress: 1 }),
    ];
    const b = borradorDelDia('2026-09-15', acts, CUATRO, progresos, CAUSAS_CNC);
    expect(b.trabajos).toContain('102');
    expect(b.trabajos).not.toContain('101');
  });
});

describe('asientoDeAvance', () => {
  it('parte con los números del día y agrega las dos secciones', () => {
    const acts = [actividad({ id: 'a1', name: 'Cerámica' })];
    const progresos = [
      parte({ activityId: 'a1', unitId: 'u0', date: '2026-09-14', progress: 1, crewDays: 4 }),
      parte({
        activityId: 'a1', unitId: 'u1', date: '2026-09-14', progress: 0,
        causeCode: 'cancha',
      }),
    ];
    const b = borradorDelDia('2026-09-14', acts, CUATRO, progresos, CAUSAS_CNC);
    const texto = asientoDeAvance('2026-09-14', b);

    expect(texto).toContain('Avance del día 2026-09-14');
    expect(texto).toContain('1 unidad(es) terminada(s)');
    expect(texto).toContain('4 jornada(s)');
    expect(texto).toContain('Trabajos ejecutados:');
    expect(texto).toContain('Sin avance:');
  });

  it('sin jornadas cargadas no las menciona', () => {
    const acts = [actividad({ id: 'a1' })];
    const progresos = [parte({ activityId: 'a1', unitId: 'u0', date: '2026-09-14', progress: 1 })];
    const b = borradorDelDia('2026-09-14', acts, CUATRO, progresos, CAUSAS_CNC);
    expect(asientoDeAvance('2026-09-14', b)).not.toContain('jornada');
  });
});
