import { describe, it, expect } from 'vitest';
import {
  computeLiquidacion,
  computeFiniquito,
  TOPE_GRATIFICACION_MENSUAL,
} from './payroll';

/* ── Liquidación de sueldo ────────────────────────────────────────────── */

describe('computeLiquidacion', () => {
  it('liquidación básica con gratificación legal bajo el tope', () => {
    // Sueldo 500.000 · gratificación 25% = 125.000 (bajo el tope)
    // Imponible 625.000 · AFP 10,77% + Salud 7% + Cesantía 0,6%
    const r = computeLiquidacion({
      sueldoBase: 500_000,
      afpPercent: 10.77,
      saludPercent: 7,
      cesantiaPercent: 0.6,
    });
    expect(r.gratificacion).toBe(125_000);
    expect(r.totalImponible).toBe(625_000);
    expect(r.descuentoAfp).toBeCloseTo(67_312.5, 2);
    expect(r.descuentoSalud).toBeCloseTo(43_750, 2);
    expect(r.descuentoCesantia).toBeCloseTo(3_750, 2);
    expect(r.descuentosLegales).toBeCloseTo(114_812.5, 2);
    expect(r.liquido).toBeCloseTo(510_187.5, 2);
  });

  it('la gratificación legal se topa (Art. 50)', () => {
    // 25% de 1.000.000 = 250.000, pero el tope mensual manda.
    const r = computeLiquidacion({ sueldoBase: 1_000_000 });
    expect(r.gratificacion).toBeCloseTo(TOPE_GRATIFICACION_MENSUAL, 6);
    expect(r.gratificacion).toBeLessThan(250_000);
  });

  it('una gratificación manual reemplaza a la legal', () => {
    const r = computeLiquidacion({ sueldoBase: 1_000_000, gratificacionManual: 40_000 });
    expect(r.gratificacion).toBe(40_000);
    expect(r.totalImponible).toBe(1_040_000);
  });

  it('horas extra con el valor legal (valor hora × 1,5)', () => {
    // 360.000 / 180 = 2.000 la hora normal → 3.000 la extra.
    const r = computeLiquidacion({ sueldoBase: 360_000, overtimeHours: 10 });
    expect(r.valorHoraExtra).toBe(3_000);
    expect(r.overtimePay).toBe(30_000);
  });

  it('un valor de hora extra pactado tiene prioridad sobre el legal', () => {
    const r = computeLiquidacion({ sueldoBase: 360_000, overtimeHours: 10, valorHoraExtraManual: 5_000 });
    expect(r.valorHoraExtra).toBe(5_000);
    expect(r.overtimePay).toBe(50_000);
  });

  it('los haberes no imponibles NO cotizan pero sí suman al líquido', () => {
    // Movilización/colación entran a los haberes pero no a la base de cotización.
    const r = computeLiquidacion({
      sueldoBase: 500_000,
      gratificacionManual: 0,
      noImponible: 80_000,
      afpPercent: 10,
    });
    expect(r.totalImponible).toBe(500_000); // sin los 80.000 no imponibles
    expect(r.descuentoAfp).toBe(50_000); // 10% de 500.000, no de 580.000
    expect(r.totalHaberes).toBe(580_000);
    expect(r.liquido).toBe(530_000);
  });

  it('los otros descuentos (anticipo/adelanto) se restan al final', () => {
    const r = computeLiquidacion({
      sueldoBase: 500_000,
      gratificacionManual: 0,
      otrosDescuentos: 100_000,
    });
    expect(r.descuentosLegales).toBe(0);
    expect(r.totalDescuentos).toBe(100_000);
    expect(r.liquido).toBe(400_000);
  });

  it('reproduce la estimación del trabajador (adelanto incluido)', () => {
    // Mismo caso que la pantalla del trabajador: 500k + adelanto de 50k.
    const r = computeLiquidacion({
      sueldoBase: 500_000,
      afpPercent: 10.77,
      saludPercent: 7,
      cesantiaPercent: 0.6,
      otrosDescuentos: 50_000,
    });
    expect(r.liquido).toBeCloseTo(460_187.5, 2); // 510.187,5 − 50.000
  });

  it('entradas vacías dan todo en cero, sin NaN', () => {
    const r = computeLiquidacion({ sueldoBase: 0 });
    expect(r.totalImponible).toBe(0);
    expect(r.liquido).toBe(0);
    expect(Number.isNaN(r.liquido)).toBe(false);
  });
});

/* ── Finiquito ────────────────────────────────────────────────────────── */

describe('computeFiniquito', () => {
  const base = {
    lastSalary: 600_000,
    startDate: new Date(2021, 0, 1),
    endDate: new Date(2024, 0, 1), // 3 años exactos
    noticeGiven: false,
    vacationDaysTaken: 0,
  } as const;

  it('necesidades de la empresa sin aviso: años + sustitutiva + feriado', () => {
    const r = computeFiniquito({ ...base, terminationCause: 'necesidades_empresa' });
    expect(r.yearsForIndemnity).toBe(3);
    expect(r.indemnityPerYear).toBe(1_800_000); // 600.000 × 3
    expect(r.noticeIndemnity).toBe(600_000); // no se dio aviso
    expect(r.vacationPay).toBeCloseTo(900_821.92, 1);
    expect(r.totalSeverance).toBeCloseTo(3_300_821.92, 1);
  });

  it('si se dio el aviso previo, no se paga la indemnización sustitutiva', () => {
    const r = computeFiniquito({ ...base, terminationCause: 'necesidades_empresa', noticeGiven: true });
    expect(r.indemnityPerYear).toBe(1_800_000);
    expect(r.noticeIndemnity).toBe(0);
  });

  it('renuncia: no hay indemnización por años ni sustitutiva, solo feriado', () => {
    const r = computeFiniquito({ ...base, terminationCause: 'renuncia' });
    expect(r.indemnityPerYear).toBe(0);
    expect(r.noticeIndemnity).toBe(0);
    expect(r.totalSeverance).toBeCloseTo(r.vacationPay, 6);
    expect(r.vacationPay).toBeGreaterThan(0);
  });

  it('una fracción de 6 meses o más se cuenta como un año completo', () => {
    const r = computeFiniquito({
      ...base,
      startDate: new Date(2021, 0, 1),
      endDate: new Date(2023, 7, 1), // 2 años y 7 meses → 3
      terminationCause: 'necesidades_empresa',
    });
    expect(r.yearsForIndemnity).toBe(3);
  });

  it('una fracción menor a 6 meses no redondea hacia arriba', () => {
    const r = computeFiniquito({
      ...base,
      startDate: new Date(2021, 0, 1),
      endDate: new Date(2023, 3, 1), // 2 años y 3 meses → 2
      terminationCause: 'necesidades_empresa',
    });
    expect(r.yearsForIndemnity).toBe(2);
  });

  it('la indemnización por años se topa en 11 (Art. 163)', () => {
    const r = computeFiniquito({
      ...base,
      startDate: new Date(2000, 0, 1),
      endDate: new Date(2020, 0, 1), // 20 años
      terminationCause: 'necesidades_empresa',
    });
    expect(r.yearsForIndemnity).toBe(11);
    expect(r.indemnityPerYear).toBe(600_000 * 11);
  });

  it('el feriado proporcional descuenta los días ya tomados', () => {
    const r = computeFiniquito({
      lastSalary: 600_000,
      startDate: new Date(2023, 0, 1),
      endDate: new Date(2024, 0, 1),
      terminationCause: 'renuncia',
      noticeGiven: false,
      vacationDaysTaken: 5,
    });
    expect(r.pendingVacationDays).toBeCloseTo(10.0411, 3);
    expect(r.vacationPay).toBeCloseTo(200_821.92, 1);
  });

  it('el feriado proporcional nunca es negativo', () => {
    const r = computeFiniquito({
      ...base,
      terminationCause: 'renuncia',
      vacationDaysTaken: 100, // más de lo devengado
    });
    expect(r.pendingVacationDays).toBe(0);
    expect(r.vacationPay).toBe(0);
  });

  it('un sueldo inválido no produce NaN', () => {
    const r = computeFiniquito({ ...base, lastSalary: NaN, terminationCause: 'necesidades_empresa' });
    expect(Number.isNaN(r.totalSeverance)).toBe(false);
    expect(r.totalSeverance).toBe(0);
  });
});
