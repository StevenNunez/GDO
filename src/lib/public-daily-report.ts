import type { DailyProgress, DailyReportToken, TrainActivity, WorkCalendarException, WorkUnit } from '@/modules/core/lib/data';
import { avanceVigente, pendientesDeHoy } from '@/lib/daily-report';
import { claveDia, indexarExcepciones } from '@/lib/work-calendar';

/** End of the chosen calendar day in Chile, including winter/summer clock changes. */
export function finDelDiaEnChile(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || claveDia(day) !== day) throw new Error('Fecha del parte no válida.');
  const probe = new Date(`${day}T12:00:00Z`);
  const zone = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', timeZoneName: 'shortOffset' });
  const offset = zone.formatToParts(probe).find(p => p.type === 'timeZoneName')?.value.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!offset) throw new Error('No se pudo calcular el cierre del día.');
  const minutes = (offset[1] === '+' ? 1 : -1) * (Number(offset[2]) * 60 + Number(offset[3] ?? 0));
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date, 23, 59, 59) - minutes * 60_000).toISOString();
}

export function tokenVigente(token: Pick<DailyReportToken, 'expiresAt' | 'validFor'>, now = new Date()): boolean {
  const expiry = new Date(token.expiresAt).getTime();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return Number.isFinite(expiry) && expiry > now.getTime() && claveDia(token.validFor) === today;
}

/** The same allowlist drives the public read, public write, and local demo. */
export function unidadesDelParte(
  access: Pick<DailyReportToken, 'tenantId' | 'projectId' | 'activityId' | 'validFor'>,
  activity: TrainActivity,
  units: WorkUnit[],
  reports: DailyProgress[],
  exceptions: WorkCalendarException[],
  workDays?: number[] | null,
) {
  if (activity.id !== access.activityId || activity.projectId !== access.projectId || activity.tenantId !== access.tenantId || activity.status !== 'activa') return [];
  const day = claveDia(access.validFor);
  const scopedUnits = units.filter(u => u.projectId === access.projectId && u.tenantId === access.tenantId && u.status === 'activa');
  const history = reports.filter(p => p.activityId === activity.id && p.projectId === access.projectId && p.tenantId === access.tenantId && claveDia(p.date) <= day);
  return pendientesDeHoy(activity, scopedUnits, avanceVigente(history), history, day, workDays,
    indexarExcepciones(exceptions.filter(e => e.tenantId === access.tenantId), access.projectId))
    .map(({ unidad, avance, atrasada, reportadaHoy }) => ({ unitId: unidad.id, name: unidad.name, groupName: unidad.groupName ?? null, avance, atrasada, reportadaHoy }));
}
