import { describe, it, expect } from 'vitest';
import {
  avanceVigenteA, curvaDeActividad, desviacionDeActividad,
  rendimientoPorResponsable, paretoDiario, serieDiaria, resumenDelTren,
} from './train-analytics';
import { indexarExcepciones, claveDia } from './work-calendar';
import { claveCelda } from './daily-report';
import type { DailyProgress, TrainActivity, WorkUnit } from '@/modules/core/lib/data';

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

/* Cinco unidades, un día por unidad, arrancando el lunes 2026-09-14. */
const CINCO = [
  unidad({ id: 'u0', name: '101', sortOrder: 0 }),
  unidad({ id: 'u1', name: '102', sortOrder: 1 }),
  unidad({ id: 'u2', name: '103', sortOrder: 2 }),
  unidad({ id: 'u3', name: '104', sortOrder: 3 }),
  unidad({ id: 'u4', name: '105', sortOrder: 4 }),
];

const ACT = { id: 'a', startDate: '2026-09-14', daysPerUnit: 1, unitGroups: null };

describe('avanceVigenteA', () => {
  const progresos = [
    parte({ activityId: 'a', unitId: 'u0', date: '2026-09-14', progress: 0.5 }),
    parte({ activityId: 'a', unitId: 'u0', date: '2026-09-18', progress: 1 }),
  ];

  it('ignora lo reportado DESPUÉS de la fecha', () => {
    const al15 = avanceVigenteA(progresos, '2026-09-15');
    expect(al15.get(claveCelda('a', 'u0'))!.progress).toBe(0.5);
  });

  it('incluye lo del mismo día', () => {
    const al18 = avanceVigenteA(progresos, '2026-09-18');
    expect(al18.get(claveCelda('a', 'u0'))!.progress).toBe(1);
  });

  it('antes del primer parte no hay nada', () => {
    expect(avanceVigenteA(progresos, '2026-09-01').size).toBe(0);
  });
});

describe('curvaDeActividad', () => {
  it('el programado acumula las unidades que ya deberían estar listas', () => {
    const puntos = curvaDeActividad(
      ACT, CINCO, [], null, SIN_FERIADOS, '2026-10-30',
    );
    // Semana del 14 al 20: terminan las 5 unidades (lun a vie).
    expect(puntos[0].programado).toBe(5);
    expect(claveDia(puntos[0].fecha)).toBe('2026-09-20');
  });

  it('el real usa el avance de ESA semana, no el de hoy', () => {
    const progresos = [
      parte({ activityId: 'a', unitId: 'u0', date: '2026-09-15', progress: 1 }),
      parte({ activityId: 'a', unitId: 'u1', date: '2026-09-28', progress: 1 }),
    ];
    // Actividad más larga para tener varias semanas.
    const lenta = { ...ACT, daysPerUnit: 3 };
    const puntos = curvaDeActividad(lenta, CINCO, progresos, null, SIN_FERIADOS, '2026-10-30');
    // Al cierre de la primera semana solo estaba lista u0.
    expect(puntos[0].real).toBe(1);
    // Y más adelante, dos.
    expect(puntos[puntos.length - 1].real).toBe(2);
  });

  it('las semanas futuras dejan el real en null, no en cero', () => {
    const lenta = { ...ACT, daysPerUnit: 5 };
    const puntos = curvaDeActividad(lenta, CINCO, [], null, SIN_FERIADOS, '2026-09-16');
    expect(puntos[0].real).toBe(0);
    expect(puntos[puntos.length - 1].real).toBeNull();
  });

  it('sin fecha de inicio no hay curva', () => {
    expect(curvaDeActividad(
      { ...ACT, startDate: null }, CINCO, [], null, SIN_FERIADOS,
    )).toEqual([]);
  });
});

describe('desviacionDeActividad', () => {
  it('sin partes, todo lo programado está atrasado', () => {
    // Al miércoles 16 deberían estar listas u0, u1 y u2.
    const d = desviacionDeActividad(ACT, CINCO, [], null, SIN_FERIADOS, '2026-09-16');
    expect(d.programadas).toBe(3);
    expect(d.reales).toBe(0);
    expect(d.diferencia).toBe(-3);
    expect(d.diasDeAtraso).toBe(-3); // un día por unidad
  });

  it('traduce el atraso a días usando el ritmo', () => {
    // Dos unidades por día: ir 3 unidades atrás es día y medio.
    const rapida = { ...ACT, daysPerUnit: 0.5 };
    const d = desviacionDeActividad(rapida, CINCO, [], null, SIN_FERIADOS, '2026-09-16');
    expect(d.diasDeAtraso).toBeCloseTo(d.diferencia * 0.5, 5);
  });

  it('al día no acusa atraso', () => {
    const progresos = [
      parte({ activityId: 'a', unitId: 'u0', date: '2026-09-14', progress: 1 }),
      parte({ activityId: 'a', unitId: 'u1', date: '2026-09-15', progress: 1 }),
      parte({ activityId: 'a', unitId: 'u2', date: '2026-09-16', progress: 1 }),
    ];
    const d = desviacionDeActividad(ACT, CINCO, progresos, null, SIN_FERIADOS, '2026-09-16');
    expect(d.diferencia).toBe(0);
  });

  it('adelantado da diferencia positiva', () => {
    const progresos = [
      parte({ activityId: 'a', unitId: 'u0', date: '2026-09-14', progress: 1 }),
      parte({ activityId: 'a', unitId: 'u1', date: '2026-09-14', progress: 1 }),
      parte({ activityId: 'a', unitId: 'u2', date: '2026-09-14', progress: 1 }),
    ];
    const d = desviacionDeActividad(ACT, CINCO, progresos, null, SIN_FERIADOS, '2026-09-14');
    expect(d.programadas).toBe(1);
    expect(d.diferencia).toBe(2);
  });

  it('cuenta los avances parciales como fracción', () => {
    const progresos = [parte({ activityId: 'a', unitId: 'u0', date: '2026-09-14', progress: 0.5 })];
    const d = desviacionDeActividad(ACT, CINCO, progresos, null, SIN_FERIADOS, '2026-09-14');
    expect(d.reales).toBe(0.5);
  });
});

describe('rendimientoPorResponsable', () => {
  it('agrupa por cuadrilla y divide unidades entre jornadas', () => {
    const actividades = [
      actividad({ id: 'a', responsibleName: 'PACAL' }),
      actividad({ id: 'b', responsibleName: 'ITCON', sortOrder: 1 }),
    ];
    const progresos = [
      parte({ activityId: 'a', unitId: 'u0', progress: 1, crewDays: 1 }),
      parte({ activityId: 'a', unitId: 'u1', progress: 1, crewDays: 1 }),
      parte({ activityId: 'b', unitId: 'u0', progress: 1, crewDays: 4 }),
    ];
    const r = rendimientoPorResponsable(actividades, CINCO, progresos);
    expect(r[0]).toMatchObject({ responsable: 'PACAL', unidades: 2, jornadas: 2, rendimiento: 1 });
    expect(r[1]).toMatchObject({ responsable: 'ITCON', jornadas: 4, rendimiento: 0.25 });
  });

  it('suma las actividades de una misma cuadrilla', () => {
    const actividades = [
      actividad({ id: 'a', responsibleName: 'PACAL' }),
      actividad({ id: 'b', responsibleName: 'pacal', sortOrder: 1 }),
    ];
    const r = rendimientoPorResponsable(actividades, CINCO, []);
    // El nombre se toma tal cual se escribió: son dos entradas distintas.
    expect(r).toHaveLength(2);
  });

  it('las cuadrillas sin jornadas van al final y no rinden cero', () => {
    const actividades = [
      actividad({ id: 'a', responsibleName: 'SIN DATOS' }),
      actividad({ id: 'b', responsibleName: 'PACAL', sortOrder: 1 }),
    ];
    const progresos = [parte({ activityId: 'b', unitId: 'u0', progress: 1, crewDays: 2 })];
    const r = rendimientoPorResponsable(actividades, CINCO, progresos);
    expect(r[0].responsable).toBe('PACAL');
    expect(r[1].rendimiento).toBeNull();
  });

  it('una actividad sin responsable no se pierde', () => {
    const r = rendimientoPorResponsable([actividad({ id: 'a' })], CINCO, []);
    expect(r[0].responsable).toBe('Sin asignar');
  });
});

describe('paretoDiario', () => {
  const progresos = [
    parte({ activityId: 'a', unitId: 'u0', date: '2026-09-14', progress: 0, causeCode: 'materiales' }),
    parte({ activityId: 'a', unitId: 'u1', date: '2026-09-15', progress: 0, causeCode: 'materiales' }),
    parte({ activityId: 'a', unitId: 'u2', date: '2026-09-15', progress: 0.5, causeCode: 'cancha' }),
    parte({ activityId: 'a', unitId: 'u3', date: '2026-09-15', progress: 1, causeCode: 'clima' }),
  ];

  it('ordena de lo que más frena a lo que menos', () => {
    const r = paretoDiario(progresos);
    expect(r.causas[0]).toMatchObject({ cause: 'materiales', cantidad: 2 });
    expect(r.causas[1]).toMatchObject({ cause: 'cancha', cantidad: 1 });
  });

  it('ignora las unidades que quedaron terminadas', () => {
    const r = paretoDiario(progresos);
    expect(r.causas.find((c) => c.cause === 'clima')).toBeUndefined();
  });

  it('cuenta cada día frenado, no cada unidad', () => {
    // El mismo depto frenado dos días son dos días de obra perdidos.
    const dosDias = [
      parte({ activityId: 'a', unitId: 'u0', date: '2026-09-14', progress: 0, causeCode: 'materiales' }),
      parte({ activityId: 'a', unitId: 'u0', date: '2026-09-15', progress: 0, causeCode: 'materiales' }),
    ];
    expect(paretoDiario(dosDias).causas[0].cantidad).toBe(2);
  });

  it('respeta el rango de fechas', () => {
    const r = paretoDiario(progresos, '2026-09-15', '2026-09-15');
    expect(r.total).toBe(2); // materiales y cancha del día 15
  });

  it('un parte en 0% sin causa se informa aparte, no se inventa una causa', () => {
    const r = paretoDiario([
      parte({ activityId: 'a', unitId: 'u0', date: '2026-09-14', progress: 0 }),
      parte({ activityId: 'a', unitId: 'u1', date: '2026-09-14', progress: 0, causeCode: 'clima' }),
    ]);
    expect(r.sinCausa).toBe(1);
    expect(r.total).toBe(2);
    expect(r.causas).toHaveLength(1);
  });

  it('un parte a medias sin causa no cuenta: pudo haber avanzado bien', () => {
    const r = paretoDiario([
      parte({ activityId: 'a', unitId: 'u0', date: '2026-09-14', progress: 0.5 }),
    ]);
    expect(r.sinCausa).toBe(0);
    expect(r.total).toBe(0);
  });

  it('los porcentajes suman 100', () => {
    const r = paretoDiario(progresos);
    const suma = r.causas.reduce((t, c) => t + c.porcentaje, 0);
    expect(suma).toBeCloseTo(100, 5);
  });
});

describe('serieDiaria', () => {
  it('calcula el avance de cada día por diferencia de acumulados', () => {
    const actividades = [actividad({ id: 'a' })];
    const progresos = [
      parte({ activityId: 'a', unitId: 'u0', date: '2026-09-14', progress: 1, crewDays: 2 }),
      parte({ activityId: 'a', unitId: 'u1', date: '2026-09-15', progress: 1, crewDays: 2 }),
    ];
    const serie = serieDiaria(progresos, actividades, CINCO, 3, '2026-09-15');
    expect(serie).toHaveLength(3);
    expect(claveDia(serie[2].fecha)).toBe('2026-09-15');
    expect(serie[2].unidades).toBe(1);
    expect(serie[2].jornadas).toBe(2);
  });

  it('una corrección de un parte viejo no se cuenta dos veces', () => {
    const actividades = [actividad({ id: 'a' })];
    const progresos = [
      parte({ activityId: 'a', unitId: 'u0', date: '2026-09-14', progress: 0.5 }),
      parte({ activityId: 'a', unitId: 'u0', date: '2026-09-15', progress: 1 }),
    ];
    const serie = serieDiaria(progresos, actividades, CINCO, 2, '2026-09-15');
    // El día 15 avanzó medio, no uno entero.
    expect(serie[1].unidades).toBe(0.5);
  });

  it('sin partes la serie es de ceros, no vacía', () => {
    const serie = serieDiaria([], [actividad({ id: 'a' })], CINCO, 5, '2026-09-15');
    expect(serie).toHaveLength(5);
    expect(serie.every((p) => p.unidades === 0)).toBe(true);
  });
});

describe('resumenDelTren', () => {
  const actividades = [
    actividad({ id: 'a', name: 'Yeso', startDate: '2026-09-14', daysPerUnit: 1 }),
    actividad({ id: 'b', name: 'Cerámica', startDate: '2026-09-14', daysPerUnit: 1, sortOrder: 1 }),
  ];

  it('suma el avance de todas las actividades', () => {
    const progresos = [
      parte({ activityId: 'a', unitId: 'u0', date: '2026-09-14', progress: 1 }),
      parte({ activityId: 'b', unitId: 'u0', date: '2026-09-14', progress: 1 }),
    ];
    const r = resumenDelTren(actividades, CINCO, progresos, null, SIN_FERIADOS, '2026-09-14');
    expect(r.total).toBe(10); // 2 actividades × 5 unidades
    expect(r.reales).toBe(2);
    expect(r.avance).toBeCloseTo(0.2, 5);
  });

  it('lista las atrasadas de la más atrasada a la menos', () => {
    const progresos = [
      parte({ activityId: 'b', unitId: 'u0', date: '2026-09-14', progress: 1 }),
      parte({ activityId: 'b', unitId: 'u1', date: '2026-09-15', progress: 1 }),
    ];
    const r = resumenDelTren(actividades, CINCO, progresos, null, SIN_FERIADOS, '2026-09-16');
    expect(r.atrasadas[0].actividad.id).toBe('a'); // sin ningún avance
  });

  it('un resto mínimo no marca la actividad en rojo', () => {
    // Media unidad de diferencia es el umbral: por debajo no cuenta.
    const progresos = [
      parte({ activityId: 'a', unitId: 'u0', date: '2026-09-14', progress: 0.8 }),
      parte({ activityId: 'b', unitId: 'u0', date: '2026-09-14', progress: 0.8 }),
    ];
    const r = resumenDelTren(actividades, CINCO, progresos, null, SIN_FERIADOS, '2026-09-14');
    expect(r.atrasadas).toHaveLength(0);
  });

  it('sin actividades no divide por cero', () => {
    const r = resumenDelTren([], CINCO, [], null, SIN_FERIADOS);
    expect(r).toMatchObject({ actividades: 0, avance: 0, total: 0 });
  });
});
