import { describe, expect, it } from 'vitest';
import type { EquipmentRental } from '@/modules/core/lib/data';
import {
  arriendosAtrasados, costoAcumulado, costoProyectado, diasDeArriendo,
  imputacionesDeArriendo, resumenArriendos, sobrecosto, unidadesFacturables,
  validarArriendo,
} from './equipment';

const HOY = new Date(2026, 7, 20); // 20 de agosto de 2026

function arriendo(over: Partial<EquipmentRental> = {}): EquipmentRental {
  return {
    id: crypto.randomUUID(),
    tenantId: 't1',
    projectId: 'p1',
    supplierId: 'sup1',
    supplierName: 'Arriendos del Norte',
    name: 'Grúa torre',
    code: 'GT-01',
    category: 'grua',
    rateMode: 'dia',
    rate: 200_000,
    currency: 'CLP',
    hoursPerDay: null,
    minimumUnits: null,
    startDate: '2026-08-01' as unknown as Date,
    endDate: '2026-08-30' as unknown as Date,
    returnedAt: null,
    workItemId: 'wi-1',
    status: 'activo',
    notes: null,
    createdBy: 'u1',
    createdAt: new Date(2026, 7, 1),
    ...over,
  };
}

/* ── Días ──────────────────────────────────────────────────────────────── */

describe('diasDeArriendo', () => {
  it('cuenta el primer día', () => {
    // Del 1 al 20 son 20 días de arriendo, no 19.
    expect(diasDeArriendo(arriendo(), HOY)).toBe(20);
  });

  it('un equipo que entra y sale el mismo día costó un día', () => {
    const r = arriendo({
      startDate: '2026-08-10' as unknown as Date,
      returnedAt: '2026-08-10' as unknown as Date,
    });
    expect(diasDeArriendo(r, HOY)).toBe(1);
  });

  it('deja de contar al devolverlo', () => {
    const r = arriendo({ returnedAt: '2026-08-10' as unknown as Date });
    expect(diasDeArriendo(r, HOY)).toBe(10);
  });

  it('sigue contando mientras no se devuelva', () => {
    const a = diasDeArriendo(arriendo(), '2026-08-20');
    const b = diasDeArriendo(arriendo(), '2026-08-25');
    expect(b).toBeGreaterThan(a);
  });

  it('no cuenta antes de que empiece', () => {
    expect(diasDeArriendo(arriendo(), '2026-07-20')).toBe(0);
  });

  it('lee el string YYYY-MM-DD sin correrse un día', () => {
    const r = arriendo({ startDate: '2026-08-01' as unknown as Date });
    expect(diasDeArriendo(r, '2026-08-01')).toBe(1);
  });
});

/* ── Unidades facturables ──────────────────────────────────────────────── */

describe('unidadesFacturables', () => {
  it('por día, una unidad por día', () => {
    expect(unidadesFacturables(arriendo(), HOY)).toBe(20);
  });

  it('por semana, redondea hacia arriba: empezada la semana se cobra entera', () => {
    // 20 días = 2,86 semanas → 3.
    expect(unidadesFacturables(arriendo({ rateMode: 'semana' }), HOY)).toBe(3);
  });

  it('por mes, el mes comercial son 30 días', () => {
    expect(unidadesFacturables(arriendo({ rateMode: 'mes' }), HOY)).toBe(1);
    expect(unidadesFacturables(
      arriendo({ rateMode: 'mes', startDate: '2026-06-01' as unknown as Date }), HOY,
    )).toBe(3); // 81 días → 2,7 → 3
  });

  it('por hora, multiplica por la jornada pactada', () => {
    const r = arriendo({ rateMode: 'hora', hoursPerDay: 8 });
    expect(unidadesFacturables(r, HOY)).toBe(160); // 20 días × 8
  });

  it('por hora sin jornada da 0 en vez de suponer 8', () => {
    // Suponerla inventaría el costo.
    const r = arriendo({ rateMode: 'hora', hoursPerDay: null });
    expect(unidadesFacturables(r, HOY)).toBe(0);
  });

  it('respeta el mínimo facturable pactado', () => {
    const r = arriendo({
      rateMode: 'dia', minimumUnits: 30,
      returnedAt: '2026-08-05' as unknown as Date,
    });
    expect(unidadesFacturables(r, HOY)).toBe(30); // usó 5 días, se cobran 30
  });
});

/* ── Costo ─────────────────────────────────────────────────────────────── */

describe('costoAcumulado', () => {
  it('tarifa por unidades transcurridas', () => {
    expect(costoAcumulado(arriendo(), HOY)).toBe(4_000_000); // 20 × 200.000
  });

  it('un arriendo cancelado no cuesta', () => {
    expect(costoAcumulado(arriendo({ status: 'cancelado' }), HOY)).toBe(0);
  });

  it('un arriendo devuelto se congela en su costo final', () => {
    const r = arriendo({ returnedAt: '2026-08-10' as unknown as Date, status: 'devuelto' });
    expect(costoAcumulado(r, '2026-08-20')).toBe(2_000_000);
    expect(costoAcumulado(r, '2026-12-20')).toBe(2_000_000);
  });
});

describe('costoProyectado', () => {
  it('proyecta hasta la fecha programada', () => {
    // 1 al 30 de agosto = 30 días.
    expect(costoProyectado(arriendo())).toBe(6_000_000);
  });

  it('un arriendo sin fecha de término no se proyecta', () => {
    // Poner un número sería peor que no ponerlo.
    expect(costoProyectado(arriendo({ endDate: null }))).toBeNull();
  });
});

describe('sobrecosto', () => {
  it('positivo cuando ya cuesta más de lo previsto', () => {
    const r = arriendo({ endDate: '2026-08-10' as unknown as Date });
    // Proyectado 10 días = 2.000.000; van 20 días = 4.000.000.
    expect(sobrecosto(r, HOY)).toBe(2_000_000);
  });

  it('negativo mientras va dentro de lo previsto', () => {
    expect(sobrecosto(arriendo(), HOY)).toBe(-2_000_000);
  });

  it('null sin fecha de término', () => {
    expect(sobrecosto(arriendo({ endDate: null }), HOY)).toBeNull();
  });
});

/* ── El aviso ──────────────────────────────────────────────────────────── */

describe('arriendosAtrasados', () => {
  it('detecta el equipo que pasó su fecha y sigue en obra', () => {
    const r = arriendo({ endDate: '2026-08-10' as unknown as Date });
    const a = arriendosAtrasados([r], HOY);
    expect(a).toHaveLength(1);
    expect(a[0].diasDeMas).toBe(10);
    expect(a[0].costoDeMas).toBe(2_000_000);
  });

  it('no reporta el que ya se devolvió', () => {
    const r = arriendo({
      endDate: '2026-08-10' as unknown as Date,
      returnedAt: '2026-08-09' as unknown as Date,
      status: 'devuelto',
    });
    expect(arriendosAtrasados([r], HOY)).toEqual([]);
  });

  it('no reporta el que va dentro de plazo', () => {
    expect(arriendosAtrasados([arriendo()], HOY)).toEqual([]);
  });

  it('no reporta arriendos sin fecha de término', () => {
    expect(arriendosAtrasados([arriendo({ endDate: null })], HOY)).toEqual([]);
  });

  it('ordena por costo de más, no por antigüedad', () => {
    // Tres días de grúa duelen más que tres semanas de contenedor.
    const grua = arriendo({
      name: 'Grúa', rate: 200_000, endDate: '2026-08-17' as unknown as Date,
    });
    const contenedor = arriendo({
      name: 'Contenedor', category: 'contenedor', rate: 10_000,
      endDate: '2026-07-30' as unknown as Date,
    });
    const a = arriendosAtrasados([contenedor, grua], HOY);
    expect(a[0].rental.name).toBe('Grúa');
  });
});

/* ── Resumen ───────────────────────────────────────────────────────────── */

describe('resumenArriendos', () => {
  it('cuenta activos, devueltos y lo que cuestan', () => {
    const r = resumenArriendos([
      arriendo({ id: 'a' }),
      arriendo({ id: 'b', returnedAt: '2026-08-10' as unknown as Date, status: 'devuelto' }),
      arriendo({ id: 'c', status: 'cancelado' }),
    ], HOY);

    expect(r.activos).toBe(1);
    expect(r.devueltos).toBe(1);
    expect(r.costoAcumulado).toBe(6_000_000); // 4M + 2M; el cancelado no suma
  });

  it('agrupa por categoría, de mayor a menor costo', () => {
    const r = resumenArriendos([
      arriendo({ id: 'a', category: 'grua', rate: 200_000 }),
      arriendo({ id: 'b', category: 'contenedor', rate: 10_000 }),
    ], HOY);
    expect(r.porCategoria[0].categoria).toBe('grua');
    expect(r.porCategoria[0].label).toBe('Grúa');
  });

  it('suma lo que están costando de más los atrasados', () => {
    const r = resumenArriendos([
      arriendo({ endDate: '2026-08-10' as unknown as Date }),
    ], HOY);
    expect(r.atrasados).toBe(1);
    expect(r.costoDeMas).toBe(2_000_000);
  });

  it('no revienta sin arriendos', () => {
    expect(resumenArriendos([], HOY)).toMatchObject({
      activos: 0, costoAcumulado: 0, atrasados: 0,
    });
  });
});

/* ── Enlace con control de costos ──────────────────────────────────────── */

describe('imputacionesDeArriendo', () => {
  it('entrega el costo por partida', () => {
    const i = imputacionesDeArriendo([arriendo({ workItemId: 'wi-1' })], HOY);
    expect(i).toEqual([{ workItemId: 'wi-1', amount: 4_000_000 }]);
  });

  it('los sin partida quedan bajo null, apartados pero visibles', () => {
    const i = imputacionesDeArriendo([arriendo({ workItemId: null })], HOY);
    expect(i[0].workItemId).toBeNull();
  });

  it('deja fuera los cancelados y los que no han costado nada', () => {
    const i = imputacionesDeArriendo([
      arriendo({ status: 'cancelado' }),
      arriendo({ startDate: '2026-12-01' as unknown as Date }),
    ], HOY);
    expect(i).toEqual([]);
  });
});

/* ── Validación ────────────────────────────────────────────────────────── */

describe('validarArriendo', () => {
  it('acepta un arriendo bien cargado', () => {
    expect(validarArriendo({
      name: 'Grúa', rate: 200_000, rateMode: 'dia', hoursPerDay: null,
      startDate: '2026-08-01' as unknown as Date,
      endDate: '2026-08-30' as unknown as Date,
    })).toEqual([]);
  });

  it('exige nombre y tarifa', () => {
    const e = validarArriendo({
      name: '  ', rate: 0, rateMode: 'dia', hoursPerDay: null,
      startDate: '2026-08-01' as unknown as Date, endDate: null,
    });
    expect(e).toHaveLength(2);
  });

  it('con tarifa por hora exige la jornada', () => {
    const e = validarArriendo({
      name: 'Grúa', rate: 30_000, rateMode: 'hora', hoursPerDay: null,
      startDate: '2026-08-01' as unknown as Date, endDate: null,
    });
    expect(e.some((x) => x.includes('horas por jornada'))).toBe(true);
  });

  it('no acepta término anterior al inicio', () => {
    const e = validarArriendo({
      name: 'Grúa', rate: 1000, rateMode: 'dia', hoursPerDay: null,
      startDate: '2026-08-30' as unknown as Date,
      endDate: '2026-08-01' as unknown as Date,
    });
    expect(e.some((x) => x.includes('anterior'))).toBe(true);
  });
});
