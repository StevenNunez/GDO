import { describe, expect, it } from 'vitest';
import type { ProgressLog, WorkItem } from '@/modules/core/lib/data';
import {
  construirCurvaS, costoRealA, fraccionPlanificada, indicadoresEV, leerCpi,
  leerSpi, semaforo, valorGanadoA, valorPartida, valorPlanificadoA,
} from './curva-s';

/* ── Fábricas ──────────────────────────────────────────────────────────── */

function partida(over: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 'w1', tenantId: 't1', projectId: 'p1', budgetId: null,
    name: 'Partida', type: 'task', status: 'in-progress',
    parentId: null, path: '01', progress: 0,
    plannedStartDate: '2026-08-01' as unknown as Date,
    plannedEndDate: '2026-08-31' as unknown as Date,
    unit: 'm2', quantity: 100, unitPrice: 10_000,
    ...over,
  } as WorkItem;
}

function avance(over: Partial<ProgressLog> = {}): ProgressLog {
  return {
    id: crypto.randomUUID(), tenantId: 't1', workItemId: 'w1',
    date: '2026-08-10' as unknown as Date, quantity: 10,
    userId: 'u1', userName: 'Pedro',
    ...over,
  } as ProgressLog;
}

/* ── Fracción planificada ──────────────────────────────────────────────── */

describe('fraccionPlanificada', () => {
  const p = partida();

  it('es 0 antes de la fecha de inicio', () => {
    expect(fraccionPlanificada(p, '2026-07-20')).toBe(0);
  });

  it('es 1 en la fecha de término y después', () => {
    expect(fraccionPlanificada(p, '2026-08-31')).toBe(1);
    expect(fraccionPlanificada(p, '2026-09-15')).toBe(1);
  });

  it('reparte linealmente en el medio', () => {
    // 1 al 31 de agosto = 30 días de plazo. El 16 son 15 días: la mitad.
    expect(fraccionPlanificada(p, '2026-08-16')).toBeCloseTo(0.5, 5);
  });

  it('una partida de un solo día vale 1 desde su fecha', () => {
    // Sin esto, dividir por un plazo de cero días daría infinito.
    const dia = partida({
      plannedStartDate: '2026-08-10' as unknown as Date,
      plannedEndDate: '2026-08-10' as unknown as Date,
    });
    expect(fraccionPlanificada(dia, '2026-08-10')).toBe(1);
    expect(fraccionPlanificada(dia, '2026-08-09')).toBe(0);
  });

  it('sin fechas programadas devuelve null, que NO es lo mismo que 0', () => {
    // Contarla como 0 haría aparecer un atraso que no existe.
    expect(fraccionPlanificada(partida({ plannedStartDate: null }), '2026-08-16')).toBeNull();
    expect(fraccionPlanificada(partida({ plannedEndDate: null }), '2026-08-16')).toBeNull();
  });

  it('lee el string YYYY-MM-DD sin correrse un día', () => {
    expect(fraccionPlanificada(p, '2026-08-01')).toBe(0);
  });
});

/* ── Valor planificado ─────────────────────────────────────────────────── */

describe('valorPlanificadoA', () => {
  it('suma la parte proporcional de cada partida', () => {
    const items = [
      partida({ id: 'a', quantity: 100, unitPrice: 10_000 }),  // 1.000.000
      partida({ id: 'b', quantity: 50, unitPrice: 20_000 }),   // 1.000.000
    ];
    // A media obra: la mitad de 2.000.000.
    expect(valorPlanificadoA(items, '2026-08-16').pv).toBeCloseTo(1_000_000, 0);
  });

  it('NO suma las fases: su valor ya está en las partidas', () => {
    const items = [
      partida({ id: 'fase', type: 'phase', parentId: null, quantity: 1, unitPrice: 5_000_000 }),
      partida({ id: 'h1', parentId: 'fase', quantity: 100, unitPrice: 10_000 }),
    ];
    // Solo la hoja: 1.000.000 completo al término.
    expect(valorPlanificadoA(items, '2026-09-30').pv).toBe(1_000_000);
  });

  it('deja fuera las partidas sin programa y lo reporta', () => {
    const items = [
      partida({ id: 'a' }),
      partida({ id: 'b', plannedStartDate: null, quantity: 30, unitPrice: 10_000 }),
    ];
    const r = valorPlanificadoA(items, '2026-09-30');
    expect(r.pv).toBe(1_000_000);
    expect(r.sinProgramar).toBe(1);
    expect(r.valorSinProgramar).toBe(300_000);
  });
});

/* ── Valor ganado ──────────────────────────────────────────────────────── */

describe('valorGanadoA', () => {
  const items = [partida()];

  it('valoriza la cantidad ejecutada al precio de la partida', () => {
    const logs = [avance({ quantity: 40, date: '2026-08-05' as unknown as Date })];
    expect(valorGanadoA(items, logs, '2026-08-10')).toBe(400_000);
  });

  it('no cuenta avances posteriores a la fecha de corte', () => {
    const logs = [
      avance({ quantity: 20, date: '2026-08-05' as unknown as Date }),
      avance({ quantity: 30, date: '2026-08-25' as unknown as Date }),
    ];
    expect(valorGanadoA(items, logs, '2026-08-10')).toBe(200_000);
  });

  it('cuenta el avance del mismo día del corte', () => {
    const logs = [avance({ quantity: 10, date: '2026-08-10' as unknown as Date })];
    expect(valorGanadoA(items, logs, '2026-08-10')).toBe(100_000);
  });

  it('se topa en la cantidad contratada', () => {
    // Avanzar más de lo contratado es un aumento de obra: se cobra por adenda,
    // no inflando la curva.
    const logs = [avance({ quantity: 150 })];
    expect(valorGanadoA(items, logs, '2026-08-31')).toBe(1_000_000);
  });

  it('ignora avances de partidas que no existen', () => {
    const logs = [avance({ workItemId: 'fantasma', quantity: 99 })];
    expect(valorGanadoA(items, logs, '2026-08-31')).toBe(0);
  });

  it('sin avances, cero', () => {
    expect(valorGanadoA(items, [], '2026-08-31')).toBe(0);
  });
});

/* ── Costo real ────────────────────────────────────────────────────────── */

describe('costoRealA', () => {
  it('suma lo gastado hasta el corte', () => {
    const gastos = [
      { fecha: '2026-08-03', amount: 300_000 },
      { fecha: '2026-08-20', amount: 500_000 },
    ];
    expect(costoRealA(gastos, '2026-08-10')).toBe(300_000);
    expect(costoRealA(gastos, '2026-08-31')).toBe(800_000);
  });

  it('sin gastos, cero', () => {
    expect(costoRealA([], '2026-08-10')).toBe(0);
  });
});

/* ── La curva ──────────────────────────────────────────────────────────── */

describe('construirCurvaS', () => {
  const items = [partida()];
  const logs = [avance({ quantity: 30, date: '2026-08-05' as unknown as Date })];
  const gastos = [{ fecha: '2026-08-05', amount: 350_000 }];

  it('genera puntos cada `pasoDias`', () => {
    const c = construirCurvaS(items, logs, gastos, {
      desde: '2026-08-01', hasta: '2026-08-29', pasoDias: 7,
    });
    // 1, 8, 15, 22, 29 → cinco puntos.
    expect(c.puntos).toHaveLength(5);
  });

  it('el último punto es siempre la fecha pedida, aunque no caiga en el paso', () => {
    // Sin esto el gráfico terminaría antes y parecería que la obra se detuvo.
    const c = construirCurvaS(items, logs, gastos, {
      desde: '2026-08-01', hasta: '2026-08-31', pasoDias: 7,
    });
    const ultimo = c.puntos[c.puntos.length - 1];
    expect(ultimo.fecha.getDate()).toBe(31);
  });

  it('entrega el BAC y los porcentajes sobre él', () => {
    const c = construirCurvaS(items, logs, gastos, {
      desde: '2026-08-01', hasta: '2026-08-31', pasoDias: 30,
    });
    expect(c.bac).toBe(1_000_000);
    const fin = c.puntos[c.puntos.length - 1];
    expect(fin.pvPct).toBe(100);
    expect(fin.evPct).toBe(30);
    expect(fin.acPct).toBe(35);
  });

  it('devuelve vacío si el rango está al revés', () => {
    const c = construirCurvaS(items, logs, gastos, {
      desde: '2026-08-31', hasta: '2026-08-01',
    });
    expect(c.puntos).toEqual([]);
    expect(c.bac).toBe(1_000_000);
  });

  it('avisa cuánta obra queda fuera de la curva por no tener programa', () => {
    const conHuerfana = [...items, partida({ id: 'x', plannedEndDate: null, quantity: 20, unitPrice: 10_000 })];
    const c = construirCurvaS(conHuerfana, logs, gastos, {
      desde: '2026-08-01', hasta: '2026-08-31',
    });
    expect(c.sinProgramar).toBe(1);
    expect(c.valorSinProgramar).toBe(200_000);
  });

  it('un paso de 0 no cuelga el cálculo', () => {
    const c = construirCurvaS(items, logs, gastos, {
      desde: '2026-08-01', hasta: '2026-08-05', pasoDias: 0,
    });
    expect(c.puntos.length).toBeGreaterThan(0);
    expect(c.puntos.length).toBeLessThan(10);
  });
});

/* ── Índices ───────────────────────────────────────────────────────────── */

describe('indicadoresEV', () => {
  it('SPI bajo 1 cuando se ejecutó menos de lo programado', () => {
    const r = indicadoresEV({ pv: 1_000_000, ev: 800_000, ac: 900_000, bac: 5_000_000 });
    expect(r.spi).toBe(0.8);
    expect(r.sv).toBe(-200_000);
  });

  it('CPI bajo 1 cuando se gastó más de lo que vale lo hecho', () => {
    const r = indicadoresEV({ pv: 1_000_000, ev: 800_000, ac: 1_000_000, bac: 5_000_000 });
    expect(r.cpi).toBe(0.8);
    expect(r.cv).toBe(-200_000);
  });

  it('proyecta el costo final con el CPI acumulado', () => {
    const r = indicadoresEV({ pv: 1_000_000, ev: 800_000, ac: 1_000_000, bac: 5_000_000 });
    expect(r.eac).toBe(6_250_000);       // 5.000.000 / 0,8
    expect(r.etc).toBe(5_250_000);       // lo que falta gastar
    expect(r.vac).toBe(-1_250_000);      // se va a pasar del presupuesto
  });

  it('sin nada planificado no inventa un SPI', () => {
    const r = indicadoresEV({ pv: 0, ev: 0, ac: 0, bac: 1_000_000 });
    expect(r.spi).toBeNull();
    expect(r.cpi).toBeNull();
    expect(r.eac).toBeNull();
  });

  it('sin costo imputado no proyecta el costo final', () => {
    const r = indicadoresEV({ pv: 1_000_000, ev: 900_000, ac: 0, bac: 5_000_000 });
    expect(r.spi).toBe(0.9);
    expect(r.cpi).toBeNull();
    expect(r.eac).toBeNull();
    expect(r.vac).toBeNull();
  });
});

describe('semaforo', () => {
  it('bajo 0,90 es crítico', () => {
    expect(semaforo(0.85)).toBe('critico');
  });

  it('entre 0,90 y 0,95 es atención', () => {
    expect(semaforo(0.92)).toBe('atencion');
  });

  it('desde 0,95 va bien', () => {
    expect(semaforo(0.95)).toBe('bien');
    expect(semaforo(1.2)).toBe('bien');
  });

  it('sin índice, sin datos', () => {
    expect(semaforo(null)).toBe('sin_datos');
  });
});

describe('lectura en palabras', () => {
  it('explica el atraso en porcentaje', () => {
    expect(leerSpi(0.8)).toContain('20%');
  });

  it('dice que va al día cuando el SPI llega a 1', () => {
    expect(leerSpi(1)).toContain('al día');
  });

  it('explica el sobrecosto', () => {
    expect(leerCpi(0.8)).toContain('25%'); // 1/0,8 − 1
  });

  it('no inventa una lectura sin datos', () => {
    expect(leerSpi(null)).toContain('Sin programa');
    expect(leerCpi(null)).toContain('costo imputado');
  });
});

describe('valorPartida', () => {
  it('multiplica cantidad por precio', () => {
    expect(valorPartida({ quantity: 12, unitPrice: 2_500 })).toBe(30_000);
  });

  it('tolera campos vacíos', () => {
    expect(valorPartida({ quantity: 0, unitPrice: 0 })).toBe(0);
  });
});
