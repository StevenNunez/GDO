import { describe, it, expect } from 'vitest';
import {
  isBusinessDay,
  calculateDailySummary,
  computeMonthlyAttendance,
} from './attendance';
import { AttendanceLog } from '@/modules/core/lib/data';

/**
 * Calendario de referencia (enero 2026, verificado):
 *  - Jue 1  → feriado (01-01)
 *  - Lun 5  → día hábil normal (entrada 08:00, salida 18:00)
 *  - Vie 9  → viernes (salida 17:00)
 *  - Sáb 10 → sábado (jornada hasta 13:00; todo cuenta como extra)
 *  - Dom 11 → domingo (no hábil)
 * Los timestamps se construyen como Date locales para que las comparaciones
 * contra la jornada (parse 'HH:mm') queden en la misma zona horaria.
 */

/** Construye una marca con sólo los campos que usa el cálculo. */
function log(id: string, timestamp: Date, type: 'in' | 'out', userId = 'u1'): AttendanceLog {
  return {
    id,
    userId,
    userName: 'Trabajador',
    timestamp,
    type,
    method: 'manual',
    registrarId: 'admin',
    registrarName: 'Admin',
    date: '',
  } as AttendanceLog;
}

const at = (y: number, m: number, d: number, hh: number, mm = 0) => new Date(y, m - 1, d, hh, mm);

/* ── isBusinessDay ─────────────────────────────────────────────────────── */

describe('isBusinessDay', () => {
  it('el domingo no es hábil', () => {
    expect(isBusinessDay(new Date(2026, 0, 11))).toBe(false); // Dom 11
  });

  it('el sábado SÍ es hábil', () => {
    expect(isBusinessDay(new Date(2026, 0, 10))).toBe(true); // Sáb 10
  });

  it('un día de semana normal es hábil', () => {
    expect(isBusinessDay(new Date(2026, 0, 5))).toBe(true); // Lun 5
  });

  it('un feriado no es hábil aunque caiga en día de semana', () => {
    expect(isBusinessDay(new Date(2026, 0, 1))).toBe(false); // Jue 1 (01-01)
  });
});

/* ── calculateDailySummary: jornada normal ─────────────────────────────── */

describe('calculateDailySummary — día de semana', () => {
  const lunes = new Date(2026, 0, 5);

  it('jornada completa con colación descontada (4 marcas)', () => {
    const r = calculateDailySummary(
      [
        log('1', at(2026, 1, 5, 8, 0), 'in'),
        log('2', at(2026, 1, 5, 13, 0), 'out'),
        log('3', at(2026, 1, 5, 14, 0), 'in'),
        log('4', at(2026, 1, 5, 18, 0), 'out'),
      ],
      lunes,
    );
    expect(r.totalHours).toBe(9); // 5h mañana + 4h tarde
    expect(r.delayMinutes).toBe(0);
    expect(r.overtimeHours).toBe('00:00');
    expect(r.isAbsent).toBe(false);
  });

  it('una sola sesión que abarca la colación descuenta la hora (13:00–14:00)', () => {
    const r = calculateDailySummary(
      [log('1', at(2026, 1, 5, 8, 0), 'in'), log('2', at(2026, 1, 5, 18, 0), 'out')],
      lunes,
    );
    expect(r.totalHours).toBe(9); // 10h brutas − 1h colación
  });

  it('atraso: la primera marca después de las 08:00 cuenta los minutos', () => {
    const r = calculateDailySummary(
      [log('1', at(2026, 1, 5, 8, 30), 'in'), log('2', at(2026, 1, 5, 18, 0), 'out')],
      lunes,
    );
    expect(r.delayMinutes).toBe(30);
    expect(r.totalHours).toBe(8.5); // 9.5h − 1h colación
  });

  it('horas extra: la salida después de las 18:00 se acumula', () => {
    const r = calculateDailySummary(
      [log('1', at(2026, 1, 5, 8, 0), 'in'), log('2', at(2026, 1, 5, 20, 0), 'out')],
      lunes,
    );
    expect(r.overtimeHours).toBe('02:00'); // 18:00 → 20:00
    expect(r.totalHours).toBe(11); // 12h − 1h colación
  });

  it('sin atraso cuando marca justo a las 08:00', () => {
    const r = calculateDailySummary(
      [log('1', at(2026, 1, 5, 8, 0), 'in'), log('2', at(2026, 1, 5, 13, 0), 'out')],
      lunes,
    );
    expect(r.delayMinutes).toBe(0);
  });
});

/* ── viernes: salida a las 17:00 ───────────────────────────────────────── */

describe('calculateDailySummary — viernes', () => {
  it('el extra del viernes se mide contra las 17:00, no las 18:00', () => {
    const viernes = new Date(2026, 0, 9);
    const r = calculateDailySummary(
      [log('1', at(2026, 1, 9, 8, 0), 'in'), log('2', at(2026, 1, 9, 18, 0), 'out')],
      viernes,
    );
    expect(r.overtimeHours).toBe('01:00'); // 17:00 → 18:00
    expect(r.totalHours).toBe(9); // 10h − 1h colación
  });
});

/* ── sábado: toda la jornada es extra, sin colación ni atraso ──────────── */

describe('calculateDailySummary — sábado', () => {
  const sabado = new Date(2026, 0, 10);

  it('todo lo trabajado el sábado cuenta como hora extra', () => {
    const r = calculateDailySummary(
      [log('1', at(2026, 1, 10, 8, 0), 'in'), log('2', at(2026, 1, 10, 13, 0), 'out')],
      sabado,
    );
    expect(r.totalHours).toBe(5);
    expect(r.overtimeHours).toBe('05:00');
  });

  it('el sábado no genera atraso aunque llegue tarde', () => {
    const r = calculateDailySummary(
      [log('1', at(2026, 1, 10, 9, 30), 'in'), log('2', at(2026, 1, 10, 13, 0), 'out')],
      sabado,
    );
    expect(r.delayMinutes).toBe(0);
  });
});

/* ── ausencias y marcas incompletas ────────────────────────────────────── */

describe('calculateDailySummary — casos borde', () => {
  it('día hábil sin marcas → ausente', () => {
    const r = calculateDailySummary([], new Date(2026, 0, 5)); // Lun 5
    expect(r.isAbsent).toBe(true);
    expect(r.totalHours).toBe(0);
  });

  it('domingo sin marcas → no ausente (no es hábil)', () => {
    const r = calculateDailySummary([], new Date(2026, 0, 11)); // Dom 11
    expect(r.isAbsent).toBe(false);
    expect(r.totalHours).toBe(0);
  });

  it('sólo entrada sin salida → 0 horas (sesión sin pareja)', () => {
    const r = calculateDailySummary([log('1', at(2026, 1, 5, 8, 0), 'in')], new Date(2026, 0, 5));
    expect(r.totalHours).toBe(0);
    expect(r.isAbsent).toBe(false);
  });

  it('marcas desordenadas se ordenan por hora antes de calcular', () => {
    const r = calculateDailySummary(
      [log('2', at(2026, 1, 5, 18, 0), 'out'), log('1', at(2026, 1, 5, 8, 0), 'in')],
      new Date(2026, 0, 5),
    );
    expect(r.totalHours).toBe(9);
  });
});

/* ── computeMonthlyAttendance: agregación del mes ──────────────────────── */

describe('computeMonthlyAttendance', () => {
  it('enero 2026 tiene 26 días hábiles (31 − 4 domingos − 1 feriado 01-01)', () => {
    const r = computeMonthlyAttendance([], 'u1', 2026, 1);
    expect(r.summary.totalBusinessDays).toBe(26);
    expect(r.summary.workedDays).toBe(0);
    expect(r.summary.absentDays).toBe(26);
  });

  it('agrega horas trabajadas, extras y días de dos jornadas', () => {
    const logs: AttendanceLog[] = [
      // Lun 5: 08:00–18:00 con colación → 9h, sin extra
      log('a', at(2026, 1, 5, 8, 0), 'in'),
      log('b', at(2026, 1, 5, 13, 0), 'out'),
      log('c', at(2026, 1, 5, 14, 0), 'in'),
      log('d', at(2026, 1, 5, 18, 0), 'out'),
      // Mar 6: 08:00–20:00 → 11h, 2h extra
      log('e', at(2026, 1, 6, 8, 0), 'in'),
      log('f', at(2026, 1, 6, 20, 0), 'out'),
    ];
    const r = computeMonthlyAttendance(logs, 'u1', 2026, 1);
    expect(r.summary.workedDays).toBe(2);
    expect(r.summary.absentDays).toBe(24); // 26 hábiles − 2 trabajados
    expect(r.summary.totalWorkedHours).toBe('20:00'); // 9h + 11h
    expect(r.summary.totalOvertimeHours).toBe('02:00');
    expect(r.summary.totalOvertimeHoursNumber).toBe(2);
    expect(r.summary.totalDelayMinutes).toBe(0);
  });

  it('ignora marcas de otro trabajador y de otro mes', () => {
    const logs: AttendanceLog[] = [
      log('a', at(2026, 1, 5, 8, 0), 'in'),
      log('b', at(2026, 1, 5, 18, 0), 'out'),
      // otro usuario, mismo día
      log('x', at(2026, 1, 5, 8, 0), 'in', 'otro'),
      log('y', at(2026, 1, 5, 18, 0), 'out', 'otro'),
      // mismo usuario, febrero
      log('z1', at(2026, 2, 3, 8, 0), 'in'),
      log('z2', at(2026, 2, 3, 18, 0), 'out'),
    ];
    const r = computeMonthlyAttendance(logs, 'u1', 2026, 1);
    expect(r.summary.workedDays).toBe(1);
    expect(r.summary.totalWorkedHours).toBe('9:00');
  });
});
