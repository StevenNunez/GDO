/**
 * Lógica pura de cálculo de asistencia mensual a partir de los marcajes
 * (entradas/salidas). Vivía dentro del hook `useMonthlyAttendance`
 * (`src/modules/core/hooks/use-attendance.ts`), atada a `useState`/`useEffect`,
 * lo que hacía imposible testearla. Está acá, sin React ni acceso a datos, para
 * poder cubrirla con tests; el hook ahora sólo la llama.
 *
 * Depende de la jornada definida en `WORK_SCHEDULE` y de los feriados chilenos.
 * Reglas actuales (se documentan tal cual las calcula la app, no se cambian):
 *  - Día hábil = cualquier día menos domingo y feriado (el sábado ES hábil).
 *  - Atraso: sólo en días hábiles que no sean sábado, si la primera marca es
 *    posterior a la hora de entrada.
 *  - Colación (13:00–14:00) se descuenta de las sesiones que la solapan.
 *  - Horas extra entre semana: lo que la última salida exceda la hora de salida.
 *  - Sábado: toda la jornada trabajada se considera hora extra y no se descuenta
 *    colación (la jornada del sábado termina a las 13:00).
 */

import { toDate } from '@/lib/date-utils';
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameDay,
  format,
  parse,
  max,
  min,
  isSaturday,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { AttendanceLog, WORK_SCHEDULE } from '@/modules/core/lib/data';

/** Feriados chilenos como 'MM-dd' (irrelevante el año). */
export const HOLIDAYS: string[] = [
  '01-01', '05-01', '05-21', '06-29', '07-16', '08-15',
  '09-18', '09-19', '10-12', '10-31', '11-01', '12-08', '12-25',
];

/** Una marca ya resuelta a Date, con la hora formateada para mostrar. Conserva
 *  todos los campos del log (modifiedAt, originalTimestamp, etc.) para que las
 *  pantallas que editan marcas los tengan a mano. */
export type DailyEntry = AttendanceLog & { time: string; dateObj: Date };

export interface DailySummary {
  date: string;
  dayName: string;
  /** El `Date` del día (útil para crear/editar marcas sobre esa fecha). */
  dayDate: Date;
  isBusinessDay: boolean;
  entries: DailyEntry[];
  totalHours: number;
  delayMinutes: number;
  overtimeHours: string;
  isAbsent: boolean;
}

export interface MonthlyAttendanceReport {
  period: { start: Date; end: Date };
  dailySummaries: DailySummary[];
  summary: {
    totalBusinessDays: number;
    workedDays: number;
    absentDays: number;
    totalWorkedHours: string;
    totalOvertimeHours: string;
    totalOvertimeHoursNumber: number;
    totalDelayMinutes: number;
  };
}

/** Un día es hábil si no es domingo ni feriado. El sábado es hábil. */
export function isBusinessDay(day: Date): boolean {
  const dayOfWeek = getDay(day);
  if (dayOfWeek === 0) return false; // Domingo
  const formattedDate = format(day, 'MM-dd');
  if (HOLIDAYS.includes(formattedDate)) return false;
  return true;
}

/**
 * Calcula el resumen de un día a partir de sus marcas (ya filtradas a ese día).
 * `logs` no necesita venir ordenado.
 */
export function calculateDailySummary(logs: AttendanceLog[], day: Date): DailySummary {
  const dayIsBusiness = isBusinessDay(day);
  const dayIsSaturday = isSaturday(day);
  const isFriday = getDay(day) === 5;

  const entries = logs
    .map((l) => ({
      ...l,
      dateObj: toDate(l.timestamp) || new Date(l.timestamp),
    }))
    .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

  if (entries.length === 0) {
    return {
      date: format(day, 'dd/MM/yyyy'),
      dayName: format(day, 'EEEE', { locale: es }),
      dayDate: day,
      isBusinessDay: dayIsBusiness,
      entries: [],
      totalHours: 0,
      overtimeHours: '00:00',
      delayMinutes: 0,
      isAbsent: dayIsBusiness,
    };
  }

  const schedule = dayIsSaturday
    ? WORK_SCHEDULE.saturday
    : isFriday
    ? WORK_SCHEDULE.friday
    : WORK_SCHEDULE.weekdays;
  const startWorkTime = parse(schedule.start, 'HH:mm', day);
  const endWorkTime = parse(schedule.end, 'HH:mm', day);
  const lunchStartTime = parse(WORK_SCHEDULE.lunchBreak.start, 'HH:mm', day);
  const lunchEndTime = parse(WORK_SCHEDULE.lunchBreak.end, 'HH:mm', day);

  let totalMillis = 0;
  let delayMinutes = 0;
  let overtimeMillis = 0;

  if (dayIsBusiness && !dayIsSaturday && entries[0].dateObj > startWorkTime) {
    delayMinutes = Math.round((entries[0].dateObj.getTime() - startWorkTime.getTime()) / 60000);
  }

  const sessionPairs: [Date, Date][] = [];
  for (let i = 0; i < entries.length - 1; i += 2) {
    if (entries[i].type === 'in' && entries[i + 1]?.type === 'out') {
      sessionPairs.push([entries[i].dateObj, entries[i + 1].dateObj]);
    }
  }

  sessionPairs.forEach(([start, end]) => {
    let sessionMillis = end.getTime() - start.getTime();

    const lunchOverlapStart = max([start, lunchStartTime]);
    const lunchOverlapEnd = min([end, lunchEndTime]);
    const lunchOverlap = Math.max(0, lunchOverlapEnd.getTime() - lunchOverlapStart.getTime());

    sessionMillis -= lunchOverlap;
    totalMillis += sessionMillis;
  });

  const lastOut = entries.filter((e) => e.type === 'out').pop()?.dateObj;
  if (lastOut && lastOut > endWorkTime) {
    overtimeMillis = lastOut.getTime() - endWorkTime.getTime();
  }

  if (dayIsSaturday) {
    totalMillis = (sessionPairs[0]?.[1].getTime() ?? 0) - (sessionPairs[0]?.[0].getTime() ?? 0);
    overtimeMillis = totalMillis;
  }

  const totalHours = totalMillis / (1000 * 60 * 60);
  const overtimeHours = Math.floor(overtimeMillis / (1000 * 60 * 60));
  const overtimeMinutes = Math.floor((overtimeMillis % (1000 * 60 * 60)) / (1000 * 60));

  return {
    date: format(day, 'dd/MM/yyyy'),
    dayName: format(day, 'EEEE', { locale: es }),
    dayDate: day,
    isBusinessDay: dayIsBusiness,
    entries: entries.map((e) => ({ ...e, time: format(e.dateObj, 'HH:mm') })),
    totalHours: Math.max(0, totalHours),
    overtimeHours: `${String(overtimeHours).padStart(2, '0')}:${String(overtimeMinutes).padStart(2, '0')}`,
    delayMinutes: Math.max(0, delayMinutes),
    isAbsent: false,
  };
}

/**
 * Arma el reporte mensual completo de un trabajador: filtra sus marcas del mes,
 * calcula el resumen de cada día y agrega los totales.
 *
 * @param month 1–12 (no índice; enero = 1).
 */
export function computeMonthlyAttendance(
  attendanceLogs: AttendanceLog[],
  userId: string,
  year: number,
  month: number,
): MonthlyAttendanceReport {
  const start = startOfMonth(new Date(year, month - 1));
  const end = endOfMonth(new Date(year, month - 1));
  const monthDays = eachDayOfInterval({ start, end });

  const userLogs = (attendanceLogs || []).filter((log) => {
    if (log.userId !== userId) return false;
    const logDate = toDate(log.timestamp) || new Date(log.timestamp);
    return logDate >= start && logDate <= end;
  });

  const dailySummaries = monthDays.map((day) => {
    const logsForDay = userLogs.filter((log) => {
      const logDate = toDate(log.timestamp) || new Date(log.timestamp);
      return isSameDay(logDate, day);
    });
    return calculateDailySummary(logsForDay, day);
  });

  const totalBusinessDays = monthDays.filter((day) => isBusinessDay(day)).length;
  const workedDays = dailySummaries.filter((d) => !d.isAbsent && d.totalHours > 0).length;
  const absentDays = totalBusinessDays - workedDays;
  const totalWorkedMinutes = dailySummaries.reduce((acc, day) => acc + day.totalHours * 60, 0);
  const totalWorkedHours = `${Math.floor(totalWorkedMinutes / 60)}:${String(
    Math.round(totalWorkedMinutes % 60),
  ).padStart(2, '0')}`;

  const totalOvertimeMillis = dailySummaries.reduce((acc, day) => {
    const [hours, minutes] = day.overtimeHours.split(':').map(Number);
    return acc + hours * 60 * 60 * 1000 + minutes * 60 * 1000;
  }, 0);

  const totalOvertimeHours = Math.floor(totalOvertimeMillis / (1000 * 60 * 60));
  const totalOvertimeMinutes = Math.floor((totalOvertimeMillis % (1000 * 60 * 60)) / (1000 * 60));
  const totalOvertimeFormatted = `${String(totalOvertimeHours).padStart(2, '0')}:${String(
    totalOvertimeMinutes,
  ).padStart(2, '0')}`;
  const totalOvertimeHoursNumber = totalOvertimeMillis / (1000 * 60 * 60);

  const totalDelayMinutes = dailySummaries.reduce((acc, day) => acc + day.delayMinutes, 0);

  return {
    period: { start, end },
    dailySummaries,
    summary: {
      totalBusinessDays,
      workedDays,
      absentDays,
      totalWorkedHours,
      totalOvertimeHours: totalOvertimeFormatted,
      totalOvertimeHoursNumber,
      totalDelayMinutes,
    },
  };
}
